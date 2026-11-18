import {randomUUID} from 'node:crypto';
import {HttpError} from '../validation.js';

export async function assessmentAccess(db,folio,user,{lock=false}={}){
 const result=await db.query('SELECT id,version_lock AS version,state FROM reparix.orders WHERE folio=$1'+(lock?' FOR UPDATE':''),[folio]);
 if(!result.rowCount)throw new HttpError(404,'Orden no encontrada.');
 const order=result.rows[0];
 const assignment=(await db.query('SELECT id,technician_id FROM reparix.order_assignments WHERE order_id=$1 AND ended_at IS NULL',[order.id])).rows[0];
 if(user.role==='tecnico'&&assignment?.technician_id!==user.id)throw new HttpError(404,'Orden no encontrada.');
 if(lock&&!(await db.query('SELECT reparix.lock_active_technician($1) AS valid',[user.id])).rows[0].valid)throw new HttpError(403,'Se requiere un técnico activo autorizado.');
 return {...order,assignment};
}
export async function readAssessments(db,order){
 const {rows}=await db.query(`SELECT a.id,a.revision,a.assignment_id AS "assignmentId",a.diagnosis,a.proposed_work AS "proposedWork",a.amount::text AS amount,a.currency,a.note,a.author_id AS "authorId",u.display_name AS "authorName",a.registered_at AS "registeredAt" FROM reparix.order_assessments a JOIN reparix.internal_users u ON u.id=a.author_id WHERE a.order_id=$1 ORDER BY a.revision`,[order.id]);
 const latest=rows.at(-1)??null;
 return {orderVersion:order.version,state:order.state,assessments:rows,latestAssessment:latest,currentAssessment:latest?.assignmentId===order.assignment?.id?latest:null,authorizationRecorded:false};
}
export async function saveAssessment(pool,folio,data,user,requestId){
 const db=await pool.connect();
 try{
  await db.query('BEGIN');
  const order=await assessmentAccess(db,folio,user,{lock:true});
  if(order.version!==data.expectedVersion){const e=new HttpError(409,'La orden cambió. Consulta las revisiones y confirma de nuevo.');e.conflict={currentVersion:order.version};throw e;}
  if(order.state!=='En diagnóstico')throw new HttpError(409,'El diagnóstico solo se registra en En diagnóstico. Consulta el estado vigente.');
  const previous=(await db.query('SELECT id,revision FROM reparix.order_assessments WHERE order_id=$1 ORDER BY revision DESC LIMIT 1',[order.id])).rows[0];
  const id=randomUUID(),revision=(previous?.revision??0)+1;
  await db.query('INSERT INTO reparix.order_assessments(id,order_id,assignment_id,author_id,revision,diagnosis,proposed_work,amount,currency,note) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)',[id,order.id,order.assignment.id,user.id,revision,data.diagnosis,data.proposedWork,data.amount,data.currency,data.note]);
  await db.query('UPDATE reparix.orders SET version_lock=version_lock+1 WHERE id=$1',[order.id]);
  await db.query("INSERT INTO reparix.order_history(id,order_id,actor_id,field,previous_value,new_value,note,request_id) VALUES($1,$2,$3,'diagnostico_presupuesto',$4,$5,$6,$7)",[randomUUID(),order.id,user.id,previous?.id??null,id,data.note,requestId]);
  order.version++;const result=await readAssessments(db,order);await db.query('COMMIT');return result;
 }catch(e){await db.query('ROLLBACK');throw e;}finally{db.release();}
}
