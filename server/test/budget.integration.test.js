import assert from 'node:assert/strict';
import { test } from 'node:test';
import { demoAcceptance, startBudgetFixture } from './fixtures/budget.js';

test('Aceptación del presupuesto con Express y PostgreSQL', async t => {
  const fixture = await startBudgetFixture({ logger: { error() {} } });
  t.after(() => fixture.close());
  const { owner, rec, tech, users, call, login, post, prepareOrder } = fixture;
  const { order, route, pending, first, current } = await prepareOrder();
  const other = await prepareOrder('DEMO-02');
  const acceptance = route + '/budget-acceptances';
  const communication = route + '/budget-communications';
  const payload = { presupuestoId: current.id, ...demoAcceptance };

  async function stored() {
    const { rows: [row] } = await owner.query(`
      SELECT o.state,o.version_lock AS version,o.state_changed_at AS "stateChangedAt",
        ARRAY(SELECT to_jsonb(b) FROM reparix.budget_acceptances b WHERE b.order_id=o.id ORDER BY b.id) AS decisions,
        ARRAY(SELECT to_jsonb(h) FROM reparix.order_history h WHERE h.order_id=o.id ORDER BY h.id) AS history
      FROM reparix.orders o WHERE o.id=$1`, [order.id]);
    return row;
  }

  const before = await stored();
  await t.test('Rechaza revisión anterior, ajena y vigente sin comunicar', async () => {
    for (const presupuestoId of [first.id, other.current.id, current.id]) {
      assert.equal((await call(acceptance, rec, { ...payload, presupuestoId })).status, 409);
      assert.deepEqual(await stored(), before);
    }
    assert.equal((await call(communication, rec, { presupuestoId: first.id })).status, 409);
    const view = await call(route + '/assessments', rec);
    assert.equal(view.body.currentAssessment.id, current.id);
    assert.equal(view.body.communication, null);
    assert.equal(view.body.state, 'Pendiente de autorización');
  });

  await post(communication, rec, { presupuestoId: current.id });

  await t.test('Rechaza cada campo omitido, vacío o con solo espacios', async () => {
    for (const field of Object.keys(demoAcceptance)) {
      for (const value of [undefined, '', ' \t\u00a0 ']) {
        const r = await call(acceptance, rec, { ...payload, [field]: value });
        assert.equal(r.status, 422, field);
        assert.deepEqual(await stored(), before);
      }
    }
  });

  await t.test('El técnico asignado puede consultar la orden y recibe 403 al registrar', async () => {
    assert.equal((await call(route, tech)).status, 200);
    assert.equal((await call(communication, tech, { presupuestoId: current.id })).status, 403);
    assert.equal((await call(acceptance, tech, payload)).status, 403);
    assert.deepEqual(await stored(), before);
  });

  await t.test('Revierte la decisión si falla la escritura del historial', async () => {
    await owner.query(`
      CREATE FUNCTION reparix.reject_budget_history() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        IF NEW.field='aceptacion_presupuesto' THEN RAISE EXCEPTION 'Fallo de prueba'; END IF;
        RETURN NEW;
      END $$;
      CREATE TRIGGER reject_budget_history BEFORE INSERT ON reparix.order_history
        FOR EACH ROW EXECUTE FUNCTION reparix.reject_budget_history();
    `);
    try {
      assert.equal((await call(acceptance, rec, payload)).status, 500);
      assert.deepEqual(await stored(), before);
    } finally {
      await owner.query('DROP TRIGGER reject_budget_history ON reparix.order_history; DROP FUNCTION reparix.reject_budget_history()');
    }
  });

  await t.test('Registra una sola decisión válida y conserva el historial y estado al volver a iniciar sesión', async () => {
    const { rows: [{ now: start }] } = await owner.query('SELECT clock_timestamp() AS now');
    const responses = await Promise.all([
      call(acceptance, rec, { ...payload, authorId: users.tecnico.id, recordedAt: '2000-01-01T00:00:00Z' }),
      call(acceptance, rec, { ...payload, authorId: users.tecnico.id, recordedAt: '2000-01-01T00:00:00Z' }),
    ]);
    assert.deepEqual(responses.map(r => r.status).sort(), [201, 409]);
    const result = responses.find(r => r.status === 201);
    const [saved] = result.body.acceptances;
    assert.equal(saved.assessmentId, current.id);
    assert.equal(saved.revision, 2);
    assert.equal(saved.authorId, users.recepcion.id);
    assert.equal(saved.authorName, users.recepcion.name);
    assert.equal(saved.requestId, result.headers.get('x-request-id'));
    for (const [field, value] of Object.entries(demoAcceptance)) assert.equal(saved[field], value);
    const { rows: [{ now: end }] } = await owner.query('SELECT clock_timestamp() AS now');
    assert(Date.parse(saved.recordedAt) >= start.getTime() && Date.parse(saved.recordedAt) <= end.getTime());

    const after = await stored();
    assert.equal(after.decisions.length, 1);
    const [decision] = after.decisions;
    assert.equal(decision.id, saved.id);
    assert.equal(decision.order_id, order.id);
    assert.equal(decision.assessment_id, current.id);
    assert.equal(decision.actor_id, users.recepcion.id);
    assert.equal(new Date(decision.recorded_at).toISOString(), saved.recordedAt);
    assert.equal(after.history.length, before.history.length + 1);
    const [event] = after.history.filter(h => h.field === 'aceptacion_presupuesto');
    assert.equal(event.new_value, decision.id);
    assert.equal(event.request_id, saved.requestId);
    assert.equal(event.actor_id, decision.actor_id);
    assert.equal(event.changed_at, decision.recorded_at);
    assert.equal(after.state, before.state);
    assert.equal(after.version, before.version);
    assert.deepEqual(after.stateChangedAt, before.stateChangedAt);

    const fresh = await login('recepcion');
    const read = await call(route + '/assessments', fresh);
    assert.equal(read.status, 200);
    assert.equal(read.body.state, pending.state);
    assert.deepEqual(read.body.acceptances, [saved]);
    assert.equal(read.body.authorizationRecorded, true);
    const state = await call(route + '/state', fresh);
    assert.equal(state.body.authorizationRecorded, true);
    assert.equal(state.body.state, pending.state);
    assert.deepEqual(state.body.history, pending.history);
    const techView = await call(route + '/assessments', tech);
    assert.equal(techView.body.authorizationRecorded, true);
    assert.equal(techView.body.acceptances, undefined);
  });
});
