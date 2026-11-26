import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';
import { startBudgetFixture } from './fixtures/budget.js';

async function setup(t, options = {}) {
  const administrator = {
    id: randomUUID(), name: 'Administración de prueba HU-06', role: 'administrador',
  };
  const fixture = await startBudgetFixture({ ...options, extraUsers: { administrador: administrator } });
  t.after(() => fixture.close());
  const admin = await fixture.login('administrador');
  return { ...fixture, admin };
}

function deactivationsRoute(account) {
  return `/internal-users/${account.id}/deactivations`;
}

async function readActiveStatus(owner, account) {
  const { rows: [user] } = await owner.query('SELECT active FROM reparix.internal_users WHERE id=$1', [account.id]);
  assert.ok(user, 'La cuenta debe conservar su identificador en PostgreSQL.');
  return user.active;
}

async function readDeactivationHistory(call, admin, account) {
  const response = await call(deactivationsRoute(account), admin);
  assert.equal(response.status, 200, 'Administración debe poder consultar el historial de desactivación.');
  assert.ok(Array.isArray(response.body.history), 'La consulta debe devolver el historial de desactivación.');
  return response.body.history;
}

async function databaseTime(owner) {
  const { rows: [{ now }] } = await owner.query('SELECT clock_timestamp() AS now');
  return now.getTime();
}

function orderPayload(serialNumber) {
  return {
    clientName: 'Cliente de prueba HU-06', phone: '5550100000', deviceType: 'Portátil',
    brand: 'Ejemplo', model: 'Modelo de prueba', serialNumber,
    reportedFault: 'El equipo no enciende', physicalCondition: 'Carcasa con marcas de uso',
    accessories: [], accessoriesConfirmed: true, physicalCheckConfirmed: true,
  };
}

test('HU06-01 Administración desactiva una cuenta y registra quién y cuándo', async t => {
  const { admin, call, login, owner, users } = await setup(t);
  const account = users.tecnico;
  assert.equal(await readActiveStatus(owner, account), true);

  const before = await databaseTime(owner);
  const response = await call(deactivationsRoute(account), admin, {});
  assert.equal(response.status, 201, 'La API debe devolver HTTP 201 al desactivar una cuenta como administrador.');
  const after = await databaseTime(owner);
  assert.equal(await readActiveStatus(owner, account), false, 'La cuenta debe quedar guardada como inactiva.');

  const freshAdmin = await login('administrador');
  const history = await readDeactivationHistory(call, freshAdmin, account);
  assert.equal(history.length, 1, 'Debe quedar un registro de la desactivación en el historial de la cuenta.');
  const [event] = history;
  assert.equal(event.actorId, users.administrador.id, 'El historial debe identificar al administrador que desactivó la cuenta.');
  assert.equal(event.actorName, users.administrador.name);
  const changedAt = Date.parse(event.changedAt);
  assert.ok(changedAt >= before && changedAt <= after, 'El historial debe guardar la fecha y hora de la desactivación.');
});

test('HU06-02 Recepción no puede desactivar una cuenta interna', async t => {
  const { admin, rec, call, owner, users } = await setup(t);
  const account = users.tecnico;
  const response = await call(deactivationsRoute(account), rec, {});
  assert.equal(response.status, 403, 'La API debe devolver HTTP 403 si recepción intenta desactivar una cuenta.');
  assert.equal(await readActiveStatus(owner, account), true, 'La cuenta debe seguir activa después del intento denegado.');
  assert.deepEqual(await readDeactivationHistory(call, admin, account), [], 'El intento denegado no debe registrar una desactivación.');
});

test('HU06-03 Una cuenta desactivada pierde el acceso nuevo y el de su sesión abierta', async t => {
  const { admin, rec, call, owner, users, password } = await setup(t);
  const before = await call('/technicians', rec);
  assert.equal(before.status, 200, 'La sesión de recepción debe tener acceso antes de desactivar la cuenta.');

  const deactivated = await call(deactivationsRoute(users.recepcion), admin, {});
  assert.equal(deactivated.status, 201, 'La API debe desactivar la cuenta antes de comprobar el bloqueo de sus sesiones.');

  const login = await call('/session', null, { username: 'recepcion', password });
  assert.equal(login.status, 401, 'La cuenta desactivada no debe poder iniciar una nueva sesión.');
  assert.equal(login.headers.get('set-cookie'), null, 'El inicio denegado no debe generar una cookie de sesión.');
  const read = await call('/technicians', rec);
  assert.equal(read.status, 401, 'La sesión abierta de la cuenta desactivada debe perder acceso de lectura.');
  const write = await call('/orders', rec, orderPayload('HU06-03'), { 'Idempotency-Key': randomUUID() });
  assert.equal(write.status, 401, 'La sesión abierta de la cuenta desactivada debe perder acceso de escritura.');
  const { rows: [{ total }] } = await owner.query('SELECT count(*)::int AS total FROM reparix.orders');
  assert.equal(total, 0, 'La operación posterior a la desactivación no debe registrar una orden.');
});

test('HU06-04 La orden y su historial siguen asociados a su autora original', async t => {
  const { admin, rec, call, post, owner, users } = await setup(t);
  const account = users.recepcion;
  const { order } = await post('/orders', rec, orderPayload('HU06-04'), { 'Idempotency-Key': randomUUID() });
  assert.equal(order.history[0].author, account.name);

  const deactivated = await call(deactivationsRoute(account), admin, {});
  assert.equal(deactivated.status, 201, 'La API debe desactivar la cuenta antes de comprobar que conserva la autoría histórica.');
  assert.equal(await readActiveStatus(owner, account), false);

  const response = await call(`/orders/${order.folio}`, admin);
  assert.equal(response.status, 200, 'La orden debe seguir disponible para administración.');
  assert.deepEqual(response.body.order.history, order.history, 'La desactivación debe conservar el historial de la orden.');
  const { rows } = await owner.query(`
    SELECT o.created_by, h.actor_id
    FROM reparix.orders o JOIN reparix.order_history h ON h.order_id=o.id
    WHERE o.id=$1 AND h.field='estado'`, [order.id]);
  assert.deepEqual(rows, [{ created_by: account.id, actor_id: account.id }],
    'La orden y el movimiento de alta deben conservar el ID de la usuaria original.');
});

test('HU06-05 Las desactivaciones repetidas conservan una sola entrada en el historial', async t => {
  const { admin, call, owner, users } = await setup(t);
  const target = users.tecnico;
  const route = deactivationsRoute(target);
  const attempts = await Promise.all([call(route, admin, {}), call(route, admin, {})]);
  assert.deepEqual(attempts.map(result => result.status).sort(), [201, 409]);
  assert.equal(await readActiveStatus(owner, target), false);
  assert.equal((await readDeactivationHistory(call, admin, target)).length, 1);
});

test('HU06-06 Un acceso concurrente con la desactivación no emite una sesión nueva', async t => {
  const { call, owner, users, password } = await setup(t);
  const target = users.recepcion;
  await owner.query('BEGIN');
  let pending;
  try {
    await owner.query('SELECT reparix.deactivate_internal_user($1,$2)', [target.id, users.administrador.id]);
    pending = call('/session', null, { username: 'recepcion', password });
    let waiting = false;
    for (let attempt = 0; attempt < 150; attempt++) {
      await owner.query('SELECT pg_stat_clear_snapshot()');
      const result = await owner.query(`SELECT 1 FROM pg_stat_activity
        WHERE datname=current_database() AND usename='reparix_app' AND wait_event_type='Lock'`);
      if (result.rowCount) { waiting = true; break; }
      await delay(20);
    }
    assert.ok(waiting, 'El inicio de sesión debe esperar a que se confirme la desactivación.');
    await owner.query('COMMIT');
    const result = await pending;
    assert.equal(result.status, 401);
    assert.equal(result.headers.get('set-cookie'), null);
    const sessions = await owner.query('SELECT 1 FROM reparix.sessions WHERE user_id=$1', [target.id]);
    assert.equal(sessions.rowCount, 0);
  } finally {
    await owner.query('ROLLBACK');
    if (pending) await pending;
  }
});

test('HU06-07 Si falla la auditoría, la desactivación conserva la cuenta y sus sesiones', async t => {
  const { admin, rec, call, owner, users } = await setup(t, { logger: { error() {} } });
  const target = users.recepcion;
  await owner.query(`ALTER TABLE reparix.internal_user_deactivations
    ADD CONSTRAINT simulate_deactivation_history_failure CHECK (false) NOT VALID`);
  assert.equal((await call(deactivationsRoute(target), admin, {})).status, 500);
  assert.equal(await readActiveStatus(owner, target), true);
  assert.equal((await call('/session', rec)).status, 200);
  assert.deepEqual(await readDeactivationHistory(call, admin, target), []);
});
