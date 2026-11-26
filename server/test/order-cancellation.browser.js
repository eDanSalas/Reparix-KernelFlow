import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { test } from 'node:test';
import { chromium } from 'playwright-core';
import { demoAcceptance, startBudgetFixture } from './fixtures/budget.js';

const results = 'test-results/hu08';
const reason = 'El cliente solicitó finalizar el servicio antes de iniciar la reparación.';

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
  const panel = page.getByRole('region', { name: 'Estado de la orden' });
  await panel.getByText(state, { exact: true }).waitFor();
  return panel;
}

async function snapshot(owner, id) {
  const { rows: [result] } = await owner.query(`
    SELECT to_jsonb(o) AS "order",
      ARRAY(SELECT to_jsonb(h) FROM reparix.order_history h WHERE h.order_id=o.id ORDER BY h.id) AS history,
      ARRAY(SELECT to_jsonb(d) FROM reparix.order_deliveries d WHERE d.order_id=o.id) AS deliveries,
      ARRAY(SELECT to_jsonb(a) FROM reparix.order_assignments a WHERE a.order_id=o.id ORDER BY a.id) AS assignments,
      ARRAY(SELECT to_jsonb(a) FROM reparix.order_assessments a WHERE a.order_id=o.id ORDER BY a.id) AS assessments
    FROM reparix.orders o WHERE o.id=$1`, [id]);
  return result;
}

test('HU08-E2E Angular cancela con motivo y PostgreSQL conserva la custodia y el historial', { timeout: 60000 }, async t => {
  const administrator = { id: randomUUID(), name: 'Responsable de taller HU-08', role: 'administrador' };
  const fixture = await startBudgetFixture({
    port: Number(process.env.REPARIX_BROWSER_PORT || 3001), extraUsers: { administrador: administrator },
  });
  let browser;
  t.after(async () => {
    try { await browser?.close(); }
    finally { await fixture.close(); }
  });
  browser = await chromium.launch({ channel: process.env.REPARIX_BROWSER_CHANNEL || 'msedge' });
  await mkdir(results, { recursive: true });

  const { owner, users, rec, tech, call, post } = fixture;
  const active = await fixture.prepareOrder('HU08-CANCELACION', { moveToPending: false });
  const incompatible = await fixture.prepareOrder('HU08-EN-REPARACION');
  await post(incompatible.route + '/budget-communications', rec, { presupuestoId: incompatible.current.id });
  await post(incompatible.route + '/budget-acceptances', rec, { presupuestoId: incompatible.current.id, ...demoAcceptance });
  const admin = await fixture.login('administrador');
  const repair = await post(incompatible.route + '/state', admin, {
    state: 'En reparación', expectedVersion: incompatible.pending.orderVersion, note: 'Reparación iniciada con presupuesto autorizado',
  });

  const errors = [];
  const reception = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const technician = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  for (const page of [reception, technician]) page.on('pageerror', error => errors.push(error.message));

  await login(reception, fixture, 'recepcion');
  await lookup(reception, incompatible.order.folio, 'En reparación');
  assert.equal(await reception.getByRole('region', { name: 'Cancelación de la orden' }).count(), 0);
  const repairing = await snapshot(owner, incompatible.order.id);
  const incompatibleAttempt = await call(incompatible.route + '/cancellations', rec, {
    expectedVersion: repair.orderVersion, motivo: reason,
  });
  assert.equal(incompatibleAttempt.status, 409);
  assert.deepEqual(await snapshot(owner, incompatible.order.id), repairing);

  const before = await snapshot(owner, active.order.id);
  const path = active.route + '/cancellations';
  await login(technician, fixture, 'tecnico');
  await lookup(technician, active.order.folio, 'En diagnóstico', 'Consultar orden asignada por folio');
  assert.equal(await technician.getByRole('region', { name: 'Cancelación de la orden' }).count(), 0);
  const unauthorized = await call(path, tech, { expectedVersion: before.order.version_lock, motivo: reason });
  assert.equal(unauthorized.status, 403);
  const missing = await call(path, rec, { expectedVersion: before.order.version_lock, motivo: '' });
  assert.equal(missing.status, 422);
  assert.deepEqual(await snapshot(owner, active.order.id), before);

  const statePanel = await lookup(reception, active.order.folio, 'En diagnóstico');
  const cancellation = statePanel.getByRole('region', { name: 'Cancelación de la orden' });
  await cancellation.getByRole('button', { name: 'Cancelar orden', exact: true }).click();
  const form = cancellation.getByRole('form', { name: `Cancelar orden ${active.order.folio}` });
  const submit = form.getByRole('button', { name: 'Confirmar cancelación' });
  await form.waitFor();
  assert.equal(await submit.isDisabled(), true);
  await form.getByLabel('Motivo de cancelación').fill('   ');
  assert.equal(await submit.isDisabled(), true);
  await form.getByRole('button', { name: 'Volver' }).click();
  assert.deepEqual(await snapshot(owner, active.order.id), before);
  await cancellation.getByRole('button', { name: 'Cancelar orden', exact: true }).click();
  await form.getByLabel('Motivo de cancelación').fill(reason);
  await submit.and(reception.locator(':enabled')).waitFor();
  assert.ok(await reception.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await cancellation.screenshot({ path: `${results}/01-confirmacion-movil.png` });

  const [response] = await Promise.all([
    reception.waitForResponse(response => response.url().endsWith(path) && response.request().method() === 'POST'),
    submit.click(),
  ]);
  assert.equal(response.status(), 201);
  assert.deepEqual(response.request().postDataJSON(), { expectedVersion: before.order.version_lock, motivo: reason });
  const confirmed = await response.json();
  assert.equal(confirmed.state, 'Cancelado');
  assert.equal(confirmed.canCancel, false);
  assert.deepEqual(confirmed.allowedTransitions, []);
  await statePanel.getByText('Cancelado', { exact: true }).waitFor();
  await reception.getByRole('region', { name: 'Comprobante de recepción' }).getByText('Cancelado', { exact: true }).waitFor();
  await cancellation.getByText('El equipo permanece bajo custodia del taller.').waitFor();
  assert.equal(await reception.getByRole('region', { name: 'Entrega física' }).count(), 0);
  assert.equal(await reception.getByRole('button', { name: 'Registrar comunicación al cliente' }).count(), 0);
  assert.equal(await reception.getByRole('button', { name: 'Registrar aceptación' }).count(), 0);
  assert.equal(await reception.getByRole('button', { name: 'Registrar rechazo' }).count(), 0);

  await reception.setViewportSize({ width: 1440, height: 900 });
  await reception.reload();
  await lookup(reception, active.order.folio, 'Cancelado');
  const movement = statePanel.locator('.state-history').filter({ hasText: reason });
  await movement.waitFor();
  assert.match(await movement.innerText(), /En diagnóstico → Cancelado/);
  assert.match(await movement.innerText(), new RegExp(users.recepcion.name));
  const displayedDate = await movement.locator('time').getAttribute('datetime');
  assert.ok(displayedDate);
  await statePanel.screenshot({ path: `${results}/02-custodia-e-historial-escritorio.png` });

  const technicalState = await lookup(technician, active.order.folio, 'Cancelado', 'Consultar orden asignada por folio');
  assert.equal(await technicalState.getByRole('button', { name: 'Confirmar cambio de estado' }).count(), 0);
  assert.equal(await technician.getByRole('button', { name: 'Guardar nueva revisión' }).count(), 0);

  const saved = await snapshot(owner, active.order.id);
  const stored = saved.history.filter(event => event.new_value === 'Cancelado');
  assert.equal(stored.length, 1);
  const [event] = stored;
  assert.deepEqual(saved.history.filter(prior => prior.id !== event.id), before.history);
  assert.deepEqual(saved.order, {
    ...before.order, state: 'Cancelado', version_lock: before.order.version_lock + 1,
    state_changed_at: event.changed_at, state_changed_by: event.actor_id,
  });
  assert.equal(event.previous_value, 'En diagnóstico');
  assert.equal(event.note, reason);
  assert.equal(event.actor_id, users.recepcion.id);
  assert.equal(Date.parse(event.changed_at), Date.parse(displayedDate));
  assert.deepEqual(saved.deliveries, []);
  assert.deepEqual(saved.assignments, before.assignments);
  assert.deepEqual(saved.assessments, before.assessments);
  const migration = await owner.query("SELECT version FROM reparix.schema_migrations WHERE version='013-order-cancellation'");
  assert.equal(migration.rowCount, 1);
  assert.deepEqual(errors, []);

  await writeFile(`${results}/resultado.json`, JSON.stringify({
    cancelacionHttp: response.status(), estadoIncompatibleHttp: incompatibleAttempt.status,
    sinPermisoHttp: unauthorized.status, sinMotivoHttp: missing.status,
    migracion: migration.rows[0].version, folio: active.order.folio, estado: saved.order.state,
    version: saved.order.version_lock, entregasRegistradas: saved.deliveries.length,
    postgresql: { anterior: event.previous_value, actual: event.new_value, motivo: event.note,
      responsableId: event.actor_id, fecha: event.changed_at },
  }, null, 2) + '\n');
});
