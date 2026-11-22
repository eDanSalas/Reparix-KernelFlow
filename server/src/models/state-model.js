import {HttpError} from '../validation.js';
import {assessmentAccess} from './assessment-model.js';
export async function readState(db,folio,user){
 const order=await assessmentAccess(db,folio,user);
 const history=(await db.query(`SELECT h.previous_value AS "previousState",h.new_value AS state,h.note,h.changed_at AS "changedAt",u.display_name AS author FROM reparix.order_history h JOIN reparix.internal_users u ON u.id=h.actor_id WHERE h.order_id=$1 AND h.field='estado' ORDER BY h.changed_at,h.id`,[order.id])).rows;
 const meta=(await db.query(`SELECT COALESCE(o.state_changed_at,o.received_at) AS "changedAt",u.display_name AS "changedBy" FROM reparix.orders o JOIN reparix.internal_users u ON u.id=COALESCE(o.state_changed_by,o.created_by) WHERE o.id=$1`,[order.id])).rows[0];
 const ready=order.assignment&&(await db.query("SELECT 1 FROM reparix.internal_users WHERE id=$1 AND active AND role='tecnico'",[order.assignment.technician_id])).rowCount>0;
 const latest=(await db.query('SELECT assignment_id FROM reparix.order_assessments WHERE order_id=$1 ORDER BY revision DESC LIMIT 1',[order.id])).rows[0];
 const allowedTransitions=[];let blockedReason='';
 if(order.state==='Pendiente de autorización')blockedReason='Se requiere la autorización del presupuesto para iniciar la reparación.';
 else if(!ready)blockedReason='Se requiere una asignación vigente a un técnico activo.';
 else if(order.state==='Recibido')allowedTransitions.push('En diagnóstico');
 else if(latest?.assignment_id===order.assignment?.id)allowedTransitions.push('Pendiente de autorización');
 else blockedReason='Registra diagnóstico y presupuesto para la asignación vigente.';
 return {folio,state:order.state,orderVersion:order.version,...meta,history,allowedTransitions,blockedReason,authorizationRecorded:false};
}
export async function transitionState(pool,folio,data,user,requestId){
 const db=await pool.connect();
 try{await db.query('BEGIN');await db.query('SELECT reparix.transition_order($1,$2,$3,$4,$5,$6)',[folio,user.id,data.expectedVersion,data.state,data.note,requestId]);const view=await readState(db,folio,user);await db.query('COMMIT');return view;}
 catch(error){await db.query('ROLLBACK');const status={P5001:422,P5002:404,P5003:403,P5004:409}[error.code];if(status){const e=new HttpError(status,error.message);if(error.code==='P5004'&&/^\d+$/.test(error.detail||''))e.conflict={currentVersion:Number(error.detail)};throw e;}throw error;}finally{db.release();}
}
