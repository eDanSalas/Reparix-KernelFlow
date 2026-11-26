import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { startBudgetFixture } from './fixtures/budget.js';

const receptionRole = 'recepcion';
const technicianRole = 'tecnico';
const administratorRole = 'administrador';

async function setup(t, options = {}) {
  const administrator = {
    id: randomUUID(),
    name: 'Administración de prueba',
    role: administratorRole,
  };
  const fixture = await startBudgetFixture({ ...options, extraUsers: { administrador: administrator } });
  t.after(() => fixture.close());
  const admin = await fixture.login('administrador');
  return { ...fixture, admin };
}

function roleChangesRoute(account) {
  return `/internal-users/${account.id}/role-changes`;
}

async function storedRole(owner, account) {
  const { rows } = await owner.query('SELECT role FROM reparix.internal_users WHERE id=$1', [account.id]);
  assert.equal(rows.length, 1, 'La cuenta interna debe seguir existiendo.');
  return rows[0].role;
}

async function readHistory(call, admin, account) {
  const response = await call(roleChangesRoute(account), admin);
  assert.equal(response.status, 200, 'Administración debe poder consultar el historial de roles.');
  assert.ok(Array.isArray(response.body.history), 'La consulta debe devolver el historial de cambios.');
  return response.body.history;
}

async function databaseTime(owner) {
  const { rows: [{ now }] } = await owner.query('SELECT clock_timestamp() AS now');
  return now.getTime();
}

test('HU05-01 Administración cambia el rol y el historial conserva el cambio', async t => {
  const { admin, call, login, owner, users } = await setup(t);
  const account = users.tecnico;
  assert.equal(await storedRole(owner, account), technicianRole);

  const before = await databaseTime(owner);
  const result = await call(roleChangesRoute(account), admin, { role: receptionRole });
  assert.equal(result.status, 201, 'Una cuenta administrativa debe poder registrar un cambio de rol.');
  const after = await databaseTime(owner);
  assert.equal(await storedRole(owner, account), receptionRole, 'El nuevo rol debe quedar guardado.');

  const freshAdmin = await login('administrador');
  const history = await readHistory(call, freshAdmin, account);
  assert.equal(history.length, 1, 'El cambio debe crear un solo registro en el historial de la cuenta.');
  const [change] = history;
  assert.equal(change.previousRole, technicianRole, 'El historial debe guardar el rol anterior.');
  assert.equal(change.newRole, receptionRole, 'El historial debe guardar el rol asignado.');
  assert.equal(change.actorId, users.administrador.id, 'El historial debe identificar al administrador que autorizó el cambio.');
  assert.equal(change.actorName, users.administrador.name);
  const changedAt = Date.parse(change.changedAt);
  assert.ok(changedAt >= before && changedAt <= after, 'El historial debe guardar la fecha y hora del cambio.');
});

test('HU05-02 Recepción no puede asignar privilegios administrativos a otra cuenta', async t => {
  const { admin, rec, call, owner, users } = await setup(t);
  const account = users.tecnico;
  const result = await call(roleChangesRoute(account), rec, { role: administratorRole });

  assert.equal(result.status, 403, 'La API debe devolver HTTP 403 si recepción intenta modificar el rol de otra cuenta.');
  assert.equal(await storedRole(owner, account), technicianRole);
  assert.deepEqual(await readHistory(call, admin, account), [], 'El intento denegado no debe registrar un cambio de rol.');
});

test('HU05-03 Una cuenta no administrativa no puede elevar su propio rol', async t => {
  const { admin, tech, call, owner, users } = await setup(t);
  const account = users.tecnico;
  const result = await call(roleChangesRoute(account), tech, { role: administratorRole });

  assert.equal(result.status, 403, 'La API debe devolver HTTP 403 si un técnico intenta convertirse en administrador.');
  assert.equal(await storedRole(owner, account), technicianRole);
  assert.deepEqual(await readHistory(call, admin, account), [], 'El intento de autoescalamiento no debe registrar un cambio de rol.');
  const session = await call('/session', tech);
  assert.equal(session.status, 200, session.body.message);
  assert.equal(session.body.user.role, technicianRole);
});

test('HU05-04 La API retira permisos de recepción a una sesión abierta cuando cambia el rol', async t => {
  const { admin, rec, call, users } = await setup(t);
  const before = await call('/technicians', rec);
  assert.equal(before.status, 200, 'Recepción debe poder consultar el catálogo de técnicos antes del cambio.');

  const change = await call(roleChangesRoute(users.recepcion), admin, { role: technicianRole });
  assert.equal(change.status, 201, 'El cambio a técnico debe quedar registrado para verificar los permisos de la sesión abierta.');

  const session = await call('/session', rec);
  assert.equal(session.status, 200, session.body.message);
  assert.equal(session.body.user.role, technicianRole, 'La sesión abierta debe usar el rol vigente.');
  const after = await call('/technicians', rec);
  assert.equal(after.status, 403, 'La llamada directa a la API con la misma sesión debe devolver HTTP 403 tras perder el permiso.');
});

test('HU05-05 Solo administración consulta el directorio y el historial de cuentas', async t => {
  const { admin, rec, tech, call, users } = await setup(t);
  for (const [session, status] of [[null, 401], [rec, 403], [tech, 403]]) {
    assert.equal((await call('/internal-users', session)).status, status);
    assert.equal((await call(roleChangesRoute(users.tecnico), session)).status, status);
  }

  const account = { id: users.tecnico.id, name: users.tecnico.name, username: 'tecnico', role: technicianRole, active: true };
  const directory = await call('/internal-users', admin);
  assert.equal(directory.status, 200);
  assert.deepEqual(directory.body.accounts.find(item => item.id === account.id), account);
  const details = await call(roleChangesRoute(users.tecnico), admin);
  assert.equal(details.status, 200);
  assert.deepEqual(details.body, { account, history: [] });
});

test('HU05-06 La API deriva la autoría de la sesión y revierte el rol si falla el historial', async t => {
  const { admin, call, owner, users } = await setup(t, { logger: { error() {} } });
  const account = users.tecnico;
  const route = roleChangesRoute(account);
  assert.equal((await call(route, admin, { role: receptionRole, actorId: users.recepcion.id })).status, 422);
  assert.equal((await call(route, admin, { role: 'superusuario' })).status, 422);
  assert.equal(await storedRole(owner, account), technicianRole);
  assert.deepEqual(await readHistory(call, admin, account), []);

  await owner.query(`ALTER TABLE reparix.internal_user_role_changes
    ADD CONSTRAINT simulate_history_failure CHECK (false) NOT VALID`);
  assert.equal((await call(route, admin, { role: receptionRole })).status, 500);
  assert.equal(await storedRole(owner, account), technicianRole);
  assert.deepEqual(await readHistory(call, admin, account), []);
});
