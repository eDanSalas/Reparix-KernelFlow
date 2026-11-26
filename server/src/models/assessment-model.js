import {randomUUID} from 'node:crypto';
import {HttpError} from '../validation.js';

export async function assessmentAccess(db,folio,user,{lock=false}={}){
 const result=await db.query('SELECT id,version_lock AS version,state FROM reparix.orders WHERE folio=$1'+(lock?' FOR UPDATE':''),[folio]);
 if(!result.rowCount)throw new HttpError(404,'Orden no encontrada.');
 const order=result.rows[0];
 const assignment=(await db.query('SELECT id,technician_id FROM reparix.order_assignments WHERE order_id=$1 AND ended_at IS NULL',[order.id])).rows[0];
 if(user.role==='tecnico'&&assignment?.technician_id!==user.id)throw new HttpError(404,'Orden no encontrada.');
 if(lock&&user.role==='tecnico'&&!(await db.query('SELECT reparix.lock_active_technician($1) AS valid',[user.id])).rows[0].valid)throw new HttpError(403,'Se requiere un técnico activo autorizado.');
 return {...order,assignment};
}
export async function readAssessments(db,order,user){
 const {rows}=await db.query(`SELECT a.id,a.revision,a.assignment_id AS "assignmentId",a.diagnosis,a.proposed_work AS "proposedWork",a.amount::text AS amount,a.currency,a.note,a.author_id AS "authorId",u.display_name AS "authorName",a.registered_at AS "registeredAt" FROM reparix.order_assessments a JOIN reparix.internal_users u ON u.id=a.author_id WHERE a.order_id=$1 ORDER BY a.revision`,[order.id]);
 const latest=rows.at(-1)??null;
 const current=latest?.assignmentId===order.assignment?.id?latest:null;
 const budget=await readBudgetStatus(db,order.id,current?.id);
 const result={
  orderVersion:order.version,state:order.state,assessments:rows,latestAssessment:latest,currentAssessment:current,
  authorizationRecorded:budget.authorized,budgetRejected:Boolean(budget.rejection)&&!budget.authorized,
  communication:budget.communicatedAt?{recordedAt:budget.communicatedAt}:null,
 };
 if(user.role!=='tecnico'){
  result.rejection=budget.rejection;
  const {rows:acceptances}=await db.query(`
   SELECT b.id,b.assessment_id AS "assessmentId",a.revision,b.channel AS canal,b.evidence AS evidencia,
     b.responsible AS responsable,h.actor_id AS "authorId",u.display_name AS "authorName",
     h.changed_at AS "recordedAt",h.request_id AS "requestId"
   FROM reparix.budget_acceptances b
   JOIN reparix.order_assessments a ON a.order_id=b.order_id AND a.id=b.assessment_id
   JOIN reparix.order_history h ON h.order_id=b.order_id AND h.field='aceptacion_presupuesto' AND h.new_value=b.id::text
   JOIN reparix.internal_users u ON u.id=h.actor_id
   WHERE b.order_id=$1 ORDER BY h.changed_at,h.id`,[order.id]);
  result.acceptances=acceptances;
  const {rows:rejections}=await db.query(`
   SELECT h.id,a.id AS "assessmentId",a.revision,rc.channel,h.note AS evidence,
     h.actor_id AS "authorId",u.display_name AS "authorName",h.changed_at AS "recordedAt"
   FROM reparix.order_history h
   JOIN reparix.order_assessments a ON a.order_id=h.order_id AND a.id::text=h.new_value
   JOIN reparix.internal_users u ON u.id=h.actor_id
   LEFT JOIN reparix.budget_rejection_channels rc ON rc.history_id=h.id
   WHERE h.order_id=$1 AND h.field='rechazo_presupuesto'
   ORDER BY h.changed_at DESC,h.id DESC`,[order.id]);
  result.rejections=rejections;
 }
 return result;
}
export async function readBudgetStatus(db,orderId,assessmentId){
 const emptyStatus={communicatedAt:null,accepted:false,authorized:false,rejection:null};
 if(!assessmentId)return emptyStatus;
 const {rows}=await db.query(`
  SELECT c.communicated_at AS "communicatedAt",b.id IS NOT NULL AS accepted,
    reparix.has_budget_authorization($1,$2) AS authorized, r.rejection
  FROM reparix.budget_communications c
  LEFT JOIN reparix.budget_acceptances b USING (order_id,assessment_id)
  LEFT JOIN LATERAL (
    SELECT jsonb_build_object('recordedAt',h.changed_at,'authorName',u.display_name,
      'evidence',h.note,'channel',rc.channel) AS rejection
    FROM reparix.order_history h JOIN reparix.internal_users u ON u.id=h.actor_id
    LEFT JOIN reparix.budget_rejection_channels rc ON rc.history_id=h.id
    WHERE h.order_id=c.order_id AND h.field='rechazo_presupuesto' AND h.new_value=c.assessment_id::text
    ORDER BY h.changed_at DESC,h.id DESC LIMIT 1
  ) r ON true
  WHERE c.order_id=$1 AND c.assessment_id=$2`,[orderId,assessmentId]);
 return rows[0]??emptyStatus;
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
  order.version++;const result=await readAssessments(db,order,user);await db.query('COMMIT');return result;
 }catch(e){await db.query('ROLLBACK');throw e;}finally{db.release();}
}
