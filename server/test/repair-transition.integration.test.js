import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, test } from 'node:test';
import { demoAcceptance, startBudgetFixture } from './fixtures/budget.js';

const repairState = 'En reparación';
const pendingState = 'Pendiente de autorización';
const repairNote = 'Inicio de reparación confirmado';
const workshopManager = { id: randomUUID(), name: 'Responsable del taller', role: 'administrador' };
let fixture, manager, otherTechnician;

before(async () => {
  fixture = await startBudgetFixture({ extraUsers: {
    responsable: workshopManager,
    tecnico_ajeno: { id: randomUUID(), name: 'Técnico ajeno', role: 'tecnico' },
  } });
  manager = await fixture.login('responsable');
  otherTechnician = await fixture.login('tecnico_ajeno');
});

after(async () => { await fixture?.close(); });

async function prepare(label, options) {
  const order = await fixture.prepareOrder(label, options);
  await fixture.post(order.route + '/budget-communications', fixture.rec, { presupuestoId: order.current.id });
  return order;
}

function acceptCurrent(order) {
  return fixture.post(order.route + '/budget-acceptances', fixture.rec, {
    presupuestoId: order.current.id, ...demoAcceptance,
  });
}

async function readState(order) {
  const response = await fixture.call(order.route + '/state', manager);
  assert.equal(response.status, 200, response.body.message);
  return response.body;
}

function startRepair(order, expectedVersion, session = manager) {
  return fixture.call(order.route + '/state', session, {
    state: repairState, expectedVersion, note: repairNote,
  });
}

async function snapshot({ order }) {
  const { rows: [row] } = await fixture.owner.query(`
    SELECT to_jsonb(o) AS "order",
      ARRAY(SELECT to_jsonb(h) FROM reparix.order_history h WHERE h.order_id=o.id ORDER BY h.id) AS history,
      ARRAY(SELECT to_jsonb(b) FROM reparix.budget_acceptances b WHERE b.order_id=o.id ORDER BY b.id) AS acceptances
    FROM reparix.orders o WHERE o.id=$1`, [order.id]);
  assert.ok(row);
  return row;
}

async function assertDenied(order, beforeState, status = 409, session = manager) {
  const before = await snapshot(order);
  const result = await startRepair(order, beforeState.orderVersion, session);
  assert.deepEqual(await snapshot(order), before);
  assert.deepEqual(await readState(order), beforeState);
  assert.equal(result.status, status, result.body.message);
}

test('HU03-01 La aceptación vigente permite iniciar reparación y registra un solo cambio', async () => {
  const order = await prepare('HU03-01');
  await acceptCurrent(order);
  const state = await readState(order);
  assert.equal(state.state, pendingState);
  assert.equal(state.authorizationRecorded, true);
  const before = await snapshot(order);

  const result = await startRepair(order, state.orderVersion);
  assert.equal(result.status, 201, result.body.message);
  assert.ok(state.allowedTransitions.includes(repairState));
  assert.equal(result.body.state, repairState);
  assert.equal(result.body.orderVersion, state.orderVersion + 1);
  assert.equal(result.body.changedBy, workshopManager.name);
  assert.deepEqual(result.body.history.slice(0, -1), state.history);
  assert.deepEqual(result.body.history.at(-1), {
    previousState: pendingState, state: repairState, note: repairNote,
    changedAt: result.body.changedAt, author: workshopManager.name,
  });
  assert.deepEqual(await readState(order), result.body);

  const saved = await snapshot(order);
  const [event] = saved.history.filter(h => h.field === 'estado' && h.new_value === repairState);
  assert.ok(event);
  assert.deepEqual(saved.history.filter(h => h.id !== event.id), before.history);
  assert.deepEqual(saved.acceptances, before.acceptances);
  assert.equal(saved.order.state, repairState);
  assert.equal(saved.order.state_changed_by, workshopManager.id);
  assert.equal(saved.order.version_lock, state.orderVersion + 1);
  assert.equal(event.previous_value, pendingState);
  assert.equal(event.actor_id, workshopManager.id);
  assert.equal(event.request_id, result.headers.get('x-request-id'));
  assert.equal(event.changed_at, saved.order.state_changed_at);

  const repeated = await startRepair(order, state.orderVersion);
  assert.equal(repeated.status, 409, repeated.body.message);
  assert.deepEqual(await snapshot(order), saved);
});

test('HU03-02 Un presupuesto comunicado sin decisión bloquea la reparación', async () => {
  const order = await prepare('HU03-02');
  const state = await readState(order);
  assert.equal(state.state, pendingState);
  assert.equal(state.authorizationRecorded, false);
  assert.ok(!state.allowedTransitions.includes(repairState));
  assert.deepEqual((await snapshot(order)).acceptances, []);
  await assertDenied(order, state);
});

test('HU03-03 Un rechazo de la revisión vigente bloquea la reparación y se conserva', async () => {
  const order = await prepare('HU03-03');
  const route = order.route + '/budget-rejections';
  const evidence = 'El cliente rechazó el importe por escrito';
  const payload = { presupuestoId: order.current.id, evidencia: evidence };
  const before = await snapshot(order);
  assert.equal((await fixture.call(route, fixture.tech, payload)).status, 403);
  assert.equal((await fixture.call(route, fixture.rec, { ...payload, evidencia: '   ' })).status, 422);
  assert.equal((await fixture.call(route, fixture.rec, { ...payload, presupuestoId: order.first.id })).status, 409);
  assert.deepEqual(await snapshot(order), before);

  const response = await fixture.call(route, fixture.rec, payload);
  assert.equal(response.status, 201, response.body.message);
  assert.equal(response.body.budgetRejected, true);
  assert.equal(response.body.authorizationRecorded, false);
  assert.equal(response.body.rejection.evidence, evidence);
  assert.equal(response.body.rejection.authorName, fixture.users.recepcion.name);
  const stored = await snapshot(order);
  const [rejection] = stored.history.filter(event => event.field === 'rechazo_presupuesto');
  assert.equal(rejection.new_value, order.current.id);
  assert.equal(rejection.note, evidence);
  assert.equal(rejection.actor_id, fixture.users.recepcion.id);
  assert.equal(rejection.request_id, response.headers.get('x-request-id'));
  assert.deepEqual(stored.order, before.order);
  assert.deepEqual(stored.acceptances, []);
  assert.equal((await fixture.call(route, fixture.rec, payload)).status, 409);
  assert.deepEqual(await snapshot(order), stored);
  const assessment = await fixture.call(order.route + '/assessments', manager);
  assert.equal(assessment.status, 200, assessment.body.message);
  assert.deepEqual(assessment.body.rejection, response.body.rejection);
  const technician = await fixture.call(order.route + '/assessments', fixture.tech);
  assert.equal(technician.body.budgetRejected, true);
  assert.equal(technician.body.rejection, undefined);
  const state = await readState(order);
  assert.equal(state.state, pendingState);
  assert.equal(state.authorizationRecorded, false);
  assert.ok(!state.allowedTransitions.includes(repairState));
  await assertDenied(order, state);
});

test('HU03-04 Emitir una revisión nueva invalida la autorización anterior y conserva su historial', async () => {
  const order = await prepare('HU03-04', { acceptFirst: true });
  const assessment = await fixture.call(order.route + '/assessments', fixture.rec);
  assert.equal(assessment.status, 200, assessment.body.message);
  assert.equal(assessment.body.currentAssessment.id, order.current.id);
  assert.ok(order.current.revision > order.first.revision);
  assert.deepEqual(assessment.body.acceptances.map(decision => decision.assessmentId), [order.first.id]);
  const stored = await snapshot(order);
  const [acceptance] = stored.acceptances;
  assert.ok(stored.history.some(event => event.field === 'aceptacion_presupuesto' && event.new_value === acceptance.id));
  const state = await readState(order);
  assert.equal(state.state, pendingState);
  assert.equal(state.authorizationRecorded, false);
  assert.ok(!state.allowedTransitions.includes(repairState));
  await assertDenied(order, state);
});

test('HU03-05 Aceptar la revisión nueva habilita la reparación y conserva ambas aceptaciones', async () => {
  const order = await prepare('HU03-05', { acceptFirst: true });
  await acceptCurrent(order);
  const state = await readState(order);
  assert.equal(state.authorizationRecorded, true);
  const before = await snapshot(order);
  assert.deepEqual(before.acceptances.map(decision => decision.assessment_id).sort(), [order.first.id, order.current.id].sort());
  const result = await startRepair(order, state.orderVersion);
  assert.equal(result.status, 201, result.body.message);
  assert.equal(result.body.state, repairState);
  const saved = await snapshot(order);
  assert.deepEqual(saved.acceptances, before.acceptances);
  assert.deepEqual(saved.history.filter(h => h.field === 'aceptacion_presupuesto'),
    before.history.filter(h => h.field === 'aceptacion_presupuesto'));
});

test('HU03-06 Una aceptación vigente no otorga permiso a recepción ni a los técnicos', async () => {
  const order = await prepare('HU03-06');
  await acceptCurrent(order);
  const state = await readState(order);
  assert.equal(state.authorizationRecorded, true);
  await assertDenied(order, state, 403, fixture.rec);
  await assertDenied(order, state, 403, fixture.tech);
  await assertDenied(order, state, 404, otherTechnician);
});

test('HU03-07 Una aceptación vigente no permite saltar directamente desde diagnóstico', async () => {
  const order = await prepare('HU03-07', { moveToPending: false });
  await acceptCurrent(order);
  const state = await readState(order);
  assert.equal(state.state, 'En diagnóstico');
  assert.equal(state.authorizationRecorded, true);
  assert.ok(!state.allowedTransitions.includes(repairState));
  await assertDenied(order, state);
});

test('HU03-08 Una aceptación posterior al rechazo habilita el inicio y conserva el rechazo en el historial', async () => {
  const order = await prepare('HU03-08');
  const route = order.route + '/budget-rejections';
  const payload = { presupuestoId: order.current.id, evidencia: 'El cliente pidió tiempo para reconsiderar' };
  await fixture.post(route, fixture.rec, payload);
  const accepted = await acceptCurrent(order);
  assert.equal(accepted.authorizationRecorded, true);
  assert.equal(accepted.budgetRejected, false);
  assert.equal(accepted.rejection.evidence, payload.evidencia);
  const before = await snapshot(order);
  assert.equal((await fixture.call(route, fixture.rec, payload)).status, 409);
  assert.deepEqual(await snapshot(order), before);

  const state = await readState(order);
  const result = await startRepair(order, state.orderVersion);
  assert.equal(result.status, 201, result.body.message);
  assert.equal(result.body.state, repairState);
  const saved = await snapshot(order);
  assert.deepEqual(saved.history.filter(event => event.field === 'rechazo_presupuesto'),
    before.history.filter(event => event.field === 'rechazo_presupuesto'));
});
