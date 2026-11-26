import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { demoAcceptance, startBudgetFixture } from './fixtures/budget.js';

const diagnosisState = 'En diagnóstico';
const repairState = 'En reparación';
const readyState = 'Listo para recoger';
const deliveredState = 'Entregado';
const confirmation = {
  receptor: 'Persona receptora de prueba',
  evidencia: 'Acuse firmado de entrega física HU-07',
};

async function setup(t, { inDiagnosis = false, extraUsers = {}, logger } = {}) {
  const administrator = { id: randomUUID(), name: 'Responsable de taller HU-07', role: 'administrador' };
  const fixture = await startBudgetFixture({ logger, extraUsers: { administrador: administrator, ...extraUsers } });
  t.after(() => fixture.close());
  const admin = await fixture.login('administrador');
  const { order, route, current, pending } = await fixture.prepareOrder(t.name.split(' ')[0], {
    moveToPending: !inDiagnosis,
  });

  if (!inDiagnosis) {
    const revision = { presupuestoId: current.id };
    await fixture.post(route + '/budget-communications', fixture.rec, revision);
    await fixture.post(route + '/budget-acceptances', fixture.rec, { ...revision, ...demoAcceptance });
    await fixture.post(route + '/state', admin, {
      state: repairState, expectedVersion: pending.orderVersion, note: 'Inicio de reparación HU-07',
    });
  }

  return { ...fixture, admin, order, route, deliveriesRoute: route + '/deliveries' };
}

async function readDeliveries(call, deliveriesRoute, session) {
  const response = await call(deliveriesRoute, session);
  assert.equal(response.status, 200, 'Recepción debe poder consultar las entregas registradas de la orden.');
  assert.ok(Array.isArray(response.body.deliveries), 'La consulta debe devolver una lista de entregas.');
  return response.body.deliveries;
}

async function markReady({ owner, order, route, post, tech }) {
  const before = await snapshot(owner, order.id);
  const result = await post(route + '/repair-completions', tech, {
    state: readyState, expectedVersion: before.version, note: 'Reparación terminada y equipo listo para recoger',
  });
  assert.equal(result.state, readyState);
  assert.equal(result.orderVersion, before.version + 1);
}

async function snapshot(owner, orderId) {
  const { rows: [saved] } = await owner.query(`
    SELECT o.state,o.version_lock AS version,
      ARRAY(SELECT to_jsonb(h) FROM reparix.order_history h WHERE h.order_id=o.id ORDER BY h.id) AS history
    FROM reparix.orders o WHERE o.id=$1`, [orderId]);
  assert.ok(saved, 'La orden debe seguir registrada.');
  return saved;
}

async function databaseTime(owner) {
  const { rows: [{ now }] } = await owner.query('SELECT clock_timestamp() AS now');
  return now.getTime();
}

function assertDelivered(before, after, actorId) {
  assert.equal(after.state, deliveredState, 'La confirmación debe cambiar la orden a Entregado.');
  assert.equal(after.version, before.version + 1, 'La entrega debe incrementar una sola vez la versión de la orden.');
  const added = after.history.filter(event => !before.history.some(previous => previous.id === event.id));
  assert.equal(added.length, 1, 'La confirmación debe agregar un solo movimiento al historial.');
  const [movement] = added;
  assert.equal(movement.field, 'estado');
  assert.equal(movement.previous_value, readyState);
  assert.equal(movement.new_value, deliveredState);
  assert.equal(movement.actor_id, actorId, 'El movimiento debe identificar a quien confirmó la entrega.');
  assert.deepEqual(after.history.filter(event => event.id !== movement.id), before.history);
  return movement;
}

test('HU07-01 Recepción confirma la entrega y conserva sus datos y movimiento', async t => {
  const fixture = await setup(t);
  const { owner, order, call, deliveriesRoute, rec, tech, login, users } = fixture;
  assert.deepEqual(await readDeliveries(call, deliveriesRoute, rec), []);
  await markReady(fixture);
  const before = await snapshot(owner, order.id);
  const payload = { ...confirmation, expectedVersion: before.version };

  const denied = await call(deliveriesRoute, tech, payload, { 'Idempotency-Key': randomUUID() });
  assert.equal(denied.status, 403, 'Un técnico no puede confirmar una entrega física.');
  assert.deepEqual(await snapshot(owner, order.id), before);
  assert.deepEqual(await readDeliveries(call, deliveriesRoute, rec), []);
  await assert.rejects(owner.query("UPDATE reparix.orders SET state='Entregado' WHERE id=$1", [order.id]), { code: '23514' });

  const start = await databaseTime(owner);
  const result = await call(deliveriesRoute, rec, payload, { 'Idempotency-Key': randomUUID() });
  assert.equal(result.status, 201, 'La API debe devolver HTTP 201 al confirmar una entrega autorizada.');
  const end = await databaseTime(owner);
  const movement = assertDelivered(before, await snapshot(owner, order.id), users.recepcion.id);

  const freshReception = await login('recepcion');
  const deliveries = await readDeliveries(call, deliveriesRoute, freshReception);
  assert.equal(deliveries.length, 1, 'Debe conservarse una entrega consultable después de iniciar otra sesión.');
  const [delivery] = deliveries;
  assert.ok(delivery.id, 'La entrega debe tener un identificador propio.');
  assert.equal(delivery.receptor, confirmation.receptor);
  assert.equal(delivery.evidencia, confirmation.evidencia);
  assert.equal(delivery.actorId, users.recepcion.id, 'La entrega debe guardar el identificador de recepción.');
  assert.equal(delivery.actorName, users.recepcion.name);
  const recordedAt = Date.parse(delivery.recordedAt);
  assert.ok(recordedAt >= start && recordedAt <= end, 'La entrega debe guardar la fecha y hora de confirmación.');
  assert.equal(Date.parse(movement.changed_at), recordedAt);
});

for (const [id, state] of [['HU07-02', diagnosisState], ['HU07-03', repairState]]) {
  test(`${id} La API impide confirmar la entrega cuando la orden está ${state.toLowerCase()}`, async t => {
    const { call, deliveriesRoute, order, owner, rec, route, tech } = await setup(t, { inDiagnosis: state === diagnosisState });
    const before = await snapshot(owner, order.id);
    assert.equal(before.state, state);

    const result = await call(deliveriesRoute, rec, { ...confirmation, expectedVersion: before.version }, {
      'Idempotency-Key': randomUUID(),
    });
    assert.equal(result.status, 409, `La API debe devolver HTTP 409 al intentar entregar una orden en estado «${state}».`);
    assert.deepEqual(await snapshot(owner, order.id), before, 'Una salida rechazada debe conservar la orden y su historial.');
    assert.deepEqual(await readDeliveries(call, deliveriesRoute, rec), [], 'Una salida rechazada no debe registrar una entrega.');
    if (state === diagnosisState) {
      const premature = await call(route + '/repair-completions', tech, {
        state: readyState, expectedVersion: before.version, note: 'Solicitud antes de reparar',
      });
      assert.equal(premature.status, 409);
      assert.deepEqual(await snapshot(owner, order.id), before);
    }
  });
}

test('HU07-04 Los reintentos conservan una sola entrega y un solo movimiento', async t => {
  const fixture = await setup(t);
  const { call, deliveriesRoute, order, owner, rec, users } = fixture;
  assert.deepEqual(await readDeliveries(call, deliveriesRoute, rec), []);
  await markReady(fixture);
  const before = await snapshot(owner, order.id);
  const payload = { ...confirmation, expectedVersion: before.version };
  const headers = { 'Idempotency-Key': randomUUID() };

  const responses = await Promise.all([
    call(deliveriesRoute, rec, payload, headers),
    call(deliveriesRoute, rec, payload, headers),
  ]);
  assert.deepEqual(responses.map(response => response.status).sort(), [200, 201],
    'Dos confirmaciones concurrentes con la misma clave deben crear una entrega y recuperar el mismo registro.');
  const [first, second] = responses.map(response => response.body.delivery);
  assert.ok(first?.id, 'La respuesta debe indicar el identificador de la entrega.');
  assert.deepEqual(second, first, 'Las dos respuestas deben identificar la misma entrega.');

  const retry = await call(deliveriesRoute, rec, payload, headers);
  assert.equal(retry.status, 200, 'Reenviar la confirmación después del guardado debe recuperar la entrega existente.');
  assert.deepEqual(retry.body.delivery, first);
  assert.equal((await call(deliveriesRoute, rec, { ...payload, evidencia: 'Acuse distinto' }, headers)).status, 409);
  assert.equal((await call(deliveriesRoute, rec, payload, { 'Idempotency-Key': randomUUID() })).status, 409);
  assert.deepEqual(await readDeliveries(call, deliveriesRoute, rec), [first], 'Debe existir una sola entrega persistida.');
  assertDelivered(before, await snapshot(owner, order.id), users.recepcion.id);
});

test('HU07-05 Solo el técnico asignado o administración puede marcar la reparación terminada', async t => {
  const other = { id: randomUUID(), name: 'Técnico sin asignación HU-07', role: 'tecnico' };
  const { admin, owner, order, rec, route, login, call, deliveriesRoute } = await setup(t, { extraUsers: { otro: other } });
  const before = await snapshot(owner, order.id);
  const endpoint = route + '/repair-completions';
  const payload = { state: readyState, expectedVersion: before.version, note: 'Reparación completada y verificada' };
  assert.equal((await call(endpoint, rec, payload)).status, 403);
  assert.equal((await call(endpoint, await login('otro'), payload)).status, 404);
  assert.equal((await call(endpoint, admin, { ...payload, expectedVersion: before.version - 1 })).status, 409);
  assert.equal((await call(endpoint, admin, { ...payload, state: deliveredState })).status, 422);
  assert.deepEqual(await snapshot(owner, order.id), before);

  const completed = await call(endpoint, admin, payload);
  assert.equal(completed.status, 201);
  assert.equal(completed.body.state, readyState);
  assert.equal(completed.body.orderVersion, before.version + 1);
  assert.equal(completed.body.history.length, before.history.filter(event => event.field === 'estado').length + 1);
  assert.equal(completed.body.history.at(-1).previousState, repairState);
  assert.equal(completed.body.history.at(-1).state, readyState);
  assert.equal((await snapshot(owner, order.id)).history.length, before.history.length + 1);
  assert.deepEqual(await readDeliveries(call, deliveriesRoute, rec), []);
});

test('HU07-06 La entrega exige datos válidos y revierte el movimiento si falla el historial', async t => {
  const fixture = await setup(t, { logger: { error() {} } });
  const { owner, order, rec, call, deliveriesRoute } = fixture;
  await markReady(fixture);
  const before = await snapshot(owner, order.id);
  const payload = { ...confirmation, expectedVersion: before.version };
  const headers = { 'Idempotency-Key': randomUUID() };
  for (const input of [{ ...payload, receptor: '' }, { ...payload, evidencia: '' }]) {
    assert.equal((await call(deliveriesRoute, rec, input, headers)).status, 422);
  }
  assert.equal((await call(deliveriesRoute, rec, payload)).status, 400);
  assert.equal((await call(deliveriesRoute, rec, { ...payload, expectedVersion: before.version - 1 }, headers)).status, 409);
  assert.deepEqual(await snapshot(owner, order.id), before);

  await owner.query(`ALTER TABLE reparix.order_history
    ADD CONSTRAINT simulate_delivery_history_failure CHECK (new_value <> 'Entregado') NOT VALID`);
  assert.equal((await call(deliveriesRoute, rec, payload, headers)).status, 500);
  assert.deepEqual(await snapshot(owner, order.id), before);
  assert.deepEqual(await readDeliveries(call, deliveriesRoute, rec), []);
});
