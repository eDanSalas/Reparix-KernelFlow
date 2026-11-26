import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { test } from 'node:test';
import { chromium } from 'playwright-core';
import { demoAcceptance, startBudgetFixture } from './fixtures/budget.js';

const results = 'test-results/hu07';
const confirmation = { receptor: 'María Receptora Demo', evidencia: 'Acuse firmado HU-07, referencia demostrativa 001' };

async function login(page, fixture, username) {
  await page.goto(fixture.url);
  await page.getByLabel('Usuario').fill(username);
  await page.getByLabel('Contraseña').fill(fixture.password);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await page.getByRole('button', { name: 'Cerrar sesión' }).waitFor();
}

async function lookup(page, folio, state, label = 'Recuperar comprobante por folio') {
  await page.getByLabel(label).fill(folio);
  await page.getByRole('button', { name: 'Consultar', exact: true }).click();
  await page.getByRole('region', { name: 'Estado de la orden' }).getByText(state, { exact: true }).waitFor();
}

test('HU07-E2E Angular completa la reparación y recupera una entrega única después de perder la respuesta', { timeout: 60000 }, async t => {
  const admin = { id: randomUUID(), name: 'Responsable de taller HU-07', role: 'administrador' };
  const fixture = await startBudgetFixture({
    port: Number(process.env.REPARIX_BROWSER_PORT || 3001), extraUsers: { administrador: admin },
  });
  let browser;
  t.after(async () => {
    try { await browser?.close(); }
    finally { await fixture.close(); }
  });
  browser = await chromium.launch({ channel: process.env.REPARIX_BROWSER_CHANNEL || 'msedge' });
  await mkdir(results, { recursive: true });

  const { order, route, current } = await fixture.prepareOrder('HU07-E2E', { moveToPending: false });
  const reception = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const technician = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  for (const page of [reception, technician]) page.on('pageerror', error => errors.push(error.message));
  const deliveryPanel = reception.getByRole('region', { name: 'Entrega física' });

  await login(reception, fixture, 'recepcion');
  await lookup(reception, order.folio, 'En diagnóstico');
  assert.equal(await deliveryPanel.count(), 0);
  const diagnosis = await fixture.call(route + '/state', fixture.tech);
  const blockedInDiagnosis = await fixture.call(route + '/deliveries', fixture.rec, {
    ...confirmation, expectedVersion: diagnosis.body.orderVersion,
  }, { 'Idempotency-Key': randomUUID() });
  assert.equal(blockedInDiagnosis.status, 409);

  const pending = await fixture.post(route + '/state', fixture.tech, {
    state: 'Pendiente de autorización', expectedVersion: diagnosis.body.orderVersion, note: 'Diagnóstico terminado',
  });
  await fixture.post(route + '/budget-communications', fixture.rec, { presupuestoId: current.id });
  await fixture.post(route + '/budget-acceptances', fixture.rec, { presupuestoId: current.id, ...demoAcceptance });
  const manager = await fixture.login('administrador');
  const repair = await fixture.post(route + '/state', manager, {
    state: 'En reparación', expectedVersion: pending.orderVersion, note: 'Inicio de reparación autorizada',
  });
  await lookup(reception, order.folio, 'En reparación');
  assert.equal(await deliveryPanel.count(), 0);
  const blockedInRepair = await fixture.call(route + '/deliveries', fixture.rec, {
    ...confirmation, expectedVersion: repair.orderVersion,
  }, { 'Idempotency-Key': randomUUID() });
  assert.equal(blockedInRepair.status, 409);

  await login(technician, fixture, 'tecnico');
  await lookup(technician, order.folio, 'En reparación', 'Consultar orden asignada por folio');
  const technicianState = technician.getByRole('region', { name: 'Estado de la orden' });
  await technicianState.getByLabel('Nuevo estado').selectOption('Listo para recoger');
  await technicianState.getByLabel('Nota del cambio').fill('Reparación completada y equipo listo para recoger');
  await technicianState.getByLabel('Confirmo el estado seleccionado y la nota.').check();
  const [readyResponse] = await Promise.all([
    technician.waitForResponse(response => response.url().endsWith(route + '/repair-completions')),
    technicianState.getByRole('button', { name: 'Confirmar cambio de estado' }).click(),
  ]);
  assert.equal(readyResponse.status(), 201);
  const ready = await readyResponse.json();
  assert.equal(ready.state, 'Listo para recoger');
  assert.equal(ready.orderVersion, repair.orderVersion + 1);
  await technicianState.getByText('Listo para recoger', { exact: true }).waitFor();
  assert.equal(await technician.getByRole('region', { name: 'Entrega física' }).count(), 0);

  await lookup(reception, order.folio, 'Listo para recoger');
  const form = deliveryPanel.getByRole('form', { name: 'Confirmación de entrega' });
  const submit = form.getByRole('button', { name: 'Confirmar entrega física' });
  await submit.waitFor();
  assert.equal(await submit.isDisabled(), true);
  await form.getByLabel('Receptor del equipo').fill(confirmation.receptor);
  await form.getByLabel('Evidencia de entrega').fill(confirmation.evidencia);
  assert.equal(await submit.isDisabled(), true);
  await form.getByLabel('Confirmo que el equipo fue entregado al receptor indicado.').check();
  await submit.and(reception.locator(':enabled')).waitFor();
  assert.ok(await reception.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await deliveryPanel.screenshot({ path: `${results}/01-confirmacion-movil.png` });

  const requests = [];
  await reception.route(`**/api${route}/deliveries`, async intercepted => {
    const request = intercepted.request();
    if (request.method() !== 'POST') return intercepted.continue();
    const response = await intercepted.fetch();
    requests.push({ status: response.status(), key: request.headers()['idempotency-key'], body: request.postDataJSON(), delivery: (await response.json()).delivery });
    if (requests.length === 1) await intercepted.abort('failed');
    else await intercepted.fulfill({ response });
  });
  await submit.click();
  const uncertain = deliveryPanel.getByRole('alert');
  await uncertain.waitFor();
  assert.match(await uncertain.innerText(), /El resultado está pendiente/);
  assert.equal(await form.getByLabel('Receptor del equipo').isDisabled(), true);
  await deliveryPanel.screenshot({ path: `${results}/02-reintento-movil.png` });
  await form.getByRole('button', { name: 'Reintentar la misma entrega' }).click();
  await deliveryPanel.getByText('Entrega física confirmada.').waitFor();
  assert.deepEqual(requests.map(request => request.status), [201, 200]);
  assert.ok(requests[0].key);
  assert.equal(requests[1].key, requests[0].key);
  assert.deepEqual(requests[0].body, { expectedVersion: ready.orderVersion, ...confirmation });
  assert.deepEqual(requests[1].body, requests[0].body);
  assert.deepEqual(requests[1].delivery, requests[0].delivery);

  const statePanel = reception.getByRole('region', { name: 'Estado de la orden' });
  await statePanel.getByText('Entregado', { exact: true }).waitFor();
  await reception.getByRole('region', { name: 'Comprobante de recepción' }).getByText('Entregado', { exact: true }).waitFor();
  await reception.setViewportSize({ width: 1440, height: 900 });
  await reception.reload();
  await lookup(reception, order.folio, 'Entregado');
  await deliveryPanel.getByText(confirmation.receptor, { exact: true }).waitFor();
  await deliveryPanel.getByText(confirmation.evidencia, { exact: true }).waitFor();
  await deliveryPanel.getByText(fixture.users.recepcion.name, { exact: true }).waitFor();
  assert.equal(await deliveryPanel.locator('time').getAttribute('datetime'), requests[0].delivery.recordedAt);
  assert.equal(await form.count(), 0);
  await deliveryPanel.screenshot({ path: `${results}/03-entrega-guardada-escritorio.png` });
  await statePanel.screenshot({ path: `${results}/04-movimiento-en-historial.png` });

  const { owner } = fixture;
  const { rows: stored } = await owner.query(`
    SELECT o.folio,o.state,o.version_lock AS version,d.id,d.receptor,d.evidencia,
      d.actor_id AS "actorId",d.recorded_at AS "recordedAt"
    FROM reparix.orders o JOIN reparix.order_deliveries d ON d.order_id=o.id WHERE o.id=$1`, [order.id]);
  assert.deepEqual(stored, [{
    folio: order.folio, state: 'Entregado', version: ready.orderVersion + 1, id: requests[0].delivery.id,
    ...confirmation, actorId: fixture.users.recepcion.id, recordedAt: new Date(requests[0].delivery.recordedAt),
  }]);
  const { rows: movements } = await owner.query(`
    SELECT previous_value AS "previousState",new_value AS state,actor_id AS "actorId",changed_at AS "changedAt"
    FROM reparix.order_history WHERE order_id=$1 AND field='estado' AND new_value='Entregado'`, [order.id]);
  assert.deepEqual(movements, [{
    previousState: 'Listo para recoger', state: 'Entregado', actorId: fixture.users.recepcion.id, changedAt: stored[0].recordedAt,
  }]);
  const { rows: migrations } = await owner.query(`
    SELECT version FROM reparix.schema_migrations
    WHERE version IN ('012-physical-delivery','017-complete-order-repair') ORDER BY version`);
  assert.equal(migrations.length, 2);
  assert.deepEqual(errors, []);

  await writeFile(`${results}/resultado.json`, JSON.stringify({
    listoHttp: readyResponse.status(), entregaEnDiagnosticoHttp: blockedInDiagnosis.status,
    entregaEnReparacionHttp: blockedInRepair.status, confirmacionHttp: requests[0].status,
    reintentoHttp: requests[1].status, mismaClaveEnReintento: true, mismaEntregaEnReintento: true,
    migraciones: migrations.map(row => row.version), postgresql: { entrega: stored[0], movimiento: movements[0] },
  }, null, 2) + '\n');
});
