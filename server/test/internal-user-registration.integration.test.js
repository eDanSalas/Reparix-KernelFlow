import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { startBudgetFixture } from './fixtures/budget.js';

const registrationRoute = '/internal-users';
const technicianRole = 'tecnico';
const administratorRole = 'administrador';

function validAccount(overrides = {}) {
  return {
    username: 'tecnico.hu04',
    name: 'Técnico de prueba HU-04',
    password: `Prueba-HU04-${randomUUID()}`,
    role: technicianRole,
    ...overrides,
  };
}

async function setup(t, options = {}) {
  const administrator = { id: randomUUID(), name: 'Administración de prueba HU-04', role: administratorRole };
  const fixture = await startBudgetFixture({ ...options, extraUsers: { administrador: administrator } });
  t.after(() => fixture.close());
  const admin = await fixture.login('administrador');
  return { ...fixture, admin };
}

async function readAccounts(owner) {
  const { rows } = await owner.query(`
    SELECT id, username, display_name AS name, role, active
    FROM reparix.internal_users ORDER BY username`);
  return rows;
}

test('HU04-01 Administración registra una cuenta individual con datos válidos', async t => {
  const { owner, call, admin, users } = await setup(t);
  const account = validAccount();
  const before = await readAccounts(owner);
  const { rows: [{ now: started }] } = await owner.query('SELECT clock_timestamp() AS now');
  const response = await call(registrationRoute, admin, account);
  const { rows: [{ now: finished }] } = await owner.query('SELECT clock_timestamp() AS now');
  assert.equal(response.status, 201, 'La API debe devolver HTTP 201 al registrar una cuenta interna válida.');

  const after = await readAccounts(owner);
  const registered = after.filter(user => user.username === account.username);
  assert.equal(registered.length, 1, 'Debe existir una sola cuenta con el nombre de usuario registrado.');
  const [saved] = registered;
  assert.ok(saved.id, 'La cuenta debe quedar guardada con un identificador propio.');
  assert.equal(saved.name, account.name);
  assert.equal(saved.role, account.role);
  assert.deepEqual(after.filter(user => user.id !== saved.id), before, 'El alta solo debe agregar la cuenta solicitada.');
  assert.deepEqual(response.body.user, saved, 'La respuesta del alta debe devolver únicamente los datos de la cuenta.');

  const details = await call(`/internal-users/${saved.id}/role-changes`, admin);
  assert.equal(details.status, 200);
  const { registration } = details.body;
  assert.equal(registration.actorId, users.administrador.id);
  assert.equal(registration.actorName, users.administrador.name);
  assert.equal(registration.initialRole, account.role);
  const registeredAt = Date.parse(registration.registeredAt);
  assert.ok(registeredAt >= started.getTime() && registeredAt <= finished.getTime());

  const session = await call('/session', null, { username: account.username, password: account.password });
  assert.equal(session.status, 200, 'La cuenta registrada debe poder iniciar sesión con su propia contraseña.');
  assert.deepEqual(session.body.user, { username: account.username, name: account.name, role: account.role });
});

test('HU04-02 La API rechaza un nombre de usuario duplicado', async t => {
  const { owner, call, admin } = await setup(t);
  const before = await readAccounts(owner);
  assert.equal(before.filter(user => user.username === 'tecnico').length, 1);

  const duplicate = validAccount({ username: 'tecnico', role: 'recepcion' });
  const response = await call(registrationRoute, admin, duplicate);
  assert.equal(response.status, 409, 'La API debe devolver HTTP 409 si el nombre de usuario ya existe.');
  assert.equal(response.body.fields.username, 'El nombre de usuario ya existe.');
  assert.deepEqual(await readAccounts(owner), before, 'El duplicado debe rechazarse sin agregar ni modificar cuentas.');
  assert.equal((await owner.query('SELECT 1 FROM reparix.internal_user_registrations')).rowCount, 0);
});

test('HU04-05 Solicitudes simultáneas con el mismo nombre de usuario conservan una cuenta y un alta', async t => {
  const { owner, call, admin } = await setup(t);
  const first = validAccount();
  const second = validAccount({ name: 'Otra persona', role: 'recepcion' });
  const responses = await Promise.all([call(registrationRoute, admin, first), call(registrationRoute, admin, second)]);
  assert.deepEqual(responses.map(response => response.status).sort(), [201, 409]);
  const [{ id, role }] = (await readAccounts(owner)).filter(account => account.username === first.username);
  const { rows } = await owner.query('SELECT user_id, initial_role FROM reparix.internal_user_registrations');
  assert.deepEqual(rows, [{ user_id: id, initial_role: role }]);
});

test('HU04-06 Si falla el historial del alta, PostgreSQL revierte la cuenta', async t => {
  const { owner, call, admin } = await setup(t, { logger: { error() {} } });
  const before = await readAccounts(owner);
  await owner.query(`ALTER TABLE reparix.internal_user_registrations
    ADD CONSTRAINT simulate_registration_history_failure CHECK (false) NOT VALID`);
  const response = await call(registrationRoute, admin, validAccount());
  assert.equal(response.status, 500);
  assert.deepEqual(await readAccounts(owner), before);
  assert.equal((await owner.query('SELECT 1 FROM reparix.internal_user_registrations')).rowCount, 0);
});

test('HU04-03 Solo una sesión administrativa puede registrar cuentas', async t => {
  const { owner, call, rec, tech } = await setup(t);
  const before = await readAccounts(owner);
  const account = validAccount();

  for (const [role, session] of [['recepción', rec], ['técnico', tech]]) {
    const response = await call(registrationRoute, session, account);
    assert.equal(response.status, 403, `La API debe devolver HTTP 403 si una cuenta de ${role} intenta registrar usuarios.`);
    assert.deepEqual(await readAccounts(owner), before, 'Una solicitud sin permisos no debe crear una cuenta.');
  }
});

test('HU04-04 El alta exige los datos obligatorios y un rol permitido', async t => {
  const { owner, call, admin } = await setup(t);
  const before = await readAccounts(owner);
  const account = validAccount();
  const invalidValues = [
    ['username', undefined],
    ['name', undefined],
    ['password', undefined],
    ['role', undefined],
    ['role', 'invitado'],
  ];

  for (const [field, value] of invalidValues) {
    const response = await call(registrationRoute, admin, { ...account, [field]: value });
    const reason = value === undefined ? `falta el campo ${field}` : 'el rol no está permitido';
    assert.equal(response.status, 422, `La API debe devolver HTTP 422 si ${reason}.`);
    assert.deepEqual(await readAccounts(owner), before, 'Una solicitud inválida no debe crear una cuenta.');
  }
});
