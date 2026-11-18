import {randomUUID} from 'node:crypto';
import {digest} from '../security.js';
import {HttpError} from '../validation.js';
export async function readOrder(db,id){
 const {rows}=await db.query(`SELECT o.id,o.folio,o.state,o.received_at AS "receivedAt",o.version_lock AS version,
 c.name AS "clientName",c.phone,c.email,d.type AS "deviceType",d.brand,d.model,
 d.serial_number AS "serialNumber",d.serial_unavailable_reason AS "serialUnavailableReason",
 o.reported_fault AS "reportedFault",o.physical_condition AS "physicalCondition",
 o.accessories_confirmed AS "accessoriesConfirmed",o.physical_check_confirmed AS "physicalCheckConfirmed"
 FROM reparix.orders o JOIN reparix.clients c ON c.id=o.client_id JOIN reparix.devices d ON d.id=o.device_id WHERE o.id=$1`,[id]);
 if(!rows.length)throw new HttpError(404,'Orden no encontrada.');
 const accessories=await db.query('SELECT description FROM reparix.received_accessories WHERE order_id=$1 ORDER BY position',[id]);
 const history=await db.query(`SELECT h.field,h.previous_value AS "previousValue",h.new_value AS "newValue",h.note,h.changed_at AS "changedAt",u.display_name AS author,h.request_id AS "requestId" FROM reparix.order_history h JOIN reparix.internal_users u ON u.id=h.actor_id WHERE order_id=$1 ORDER BY changed_at,h.id`,[id]);
 const assignments=await db.query(`SELECT a.id,a.technician_id AS "technicianId",t.display_name AS "technicianName",a.assigned_at AS "assignedAt",a.assigned_by AS "assignedBy",u.display_name AS "assignedByName",a.ended_at AS "endedAt",a.ended_by AS "endedBy",e.display_name AS "endedByName" FROM reparix.order_assignments a JOIN reparix.internal_users t ON t.id=a.technician_id JOIN reparix.internal_users u ON u.id=a.assigned_by LEFT JOIN reparix.internal_users e ON e.id=a.ended_by WHERE a.order_id=$1 ORDER BY a.assigned_at,a.id`,[id]);
 return {...rows[0],accessories:accessories.rows.map(x=>x.description),history:history.rows,currentAssignment:assignments.rows.find(x=>x.endedAt===null)??null,assignmentHistory:assignments.rows};
}
export async function createOrder(pool,data,actor,key,requestId){
 const db=await pool.connect(),hash=digest(JSON.stringify(data));
 try{
  await db.query('BEGIN');
  await db.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[actor+'|'+key]);
  const previous=await db.query('SELECT request_hash,order_id FROM reparix.order_requests WHERE user_id=$1 AND request_key=$2',[actor,key]);
  if(previous.rowCount){
   if(previous.rows[0].request_hash!==hash)throw new HttpError(409,'La clave de reintento ya corresponde a otra captura. Recupera el comprobante antes de iniciar otra orden.');
   const order=await readOrder(db,previous.rows[0].order_id);await db.query('COMMIT');return {order,replayed:true};
  }
  const client=randomUUID(),device=randomUUID(),id=randomUUID();
  await db.query('INSERT INTO reparix.clients(id,name,phone,email) VALUES($1,$2,$3,$4)',[client,data.clientName,data.phone,data.email]);
  await db.query('INSERT INTO reparix.devices(id,type,brand,model,serial_number,serial_unavailable_reason) VALUES($1,$2,$3,$4,$5,$6)',[device,data.deviceType,data.brand,data.model,data.serialNumber,data.serialUnavailableReason]);
  await db.query('INSERT INTO reparix.orders(id,client_id,device_id,reported_fault,physical_condition,accessories_confirmed,physical_check_confirmed,created_by) VALUES($1,$2,$3,$4,$5,true,true,$6)',[id,client,device,data.reportedFault,data.physicalCondition,actor]);
  for(const [position,text] of data.accessories.entries())await db.query('INSERT INTO reparix.received_accessories(order_id,position,description) VALUES($1,$2,$3)',[id,position,text]);
  await db.query("INSERT INTO reparix.order_history(id,order_id,actor_id,field,previous_value,new_value,note,request_id) VALUES($1,$2,$3,'estado',NULL,'Recibido','Alta y cotejo físico confirmados',$4)",[randomUUID(),id,actor,requestId]);
  await db.query('INSERT INTO reparix.order_requests(user_id,request_key,request_hash,order_id) VALUES($1,$2,$3,$4)',[actor,key,hash,id]);
  const order=await readOrder(db,id);await db.query('COMMIT');return {order,replayed:false};
 }catch(error){await db.query('ROLLBACK');throw error;}finally{db.release();}
}
