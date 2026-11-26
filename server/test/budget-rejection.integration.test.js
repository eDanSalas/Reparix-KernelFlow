import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { startBudgetFixture } from './fixtures/budget.js';

const pendingState = 'Pendiente de autorización';
const repairState = 'En reparación';
const channel = 'WhatsApp';
const evidence = 'El cliente rechazó por escrito el importe comunicado.';

async function prepareRejection(t, options) {
  const fixture = await startBudgetFixture(options);
  t.after(() => fixture.close());
  const { order, route, first, current } = await fixture.prepareOrder(t.name.split(' ')[0]);
  await fixture.post(route + '/budget-communications', fixture.rec, { presupuestoId: current.id });
  return {
    fixture, order, route, first, current,
    payload: { presupuestoId: current.id, canal: channel, evidencia: evidence },
  };
}

async function snapshot(owner, orderId) {
  const { rows: [saved] } = await owner.query(`
    SELECT to_jsonb(o) AS "order",
      ARRAY(SELECT to_jsonb(h) FROM reparix.order_history h WHERE h.order_id=o.id ORDER BY h.id) AS history,
      ARRAY(SELECT to_jsonb(c) FROM reparix.budget_rejection_channels c
        JOIN reparix.order_history h ON h.id=c.history_id WHERE h.order_id=o.id ORDER BY c.history_id) AS channels
    FROM reparix.orders o WHERE o.id=$1`, [orderId]);
  return saved;
}

async function databaseTime(owner) {
  const { rows: [{ now }] } = await owner.query('SELECT clock_timestamp() AS now');
  return now.getTime();
}

test('HU02-01 El rechazo completo queda en historial, bloquea reparación y conserva la custodia', async t => {
  const manager = { id: randomUUID(), name: 'Responsable del taller', role: 'administrador' };
  const { fixture, order, route, first, current, payload } = await prepareRejection(t, {
    extraUsers: { responsable: manager },
  });
  const { owner, rec, tech, call, login, users } = fixture;
  const rejectionRoute = route + '/budget-rejections';
  const before = await snapshot(owner, order.id);
  for (const field of ['presupuestoId', 'canal', 'evidencia']) {
    const incomplete = await call(rejectionRoute, rec, { ...payload, [field]: undefined });
    assert.equal(incomplete.status, 422, `La solicitud de rechazo requiere ${field}.`);
  }
  assert.equal((await call(rejectionRoute, rec, { ...payload, presupuestoId: first.id })).status, 409);
  assert.equal((await call(rejectionRoute, tech, payload)).status, 403);
  assert.deepEqual(await snapshot(owner, order.id), before, 'Una solicitud inválida debe conservar la orden y su historial.');

  const start = await databaseTime(owner);
  const rejected = await call(rejectionRoute, rec, payload);
  const end = await databaseTime(owner);
  assert.equal(rejected.status, 201, rejected.body.message);
  assert.equal(rejected.body.budgetRejected, true);

  const saved = await snapshot(owner, order.id);
  const added = saved.history.filter(event => !before.history.some(previous => previous.id === event.id));
  assert.equal(added.length, 1, 'El rechazo debe agregar únicamente su decisión al historial.');
  const [event] = added;
  assert.equal(event.field, 'rechazo_presupuesto');
  assert.equal(event.order_id, order.id);
  assert.equal(event.new_value, current.id, 'El rechazo debe corresponder a la revisión vigente.');
  assert.equal(event.note, evidence);
  assert.equal(event.actor_id, users.recepcion.id, 'El responsable debe ser el usuario autenticado.');
  assert.deepEqual(saved.channels, [{ history_id: event.id, channel }]);
  const recordedAt = Date.parse(event.changed_at);
  assert.ok(recordedAt >= start && recordedAt <= end, 'El historial debe guardar la fecha y hora del registro.');
  assert.deepEqual(saved.history.filter(entry => entry.id !== event.id), before.history);
  assert.deepEqual(saved.order, before.order, 'El rechazo debe conservar la orden bajo custodia, sin entrega ni devolución.');
  assert.equal((await call(rejectionRoute, rec, payload)).status, 409);
  assert.deepEqual(await snapshot(owner, order.id), saved, 'Un reintento debe conservar una sola decisión.');

  const managerSession = await login('responsable');
  const state = await call(route + '/state', managerSession);
  assert.equal(state.status, 200, state.body.message);
  assert.equal(state.body.state, pendingState);
  assert.equal(state.body.authorizationRecorded, false);
  assert.ok(!state.body.allowedTransitions.includes(repairState));
  const repair = await call(route + '/state', managerSession, {
    state: repairState,
    expectedVersion: state.body.orderVersion,
    note: 'Intento de iniciar la reparación después del rechazo',
  });
  assert.equal(repair.status, 409, 'Un rechazo vigente debe impedir que un responsable inicie la reparación.');
  await assert.rejects(owner.query('UPDATE reparix.orders SET state=$1 WHERE id=$2', [repairState, order.id]), {
    code: '23514',
  });
  assert.deepEqual(await snapshot(owner, order.id), saved, 'El intento bloqueado debe conservar la orden y su historial.');

  const freshSession = await login('recepcion');
  const read = await call(route + '/assessments', freshSession);
  assert.equal(read.status, 200, read.body.message);
  assert.equal(read.body.currentAssessment.id, current.id);
  assert.equal(read.body.currentAssessment.revision, current.revision);
  assert.equal(read.body.rejection.evidence, evidence);
  assert.equal(read.body.rejection.authorName, users.recepcion.name);
  assert.equal(Date.parse(read.body.rejection.recordedAt), recordedAt);
  assert.equal(read.body.rejection.channel, channel, 'El rechazo persistido debe conservar el canal de comunicación.');
  assert.deepEqual(read.body.rejections, [{
    id: event.id, assessmentId: current.id, revision: current.revision, channel, evidence,
    authorId: users.recepcion.id, authorName: users.recepcion.name, recordedAt: new Date(recordedAt).toISOString(),
  }]);
});

test('HU02-05 El historial conserva el rechazo cuando cambia la revisión vigente', async t => {
  const fixture = await startBudgetFixture();
  t.after(() => fixture.close());
  const { order, route, first, current } = await fixture.prepareOrder('HU02-05', { moveToPending: false });
  const { owner, rec, tech, call, post } = fixture;
  const rejectionRoute = route + '/budget-rejections';
  const payload = { presupuestoId: current.id, canal: channel, evidencia: evidence };
  const before = await snapshot(owner, order.id);

  assert.equal((await call(rejectionRoute, rec, payload)).status, 409);
  assert.deepEqual(await snapshot(owner, order.id), before);
  await post(route + '/budget-communications', rec, { presupuestoId: current.id });
  const rejected = await post(rejectionRoute, rec, payload);
  const [decision] = rejected.rejections;

  const updated = await post(route + '/assessments', tech, {
    diagnosis: first.diagnosis, proposedWork: first.proposedWork, amount: first.amount,
    currency: first.currency, note: 'Nueva revisión del presupuesto', expectedVersion: rejected.orderVersion,
  });
  assert.notEqual(updated.currentAssessment.id, current.id);
  assert.equal(updated.rejections, undefined, 'El técnico solo consulta el estado de autorización.');

  const read = await call(route + '/assessments', rec);
  assert.equal(read.status, 200);
  assert.equal(read.body.budgetRejected, false);
  assert.equal(read.body.rejection, null);
  assert.deepEqual(read.body.rejections, [decision]);
});

test('HU02-06 Si falla la escritura del canal se revierte el evento de rechazo', async t => {
  const { fixture, order, route, payload } = await prepareRejection(t, { logger: { error() {} } });
  const { owner, rec, call } = fixture;
  const before = await snapshot(owner, order.id);
  await owner.query('REVOKE INSERT ON reparix.budget_rejection_channels FROM reparix_app');

  assert.equal((await call(route + '/budget-rejections', rec, payload)).status, 500);
  assert.deepEqual(await snapshot(owner, order.id), before);
});
