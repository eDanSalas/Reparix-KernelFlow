import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { test } from 'node:test';
import { chromium } from 'playwright-core';
import { startBudgetFixture } from './fixtures/budget.js';

const results = 'test-results/hu02';
const channel = 'WhatsApp';
const evidence = 'El cliente rechazó el presupuesto por escrito. Caso HU-02.';
const rejectedMessage = 'El cliente rechazó el presupuesto vigente.';

async function openOrder(page, fixture, username, folio) {
  await page.goto(fixture.url);
  const login = page.getByRole('heading', { name: 'Iniciar sesión' });
  await login.waitFor();
  await page.getByLabel('Usuario').fill(username);
  await page.getByLabel('Contraseña').fill(fixture.password);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await lookup(page, folio);
}

async function lookup(page, folio) {
  await page.getByLabel('Recuperar comprobante por folio').fill(folio);
  await page.getByRole('button', { name: 'Consultar', exact: true }).click();
  await page.getByRole('region', { name: 'Diagnóstico y presupuesto' }).waitFor();
}

test('HU02-E2E Angular registra el rechazo y PostgreSQL conserva la custodia y el historial', { timeout: 60000 }, async t => {
  const manager = { id: randomUUID(), name: 'Responsable del taller', role: 'administrador' };
  const port = Number(process.env.REPARIX_BROWSER_PORT || 3001);
  const fixture = await startBudgetFixture({ port, extraUsers: { responsable: manager } });
  t.after(() => fixture.close());
  const browser = await chromium.launch({ channel: process.env.REPARIX_BROWSER_CHANNEL || 'msedge' });
  t.after(() => browser.close());
  await mkdir(results, { recursive: true });

  const { order, route, current, pending } = await fixture.prepareOrder('HU02-E2E');
  const { rows: [before] } = await fixture.owner.query('SELECT * FROM reparix.orders WHERE id=$1', [order.id]);
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  await openOrder(page, fixture, 'recepcion', order.folio);

  const form = page.getByRole('form', { name: 'Registrar rechazo del presupuesto' });
  assert.equal(await form.count(), 0, 'Primero se comunica la revisión vigente.');
  const [communication] = await Promise.all([
    page.waitForResponse(response => response.url().endsWith(route + '/budget-communications')),
    page.getByRole('button', { name: 'Registrar comunicación al cliente' }).click(),
  ]);
  assert.equal(communication.status(), 201);

  await form.waitFor();
  const submit = form.getByRole('button', { name: 'Registrar rechazo' });
  const disabledSubmit = submit.and(page.locator(':disabled'));
  assert.equal(await submit.isDisabled(), true);
  await form.getByLabel('Evidencia del rechazo').fill(evidence);
  assert.equal(await submit.isDisabled(), true, 'La evidencia sola no habilita el registro.');
  await form.getByLabel('Canal del rechazo').fill(channel);
  await form.getByLabel('Evidencia del rechazo').clear();
  await disabledSubmit.waitFor();
  await form.getByLabel('Evidencia del rechazo').fill(evidence);
  await submit.and(page.locator(':enabled')).waitFor();
  assert.ok(await form.evaluate(element => element.scrollWidth <= element.clientWidth));
  await form.screenshot({ path: `${results}/01-captura-movil.png` });

  const [response] = await Promise.all([
    page.waitForResponse(result => result.url().endsWith(route + '/budget-rejections')),
    submit.click(),
  ]);
  assert.equal(response.status(), 201);
  assert.deepEqual(response.request().postDataJSON(), {
    presupuestoId: current.id, canal: channel, evidencia: evidence,
  });
  const [decision] = (await response.json()).rejections;
  await page.getByText('Rechazo guardado en el historial.', { exact: true }).waitFor();

  await page.reload();
  await lookup(page, order.folio);
  const budgetPanel = page.getByRole('region', { name: 'Diagnóstico y presupuesto' });
  const history = budgetPanel.locator('article').filter({ hasText: `Revisión ${current.revision} · Rechazada` });
  await history.getByText(evidence, { exact: false }).waitFor();
  assert.match(await history.innerText(), /Ana Recepción Demo/);
  assert.match(await history.innerText(), /WhatsApp/);
  assert.equal(await history.locator('time').getAttribute('datetime'), decision.recordedAt);
  await budgetPanel.screenshot({ path: `${results}/02-historial-movil.png` });
  assert.equal(await form.count(), 0, 'Un rechazo existente no se registra dos veces.');

  const admin = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  admin.on('pageerror', error => pageErrors.push(error.message));
  await openOrder(admin, fixture, 'responsable', order.folio);
  const statePanel = admin.getByRole('region', { name: 'Estado de la orden' });
  await statePanel.getByText(rejectedMessage, { exact: true }).waitFor();
  assert.equal(await statePanel.getByRole('option', { name: 'En reparación', exact: true }).count(), 0);
  await statePanel.screenshot({ path: `${results}/03-reparacion-bloqueada.png` });
  const managerSession = await fixture.login('responsable');
  const blocked = await fixture.call(route + '/state', managerSession, {
    state: 'En reparación', expectedVersion: pending.orderVersion, note: 'Intento de iniciar una orden rechazada',
  });
  assert.equal(blocked.status, 409);

  const { rows: [after] } = await fixture.owner.query('SELECT * FROM reparix.orders WHERE id=$1', [order.id]);
  assert.deepEqual(after, before);
  const { rows: events } = await fixture.owner.query(`
    SELECT h.id,h.order_id AS "orderId",h.new_value AS "assessmentId",r.channel,h.note AS evidence,
      h.actor_id AS "authorId",h.changed_at AS "recordedAt",h.request_id AS "requestId"
    FROM reparix.order_history h
    JOIN reparix.budget_rejection_channels r ON r.history_id=h.id
    WHERE h.order_id=$1 AND h.field='rechazo_presupuesto'`, [order.id]);
  assert.equal(events.length, 1);
  const [stored] = events;
  assert.deepEqual(stored, {
    id: decision.id, orderId: order.id, assessmentId: current.id, channel, evidence,
    authorId: fixture.users.recepcion.id, recordedAt: new Date(decision.recordedAt),
    requestId: response.headers()['x-request-id'],
  });
  const { rows: [delivery] } = await fixture.owner.query("SELECT to_regclass('reparix.order_deliveries') AS relation");
  if (delivery.relation) {
    const result = await fixture.owner.query('SELECT 1 FROM reparix.order_deliveries WHERE order_id=$1', [order.id]);
    assert.equal(result.rowCount, 0);
  }
  assert.deepEqual(pageErrors, []);
  await writeFile(`${results}/resultado.json`, JSON.stringify({
    folio: order.folio, revision: current.revision, estado: after.state, custodiaSinCambios: true,
    registroHttp: response.status(), intentoReparacionHttp: blocked.status, postgresql: stored,
  }, null, 2) + '\n');
});
