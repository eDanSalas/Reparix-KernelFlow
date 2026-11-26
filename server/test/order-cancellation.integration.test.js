import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { demoAcceptance, startBudgetFixture } from './fixtures/budget.js';

const diagnosisState = 'En diagnóstico';
const cancelledState = 'Cancelado';
const reason = 'El cliente solicitó cancelar el servicio antes de iniciar la reparación.';

async function setup(t, options) {
  const fixture = await startBudgetFixture(options);
  t.after(() => fixture.close());
  const label = t.name.split(' ')[0];
  const { order, route, current } = await fixture.prepareOrder(label, { moveToPending: false });
  return { ...fixture, order, route, current, cancellationRoute: route + '/cancellations' };
}

async function snapshot(owner, orderId) {
  const { rows: [saved] } = await owner.query(`
    SELECT to_jsonb(o) AS "order",
      ARRAY(SELECT to_jsonb(h) FROM reparix.order_history h WHERE h.order_id=o.id ORDER BY h.id) AS history,
      ARRAY(SELECT to_jsonb(d) FROM reparix.order_deliveries d WHERE d.order_id=o.id) AS deliveries,
      ARRAY(SELECT to_jsonb(a) FROM reparix.order_assignments a WHERE a.order_id=o.id ORDER BY a.id) AS assignments,
      ARRAY(SELECT to_jsonb(a) FROM reparix.order_assessments a WHERE a.order_id=o.id ORDER BY a.id) AS assessments
    FROM reparix.orders o WHERE o.id=$1`, [orderId]);
  assert.ok(saved, 'La orden debe seguir registrada en PostgreSQL.');
  return saved;
}

async function databaseTime(owner) {
  const { rows: [{ now }] } = await owner.query('SELECT clock_timestamp() AS now');
  return now.getTime();
}

test('HU08-01 Recepción cancela con motivo y conserva el equipo bajo custodia', async t => {
  const { order, route, current, cancellationRoute, owner, call, login, rec, tech, users } = await setup(t);
  const before = await snapshot(owner, order.id);
  assert.equal(before.order.state, diagnosisState);
  assert.equal((await call(route + '/state', rec)).body.canCancel, true);
  assert.equal((await call(route + '/state', tech)).body.canCancel, false);

  const start = await databaseTime(owner);
  const response = await call(cancellationRoute, rec, { motivo: reason, expectedVersion: before.order.version_lock });
  assert.equal(response.status, 201, 'La API debe devolver HTTP 201 al cancelar una orden habilitada con un motivo válido.');
  assert.equal(response.body.canCancel, false);
  assert.deepEqual(response.body.allowedTransitions, []);
  const end = await databaseTime(owner);

  const saved = await snapshot(owner, order.id);
  assert.equal(saved.order.state, cancelledState, 'La orden debe quedar en Cancelado.');
  assert.equal(saved.order.version_lock, before.order.version_lock + 1);
  const added = saved.history.filter(event => !before.history.some(previous => previous.id === event.id));
  assert.equal(added.length, 1, 'La cancelación solo debe agregar su cambio de estado al historial.');
  const [event] = added;
  assert.equal(event.field, 'estado');
  assert.equal(event.previous_value, diagnosisState);
  assert.equal(event.new_value, cancelledState);
  assert.equal(event.note, reason, 'El historial debe conservar el motivo de la cancelación.');
  assert.equal(event.actor_id, users.recepcion.id, 'El historial debe identificar al usuario que canceló la orden.');
  assert.equal(saved.order.state_changed_by, event.actor_id);
  assert.equal(saved.order.state_changed_at, event.changed_at);
  const changedAt = Date.parse(event.changed_at);
  assert.ok(changedAt >= start && changedAt <= end, 'El historial debe registrar la fecha y hora de la cancelación.');
  assert.deepEqual(saved.history.filter(entry => entry.id !== event.id), before.history);
  for (const key of ['deliveries', 'assessments', 'assignments']) assert.deepEqual(saved[key], before[key]);
  assert.deepEqual(saved.deliveries, []);
  assert.deepEqual(saved.order, {
    ...before.order, state: cancelledState, version_lock: before.order.version_lock + 1,
    state_changed_at: event.changed_at, state_changed_by: event.actor_id,
  });

  const freshReception = await login('recepcion');
  const read = await call(route, freshReception);
  assert.equal(read.status, 200, read.body.message);
  assert.equal(read.body.order.state, cancelledState);
  const movement = read.body.order.history.at(-1);
  assert.equal(movement.newValue, cancelledState);
  assert.equal(movement.note, reason);
  assert.equal(movement.author, users.recepcion.name);
  assert.equal(Date.parse(movement.changedAt), changedAt);

  for (const [suffix, session, body, headers] of [
    ['/budget-communications', rec, { presupuestoId: current.id }],
    ['/budget-acceptances', rec, { presupuestoId: current.id, ...demoAcceptance }],
    ['/state', tech, { state: 'Pendiente de autorización', expectedVersion: saved.order.version_lock, note: reason }],
    ['/deliveries', rec, { receptor: 'Persona de prueba', evidencia: 'Acuse sintético', expectedVersion: saved.order.version_lock }, { 'Idempotency-Key': randomUUID() }],
  ]) {
    assert.equal((await call(route + suffix, session, body, headers)).status, 409);
  }
  assert.deepEqual(await snapshot(owner, order.id), saved);
});

test('HU08-02 La API exige un motivo y conserva la orden y su historial', async t => {
  const { order, cancellationRoute, owner, call, rec } = await setup(t);
  const before = await snapshot(owner, order.id);
  for (const [motivo, description] of [[undefined, 'se omite'], ['', 'está vacío'], [' \t ', 'solo contiene espacios']]) {
    const response = await call(cancellationRoute, rec, { motivo, expectedVersion: before.order.version_lock });
    assert.equal(response.status, 422, `La API debe devolver HTTP 422 si el motivo ${description}.`);
    assert.deepEqual(await snapshot(owner, order.id), before, 'Una cancelación sin motivo válido debe dejar intactos los datos.');
  }
});

test('HU08-03 El técnico asignado no puede cancelar una orden', async t => {
  const { order, cancellationRoute, owner, call, tech } = await setup(t);
  const before = await snapshot(owner, order.id);
  const response = await call(cancellationRoute, tech, { motivo: reason, expectedVersion: before.order.version_lock });
  assert.equal(response.status, 403, 'La API debe devolver HTTP 403 si un técnico intenta cancelar una orden.');
  assert.deepEqual(await snapshot(owner, order.id), before, 'Un intento sin permiso debe dejar intactos los datos.');
});

test('HU08-04 La API rechaza una nueva cancelación de una orden ya cancelada', async t => {
  const { order, cancellationRoute, owner, call, rec } = await setup(t);
  const before = await snapshot(owner, order.id);
  const first = await call(cancellationRoute, rec, { motivo: reason, expectedVersion: before.order.version_lock });
  assert.equal(first.status, 201, 'La API debe registrar la primera cancelación antes de rechazar un nuevo intento.');

  const cancelled = await snapshot(owner, order.id);
  assert.equal(cancelled.order.state, cancelledState);
  const second = await call(cancellationRoute, rec, {
    motivo: 'Motivo distinto para un segundo intento de cancelación.', expectedVersion: cancelled.order.version_lock,
  });
  assert.equal(second.status, 409, 'La API debe devolver HTTP 409 si la orden ya está cancelada.');
  assert.deepEqual(await snapshot(owner, order.id), cancelled, 'Una cancelación incompatible debe dejar intactos los datos.');
});

test('HU08-05 La cancelación con versión obsoleta o en reparación conserva los datos', async t => {
  const administrator = { id: randomUUID(), name: 'Responsable del taller HU-08', role: 'administrador' };
  const { order, route, current, cancellationRoute, owner, call, login, post, rec, tech } = await setup(t, {
    extraUsers: { administrador: administrator },
  });
  const before = await snapshot(owner, order.id);
  const stale = await call(cancellationRoute, rec, { motivo: reason, expectedVersion: before.order.version_lock - 1 });
  assert.equal(stale.status, 409);
  assert.equal(stale.body.conflict.currentVersion, before.order.version_lock);
  assert.deepEqual(await snapshot(owner, order.id), before);

  const pending = await post(route + '/state', tech, {
    state: 'Pendiente de autorización', expectedVersion: before.order.version_lock, note: 'Diagnóstico completado',
  });
  await post(route + '/budget-communications', rec, { presupuestoId: current.id });
  await post(route + '/budget-acceptances', rec, { presupuestoId: current.id, ...demoAcceptance });
  const admin = await login('administrador');
  const repair = await post(route + '/state', admin, {
    state: 'En reparación', expectedVersion: pending.orderVersion, note: 'Reparación autorizada',
  });
  const repairing = await snapshot(owner, order.id);
  assert.equal(repair.canCancel, false);
  assert.equal((await call(cancellationRoute, rec, { motivo: reason, expectedVersion: repair.orderVersion })).status, 409);
  assert.deepEqual(await snapshot(owner, order.id), repairing);
});

test('HU08-06 Si falla el historial, la cancelación se revierte completa', async t => {
  const { order, cancellationRoute, owner, call, rec } = await setup(t, { logger: { error() {} } });
  const before = await snapshot(owner, order.id);
  await owner.query(`ALTER TABLE reparix.order_history
    ADD CONSTRAINT simulate_cancellation_history_failure CHECK (new_value <> 'Cancelado') NOT VALID`);
  const response = await call(cancellationRoute, rec, { motivo: reason, expectedVersion: before.order.version_lock });
  assert.equal(response.status, 500);
  assert.deepEqual(await snapshot(owner, order.id), before);
});
