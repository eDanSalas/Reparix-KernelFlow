import {randomUUID} from 'node:crypto';
import {HttpError} from '../validation.js';
import {readOrder} from './order-model.js';

export async function assignTechnician(pool,folio,data,actor,requestId){
 const db=await pool.connect();
 try{
  await db.query('BEGIN');
  const {rows}=await db.query('SELECT id,version_lock,state FROM reparix.orders WHERE folio=$1 FOR UPDATE',[folio]);
  if(!rows.length)throw new HttpError(404,'Orden no encontrada.');
  const order=rows[0];
  if(order.version_lock!==data.expectedVersion){const e=new HttpError(409,'La orden cambió. Consulta la versión vigente y confirma de nuevo.');e.conflict={currentVersion:order.version_lock};throw e;}
  if(!['Recibido','En diagnóstico'].includes(order.state))throw new HttpError(409,'La asignación está cerrada mientras el presupuesto espera autorización.');
  const technician=await db.query('SELECT reparix.lock_active_technician($1) AS valid',[data.technicianId]);
  if(!technician.rows[0].valid)throw new HttpError(422,'Selecciona un técnico activo autorizado.');
  const current=await db.query('SELECT id,technician_id FROM reparix.order_assignments WHERE order_id=$1 AND ended_at IS NULL',[order.id]);
  if(current.rows[0]?.technician_id===data.technicianId)throw new HttpError(409,'Ese técnico ya tiene la asignación vigente.');
  if(current.rowCount)await db.query('UPDATE reparix.order_assignments SET ended_at=clock_timestamp(),ended_by=$1 WHERE id=$2',[actor,current.rows[0].id]);
  await db.query('INSERT INTO reparix.order_assignments(id,order_id,technician_id,assigned_by) VALUES($1,$2,$3,$4)',[randomUUID(),order.id,data.technicianId,actor]);
  await db.query('UPDATE reparix.orders SET version_lock=version_lock+1 WHERE id=$1',[order.id]);
  await db.query("INSERT INTO reparix.order_history(id,order_id,actor_id,field,previous_value,new_value,note,request_id) VALUES($1,$2,$3,'tecnico',$4,$5,$6,$7)",[randomUUID(),order.id,actor,current.rows[0]?.technician_id??null,data.technicianId,data.note,requestId]);
  const result=await readOrder(db,order.id);await db.query('COMMIT');return result;
 }catch(e){await db.query('ROLLBACK');throw e;}finally{db.release();}
}

export function technicalView(order){
 const {folio,state,version,receivedAt,deviceType,brand,model,serialNumber,serialUnavailableReason,reportedFault,physicalCondition,accessories,currentAssignment}=order;
 const assignment=currentAssignment?{id:currentAssignment.id,technicianId:currentAssignment.technicianId,technicianName:currentAssignment.technicianName,assignedAt:currentAssignment.assignedAt}:null;
 return {folio,state,version,receivedAt,deviceType,brand,model,serialNumber,serialUnavailableReason,reportedFault,physicalCondition,accessories,currentAssignment:assignment};
}
