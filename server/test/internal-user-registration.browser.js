import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { test } from 'node:test';
import { chromium } from 'playwright-core';
import { verifyPassword } from '../src/security.js';
import { startBudgetFixture } from './fixtures/budget.js';

const results = 'test-results/hu04';
const registrationRoute = '/api/internal-users';

async function login(page, fixture, username, password = fixture.password) {
  await page.goto(fixture.url);
  await page.getByLabel('Usuario').fill(username);
  await page.getByLabel('Contraseña').fill(password);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await page.getByRole('button', { name: 'Cerrar sesión' }).waitFor();
}

async function openRegistration(page) {
  await page.getByRole('button', { name: 'Registrar cuenta interna' }).click();
  const form = page.getByRole('form', { name: 'Registrar cuenta interna' });
  await form.waitFor();
  return form;
}

async function fillRegistration(form, account) {
  await form.getByLabel('Nombre completo').fill(account.name);
  await form.getByLabel('Nombre de usuario').fill(account.username);
  await form.getByLabel('Contraseña inicial').fill(account.password);
  await form.getByLabel('Rol inicial').selectOption(account.role);
}

function submitRegistration(page, form) {
  return Promise.all([
    page.waitForResponse(response => response.url().endsWith(registrationRoute) && response.request().method() === 'POST'),
    form.getByRole('button', { name: 'Crear cuenta' }).click(),
  ]);
}

test('HU04-E2E Angular crea una cuenta nominativa y PostgreSQL conserva su alta única', { timeout: 60000 }, async t => {
  const admin = { id: randomUUID(), name: 'Administración Demo HU-04', role: 'administrador' };
  const fixture = await startBudgetFixture({
    port: Number(process.env.REPARIX_BROWSER_PORT || 3001), extraUsers: { administrador: admin },
  });
  t.after(() => fixture.close());
  const browser = await chromium.launch({ channel: process.env.REPARIX_BROWSER_CHANNEL || 'msedge' });
  t.after(() => browser.close());
  await mkdir(results, { recursive: true });

  const account = {
    username: 'tecnico.hu04', name: 'María Técnica Demo', password: `HU04-${randomUUID()}`, role: 'tecnico',
  };
  const page = await browser.newPage({ baseURL: fixture.url, viewport: { width: 390, height: 844 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await login(page, fixture, 'administrador');
  await page.getByRole('button', { name: 'Roles y permisos' }).click();
  const form = await openRegistration(page);
  const submit = form.getByRole('button', { name: 'Crear cuenta' });
  assert.equal(await submit.isDisabled(), true);
  await fillRegistration(form, account);
  await submit.and(page.locator(':enabled')).waitFor();
  assert.equal(await form.getByLabel('Contraseña inicial').getAttribute('type'), 'password');
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await page.screenshot({ path: `${results}/01-alta-movil.png`, fullPage: true });

  const [created] = await submitRegistration(page, form);
  assert.equal(created.status(), 201);
  assert.deepEqual(created.request().postDataJSON(), account);
  const { user } = await created.json();
  assert.deepEqual(user, { id: user.id, username: account.username, name: account.name, role: account.role, active: true });
  await page.getByText(`Cuenta ${account.username} registrada.`).waitFor();
  const directory = page.getByLabel('Cuenta interna');
  const record = page.locator('[aria-label="Alta de la cuenta"]');
  await record.getByText(admin.name, { exact: false }).waitFor();
  assert.equal(await directory.inputValue(), user.id);

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.reload();
  await page.getByRole('button', { name: 'Roles y permisos' }).click();
  await directory.locator(`option[value="${user.id}"]`).waitFor({ state: 'attached' });
  await directory.selectOption(user.id);
  await record.getByText(admin.name, { exact: false }).waitFor();
  const displayedTime = await record.locator('time').getAttribute('datetime');
  assert.ok(displayedTime);
  await page.screenshot({ path: `${results}/02-alta-en-directorio.png` });

  const duplicate = await openRegistration(page);
  await fillRegistration(duplicate, { ...account, name: 'Otro nombre sintético', role: 'recepcion', password: `HU04-${randomUUID()}` });
  const [conflict] = await submitRegistration(page, duplicate);
  assert.equal(conflict.status(), 409);
  await duplicate.getByText('El nombre de usuario ya existe.', { exact: true }).waitFor();
  await page.screenshot({ path: `${results}/03-duplicado-escritorio.png` });

  const receptionist = await browser.newPage({ baseURL: fixture.url });
  await login(receptionist, fixture, 'recepcion');
  assert.equal(await receptionist.getByRole('button', { name: 'Roles y permisos' }).count(), 0);
  const session = await (await receptionist.request.get('/api/session')).json();
  const deniedUsername = 'recepcion.noautorizada';
  const denied = await receptionist.request.post(registrationRoute, {
    headers: { Origin: fixture.url, 'X-CSRF-Token': session.csrfToken },
    data: { ...account, username: deniedUsername },
  });
  assert.equal(denied.status(), 403);

  const technician = await browser.newPage({ baseURL: fixture.url });
  technician.on('pageerror', error => errors.push(error.message));
  await login(technician, fixture, account.username, account.password);
  await technician.getByRole('heading', { name: 'Consultar orden asignada' }).waitFor();
  const loginSession = await technician.request.get('/api/session');
  assert.equal(loginSession.status(), 200);
  assert.deepEqual((await loginSession.json()).user, { username: account.username, name: account.name, role: account.role });

  const technicians = await page.request.get('/api/technicians');
  assert.equal(technicians.status(), 200);
  assert.deepEqual((await technicians.json()).technicians.find(candidate => candidate.id === user.id), { id: user.id, name: account.name });
  const { rows } = await fixture.owner.query(`
    SELECT u.id, u.username, u.display_name AS name, u.role, u.active, u.password_hash AS "passwordHash",
      r.actor_id AS "actorId", r.initial_role AS "initialRole", r.registered_at AS "registeredAt"
    FROM reparix.internal_users u
    LEFT JOIN reparix.internal_user_registrations r ON r.user_id=u.id
    WHERE u.username=ANY($1::text[])`, [[account.username, deniedUsername]]);
  assert.equal(rows.length, 1);
  const [{ passwordHash, ...saved }] = rows;
  assert.notEqual(passwordHash, account.password);
  assert.ok(verifyPassword(account.password, passwordHash));
  assert.deepEqual(saved, { ...user, actorId: admin.id, initialRole: account.role, registeredAt: new Date(displayedTime) });
  const { rows: migrations } = await fixture.owner.query(`
    SELECT version FROM reparix.schema_migrations
    WHERE version IN ('010-internal-user-registration', '015-internal-user-registration-history') ORDER BY version`);
  assert.equal(migrations.length, 2);
  assert.deepEqual(errors, []);
  await writeFile(`${results}/resultado.json`, JSON.stringify({
    altaHttp: created.status(), duplicadoHttp: conflict.status(), altaSinPermisoHttp: denied.status(),
    sesionNuevaCuentaHttp: loginSession.status(), cuentaVisibleEnCatalogoTecnicos: true, contrasenaDerivada: true,
    migraciones: migrations.map(row => row.version), postgresql: saved,
  }, null, 2) + '\n');
});
