import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { test } from 'node:test';
import { chromium } from 'playwright-core';
import { startBudgetFixture } from './fixtures/budget.js';

const results = 'test-results/hu06';

async function submitLogin(page, fixture, username) {
  await page.goto(fixture.url);
  await page.getByLabel('Usuario').fill(username);
  await page.getByLabel('Contraseña').fill(fixture.password);
  const [response] = await Promise.all([
    page.waitForResponse(response => response.url().endsWith('/api/session') && response.request().method() === 'POST'),
    page.getByRole('button', { name: 'Entrar' }).click(),
  ]);
  return response;
}

async function openAccount(page, id) {
  await page.getByRole('button', { name: 'Roles y permisos' }).click();
  const directory = page.getByLabel('Cuenta interna');
  await directory.locator(`option[value="${id}"]`).waitFor({ state: 'attached' });
  await directory.selectOption(id);
  const access = page.getByRole('region', { name: 'Acceso de la cuenta' });
  await access.waitFor();
  return access;
}

async function lookupOrder(page, folio) {
  await page.getByLabel('Recuperar comprobante por folio').fill(folio);
  await page.getByRole('button', { name: 'Consultar', exact: true }).click();
}

test('HU06-E2E Angular desactiva la cuenta y PostgreSQL conserva la autoría original', { timeout: 60000 }, async t => {
  const admin = { id: randomUUID(), name: 'Administración Demo HU-06', role: 'administrador' };
  const replacement = { id: randomUUID(), name: 'Administración de respaldo', role: 'administrador' };
  const fixture = await startBudgetFixture({
    port: Number(process.env.REPARIX_BROWSER_PORT || 3001),
    extraUsers: { administrador: admin, respaldo: replacement },
  });
  let browser;
  t.after(async () => {
    try { await browser?.close(); }
    finally { await fixture.close(); }
  });
  browser = await chromium.launch({ channel: process.env.REPARIX_BROWSER_CHANNEL || 'msedge' });
  await mkdir(results, { recursive: true });

  const { order } = await fixture.prepareOrder('HU06-E2E', { moveToPending: false });
  const target = fixture.users.recepcion;
  const route = `/api/internal-users/${target.id}/deactivations`;
  const page = await browser.newPage({ baseURL: fixture.url, viewport: { width: 390, height: 844 } });
  const reception = await browser.newPage({ baseURL: fixture.url });
  const errors = [];
  for (const browserPage of [page, reception]) browserPage.on('pageerror', error => errors.push(error.message));

  const priorLogin = await submitLogin(reception, fixture, 'recepcion');
  assert.equal(priorLogin.status(), 200);
  const headers = { Origin: fixture.url, 'X-CSRF-Token': (await priorLogin.json()).csrfToken };
  const originalRead = await reception.request.get(`/api/orders/${order.folio}`);
  assert.equal(originalRead.status(), 200);
  const originalHistory = (await originalRead.json()).order.history;
  assert.equal(originalHistory[0].author, target.name);
  assert.equal(await reception.getByRole('button', { name: 'Roles y permisos' }).count(), 0);
  const denied = await reception.request.post(`/api/internal-users/${fixture.users.tecnico.id}/deactivations`, { headers, data: {} });
  assert.equal(denied.status(), 403);

  assert.equal((await submitLogin(page, fixture, 'administrador')).status(), 200);
  const access = await openAccount(page, target.id);
  await access.getByRole('button', { name: 'Desactivar cuenta' }).click();
  await access.getByText(`¿Desactivar a ${target.name} (recepcion)?`).waitFor();
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await access.screenshot({ path: `${results}/01-confirmacion-movil.png` });
  const [response] = await Promise.all([
    page.waitForResponse(response => response.url().endsWith(route) && response.request().method() === 'POST'),
    access.getByRole('button', { name: 'Confirmar desactivación' }).click(),
  ]);
  assert.equal(response.status(), 201);
  const { deactivation } = await response.json();
  assert.equal(deactivation.actorId, admin.id);
  await page.getByText('Cuenta recepcion desactivada.').waitFor();

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.reload();
  await openAccount(page, target.id);
  await page.getByText('Rol actual: Recepción · Cuenta inactiva').waitFor();
  await access.getByText(admin.name, { exact: false }).waitFor();
  assert.equal(Date.parse(await access.locator('time').getAttribute('datetime')), Date.parse(deactivation.changedAt));
  assert.equal(await access.getByRole('button', { name: 'Desactivar cuenta' }).count(), 0);
  await page.screenshot({ path: `${results}/02-cuenta-inactiva-escritorio.png`, fullPage: true });

  const rejectedRead = await reception.request.get(`/api/orders/${order.folio}`);
  assert.equal(rejectedRead.status(), 401);
  const rejectedWrite = await reception.request.post('/api/orders', {
    headers: { ...headers, 'Idempotency-Key': randomUUID() },
    data: {
      clientName: 'Cliente sintético HU-06', phone: '5550100000', deviceType: 'Portátil',
      brand: 'Ejemplo', model: 'Modelo de prueba', serialNumber: 'HU06-BLOQUEADO',
      reportedFault: 'El equipo no enciende', physicalCondition: 'Carcasa con marcas de uso',
      accessories: [], accessoriesConfirmed: true, physicalCheckConfirmed: true,
    },
  });
  assert.equal(rejectedWrite.status(), 401);
  await lookupOrder(reception, order.folio);
  await reception.getByRole('heading', { name: 'Acceso del personal' }).waitFor();

  const fresh = await browser.newPage({ baseURL: fixture.url });
  const rejectedLogin = await submitLogin(fresh, fixture, 'recepcion');
  assert.equal(rejectedLogin.status(), 401);
  assert.equal(await rejectedLogin.headerValue('set-cookie'), null);
  await fresh.getByText('Credenciales inválidas.').waitFor();

  await page.getByRole('button', { name: 'Volver a órdenes' }).click();
  await lookupOrder(page, order.folio);
  const receipt = page.getByRole('region', { name: 'Comprobante de recepción' });
  await receipt.getByText(`Responsable: ${target.name}`, { exact: false }).waitFor();
  await receipt.screenshot({ path: `${results}/03-autoria-original.png` });
  const preserved = await page.request.get(`/api/orders/${order.folio}`);
  assert.equal(preserved.status(), 200);
  assert.deepEqual((await preserved.json()).order.history, originalHistory);

  const { owner } = fixture;
  const { rows: deactivations } = await owner.query(`
    SELECT u.id AS "accountId",u.username,u.active,h.actor_id AS "actorId",h.changed_at AS "changedAt"
    FROM reparix.internal_users u JOIN reparix.internal_user_deactivations h ON h.user_id=u.id
    WHERE u.id=$1`, [target.id]);
  assert.deepEqual(deactivations, [{
    accountId: target.id, username: 'recepcion', active: false, actorId: admin.id, changedAt: new Date(deactivation.changedAt),
  }]);
  const sessions = await owner.query('SELECT 1 FROM reparix.sessions WHERE user_id=$1', [target.id]);
  assert.equal(sessions.rowCount, 0);
  const { rows: authors } = await owner.query(`
    SELECT o.folio,o.created_by AS "createdBy",h.actor_id AS "originalActor"
    FROM reparix.orders o JOIN reparix.order_history h ON h.order_id=o.id
    WHERE o.id=$1 AND h.field='estado' AND h.previous_value IS NULL`, [order.id]);
  assert.deepEqual(authors, [{ folio: order.folio, createdBy: target.id, originalActor: target.id }]);
  assert.equal((await owner.query('SELECT 1 FROM reparix.orders')).rowCount, 1);
  const { rows: migrations } = await owner.query(`
    SELECT version FROM reparix.schema_migrations
    WHERE version IN ('011-internal-user-deactivation', '016-serialize-session-creation') ORDER BY version`);
  assert.equal(migrations.length, 2);

  const ownAccess = await openAccount(page, admin.id);
  await ownAccess.getByRole('button', { name: 'Desactivar cuenta' }).click();
  await ownAccess.getByText('Tu sesión se cerrará al confirmar.').waitFor();
  await ownAccess.getByRole('button', { name: 'Confirmar desactivación' }).click();
  await page.getByRole('heading', { name: 'Acceso del personal' }).waitFor();
  await page.getByText('Cuenta administrador desactivada.').waitFor();
  assert.deepEqual(errors, []);

  await writeFile(`${results}/resultado.json`, JSON.stringify({
    desactivacionHttp: response.status(), desactivacionSinPermisoHttp: denied.status(),
    accesoNuevoHttp: rejectedLogin.status(), lecturaSesionAnteriorHttp: rejectedRead.status(),
    escrituraSesionAnteriorHttp: rejectedWrite.status(), sesionesRestantes: sessions.rowCount,
    migraciones: migrations.map(row => row.version), postgresql: { cuenta: deactivations[0], autoria: authors[0] },
  }, null, 2) + '\n');
});
