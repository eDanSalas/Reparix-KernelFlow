import { randomUUID } from 'node:crypto';
import { HttpError } from '../validation.js';
import { assessmentAccess, readAssessments, readBudgetStatus } from './assessment-model.js';
import { RegistroAceptacionPresupuesto } from './registro-aceptacion-presupuesto.js';

export const canRecordBudget = user => ['recepcion', 'administrador'].includes(user?.role);

async function saveBudgetRecord(pool, folio, user, write) {
  const db = await pool.connect();
  try {
    await db.query('BEGIN');
    // Assessment revisions, assignments and state transitions use the same order lock.
    const order = await assessmentAccess(db, folio, user, { lock: true });
    if (order.state === 'Cancelado') throw new HttpError(409, 'La orden está cancelada.');
    const { rows: [latest] } = await db.query(`
      SELECT id, revision, assignment_id FROM reparix.order_assessments
      WHERE order_id=$1 ORDER BY revision DESC LIMIT 1`, [order.id]);
    const current = latest?.assignment_id === order.assignment?.id ? latest : null;
    const status = await readBudgetStatus(db, order.id, current?.id);
    await write(db, order, current, status);
    const result = await readAssessments(db, order, user);
    await db.query('COMMIT');
    return result;
  } catch (error) {
    await db.query('ROLLBACK');
    throw error;
  } finally {
    db.release();
  }
}

export function recordCommunication(pool, folio, assessmentId, user) {
  return saveBudgetRecord(pool, folio, user, async (db, order, current, status) => {
    if (current?.id !== assessmentId) throw new HttpError(409, 'Consulta la revisión vigente antes de registrar la comunicación.');
    if (status.communicatedAt) throw new HttpError(409, 'La comunicación de esta revisión ya está registrada.');
    await db.query(`
      INSERT INTO reparix.budget_communications(order_id,assessment_id,actor_id)
      VALUES($1,$2,$3)`, [order.id, assessmentId, user.id]);
  });
}

export function recordRejection(pool, folio, { presupuestoId, canal, evidencia }, user, requestId) {
  return saveBudgetRecord(pool, folio, user, async (db, order, current, status) => {
    if (current?.id !== presupuestoId || !status.communicatedAt) {
      throw new HttpError(409, 'El presupuesto debe estar vigente y haber sido comunicado al cliente.');
    }
    if (order.state === 'En reparación' || status.accepted || status.rejection) {
      throw new HttpError(409, 'No se puede rechazar una revisión con una decisión registrada o una reparación en curso.');
    }
    const historyId = randomUUID();
    await db.query(`
      INSERT INTO reparix.order_history(id,order_id,actor_id,changed_at,field,new_value,note,request_id)
      VALUES($1,$2,$3,clock_timestamp(),'rechazo_presupuesto',$4,$5,$6)`,
    [historyId, order.id, user.id, presupuestoId, evidencia, requestId]);
    await db.query(`
      INSERT INTO reparix.budget_rejection_channels(history_id,channel)
      VALUES($1,$2)`, [historyId, canal]);
  });
}

export function recordAcceptance(pool, folio, data, user, requestId) {
  return saveBudgetRecord(pool, folio, user, async (db, order, current, status) => {
    const service = new RegistroAceptacionPresupuesto({
      controlAcceso: { tienePermiso: canRecordBudget },
      ordenReparacion: { obtenerPorFolio: () => order },
      presupuesto: {
        obtenerVigenteComunicado: () => current && {
          ...current, vigente: true, comunicado: Boolean(status.communicatedAt),
        },
      },
      decisionPresupuesto: {
        async guardar(decision) {
          if (status.accepted) throw new HttpError(409, 'Esta revisión ya tiene una aceptación registrada.');
          const id = randomUUID();
          await db.query(`
            INSERT INTO reparix.budget_acceptances
              (id,order_id,assessment_id,channel,evidence,responsible,actor_id,recorded_at)
            VALUES($1,$2,$3,$4,$5,$6,$7,clock_timestamp())`, [
            id, decision.ordenId, decision.presupuestoId, decision.canal, decision.evidencia,
            decision.responsable, decision.autor,
          ]);
          return { id };
        },
      },
      historial: {
        async registrar(evento) {
          await db.query(`
            INSERT INTO reparix.order_history
              (id,order_id,actor_id,changed_at,field,previous_value,new_value,note,request_id)
            SELECT $1,b.order_id,b.actor_id,b.recorded_at,'aceptacion_presupuesto',NULL,b.id::text,$3,$4
            FROM reparix.budget_acceptances b WHERE b.id=$2`, [
            randomUUID(), evento.decisionId,
            `Aceptación de la revisión ${evento.revision}`, requestId,
          ]);
        },
      },
    });
    await service.registrar({ ...data, folio, usuario: user });
  });
}
