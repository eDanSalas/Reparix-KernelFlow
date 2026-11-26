import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { test } from 'node:test';
import { chromium } from 'playwright-core';
import { startBudgetFixture } from './fixtures/budget.js';

const results = 'test-results/hu05';

async function login(page, fixture, username) {
  await page.goto(fixture.url);
  await page.getByLabel('Usuario').fill(username);
  await page.getByLabel('Contraseña').fill(fixture.password);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await page.getByRole('button', { name: 'Cerrar sesión' }).waitFor();
}

async function selectAccount(page, accountId) {
  const directory = page.getByLabel('Cuenta interna');
  await directory.locator(`option[value="${accountId}"]`).waitFor({ state: 'attached' });
  await directory.selectOption(accountId);
  await page.getByLabel('Nuevo rol').waitFor();
}

test('HU05-E2E Angular guarda el cambio, PostgreSQL lo audita y la API aplica el nuevo rol', { timeout: 60000 }, async t => {
  const admin = { id: randomUUID(), name: 'Administración Demo', role: 'administrador' };
  const port = Number(process.env.REPARIX_BROWSER_PORT || 3001);
  const fixture = await startBudgetFixture({ port, extraUsers: { administrador: admin } });
  t.after(() => fixture.close());
  const browser = await chromium.launch({ channel: process.env.REPARIX_BROWSER_CHANNEL || 'msedge' });
  t.after(() => browser.close());
  await mkdir(results, { recursive: true });

  const { owner, users } = fixture;
  const { order } = await fixture.prepareOrder('HU05-E2E', { moveToPending: false });
  const target = users.recepcion;
  const route = `/api/internal-users/${target.id}/role-changes`;
  const pageErrors = [];
  const administrator = await browser.newPage({ baseURL: fixture.url, viewport: { width: 390, height: 844 } });
  const reception = await browser.newPage({ baseURL: fixture.url, viewport: { width: 1440, height: 900 } });
  for (const page of [administrator, reception]) page.on('pageerror', error => pageErrors.push(error.message));

  await login(reception, fixture, 'recepcion');
  assert.equal(await reception.getByRole('button', { name: 'Roles y permisos' }).count(), 0);
  const techniciansBefore = await reception.request.get('/api/technicians');
  assert.equal(techniciansBefore.status(), 200);
  const originalSession = await (await reception.request.get('/api/session')).json();
  const headers = { Origin: fixture.url, 'X-CSRF-Token': originalSession.csrfToken };
  const selfPromotion = await reception.request.post(route, { headers, data: { role: 'administrador' } });
  assert.equal(selfPromotion.status(), 403);

  await login(administrator, fixture, 'administrador');
  await administrator.getByLabel('Recuperar comprobante por folio').fill(order.folio);
  await administrator.getByRole('button', { name: 'Consultar', exact: true }).click();
  const assignment = administrator.getByRole('region', { name: 'Asignación de técnico' });
  const newTechnician = assignment.getByLabel('Técnico activo').locator(`option[value="${target.id}"]`);
  await assignment.waitFor();
  assert.equal(await newTechnician.count(), 0);
  await administrator.getByRole('button', { name: 'Roles y permisos' }).click();
  await selectAccount(administrator, target.id);
  const panel = administrator.getByRole('region', { name: 'Gestión de roles' });
  await panel.getByText('Rol actual: Recepción · Cuenta activa').waitFor();
  const submit = panel.getByRole('button', { name: 'Guardar cambio de rol' });
  assert.equal(await submit.isDisabled(), true);
  await panel.getByLabel('Nuevo rol').selectOption('tecnico');
  await submit.and(administrator.locator(':enabled')).waitFor();
  assert.ok(await administrator.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await panel.screenshot({ path: `${results}/01-cambio-movil.png` });

  const [response] = await Promise.all([
    administrator.waitForResponse(result => result.url().endsWith(route) && result.request().method() === 'POST'),
    submit.click(),
  ]);
  assert.deepEqual(response.request().postDataJSON(), { role: 'tecnico' });
  assert.equal(response.status(), 201);
  const { change } = await response.json();
  await panel.getByText('Cambio de rol guardado para recepcion.').waitFor();
  await panel.getByText('Rol actual: Técnico · Cuenta activa').waitFor();
  await administrator.getByRole('button', { name: 'Volver a órdenes' }).click();
  await newTechnician.waitFor({ state: 'attached' });

  await administrator.setViewportSize({ width: 1440, height: 900 });
  await administrator.reload();
  await administrator.getByRole('button', { name: 'Roles y permisos' }).click();
  await selectAccount(administrator, target.id);
  const history = panel.getByRole('region', { name: 'Historial de roles' });
  await history.getByText('Recepción → Técnico').waitFor();
  await history.getByText(admin.name, { exact: false }).waitFor();
  const timestamp = await history.locator('time').getAttribute('datetime');
  assert.equal(Date.parse(timestamp), Date.parse(change.changedAt));
  await administrator.screenshot({ path: `${results}/02-historial-escritorio.png` });

  const currentSession = await (await reception.request.get('/api/session')).json();
  assert.equal(currentSession.csrfToken, originalSession.csrfToken);
  assert.equal(currentSession.user.role, 'tecnico');
  const techniciansAfter = await reception.request.get('/api/technicians');
  const directoryDenied = await reception.request.get('/api/internal-users');
  assert.equal(techniciansAfter.status(), 403);
  assert.equal(directoryDenied.status(), 403);
  await reception.reload();
  await reception.getByRole('heading', { name: 'Consultar orden asignada' }).waitFor();

  const { rows } = await owner.query(`
    SELECT u.id AS "accountId", u.username, u.role, h.previous_role AS "previousRole",
      h.new_role AS "newRole", h.actor_id AS "actorId", h.changed_at AS "changedAt"
    FROM reparix.internal_users u
    JOIN reparix.internal_user_role_changes h ON h.user_id=u.id
    WHERE u.id=$1`, [target.id]);
  assert.deepEqual(rows, [{
    accountId: target.id, username: 'recepcion', role: 'tecnico', previousRole: 'recepcion',
    newRole: 'tecnico', actorId: admin.id, changedAt: new Date(change.changedAt),
  }]);
  const migration = await owner.query(`
    SELECT version FROM reparix.schema_migrations WHERE version='009-internal-user-role-changes'`);
  assert.equal(migration.rowCount, 1);

  await selectAccount(administrator, admin.id);
  await panel.getByLabel('Nuevo rol').selectOption('recepcion');
  await panel.getByText('Este cambio se aplicará a tu sesión actual.').waitFor();
  await submit.click();
  await administrator.getByRole('heading', { name: 'Registrar una orden' }).waitFor();
  assert.equal(await administrator.getByRole('button', { name: 'Roles y permisos' }).count(), 0);
  assert.equal((await administrator.request.get('/api/internal-users')).status(), 403);
  assert.deepEqual(pageErrors, []);
  await writeFile(`${results}/resultado.json`, JSON.stringify({
    cambioHttp: response.status(), autoescalamientoHttp: selfPromotion.status(),
    catalogoTecnicosAntesHttp: techniciansBefore.status(), catalogoTecnicosDespuesHttp: techniciansAfter.status(),
    directorioAdministrativoHttp: directoryDenied.status(), migracion: migration.rows[0].version, postgresql: rows[0],
  }, null, 2) + '\n');
});
