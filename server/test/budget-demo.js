import assert from 'node:assert/strict';
import { createInterface } from 'node:readline';
import { demoAcceptance, startBudgetFixture } from './fixtures/budget.js';

const fixture = await startBudgetFixture({ port: 3001 });
try {
  const { order, current, pending } = await fixture.prepareOrder();
  console.log(`Reparix: ${fixture.url} · Folio: ${order.folio} · Revisión: ${current.revision}`);
  console.log(`ID de revisión: ${current.id} · Estado inicial: ${pending.state}`);
  console.log(`Cuentas de prueba: recepcion y tecnico · Contraseña temporal: ${fixture.password}`);
  console.log('Tras guardar desde el navegador, pulsa Enter para verificar PostgreSQL. Termina con Ctrl+C.');

  const cli = createInterface({ input: process.stdin, output: process.stdout });
  const stop = () => cli.close();
  cli.on('SIGINT', stop);
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);

  for await (const line of cli) {
    if (line.trim().toLowerCase() === 'salir') break;
    try {
      const { rows } = await fixture.owner.query(`
        SELECT o.folio,o.state,o.version_lock AS version,o.state_changed_at AS "stateChangedAt",
          a.id AS "assessmentId",a.revision,b.channel AS canal,b.evidence AS evidencia,
          b.responsible AS responsable,u.username,b.recorded_at AS "recordedAt",
          h.changed_at AS "historyAt",h.request_id AS "requestId",h.actor_id=b.actor_id AS "sameAuthor"
        FROM reparix.orders o
        JOIN reparix.budget_acceptances b ON b.order_id=o.id
        JOIN reparix.order_assessments a ON a.order_id=o.id AND a.id=b.assessment_id
        JOIN reparix.internal_users u ON u.id=b.actor_id
        JOIN reparix.order_history h ON h.order_id=o.id AND h.field='aceptacion_presupuesto' AND h.new_value=b.id::text
        WHERE o.id=$1`, [order.id]);
      assert.equal(rows.length, 1, 'Se espera una aceptación con su entrada de historial.');
      const [saved] = rows;
      assert.equal(saved.assessmentId, current.id);
      assert.equal(saved.revision, current.revision);
      assert.equal(saved.state, pending.state);
      assert.equal(saved.version, pending.orderVersion);
      assert.equal(saved.stateChangedAt.toISOString(), pending.changedAt);
      assert.equal(saved.username, 'recepcion');
      assert.equal(saved.sameAuthor, true);
      assert.deepEqual(saved.recordedAt, saved.historyAt);
      for (const [field, value] of Object.entries(demoAcceptance)) assert.equal(saved[field], value);
      console.log(JSON.stringify(saved, null, 2));
    } catch (error) {
      console.error(error.message);
    }
  }
  cli.close();
} finally {
  await fixture.close();
}
