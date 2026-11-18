import {createOrder,readOrder} from '../models/order-model.js';
import {validateOrder,HttpError,uuidPattern} from '../validation.js';
import {technicalView} from '../models/assignment-model.js';
export function orderController(pool){return {
 create:async(req,res)=>{
  const key=req.get('Idempotency-Key');if(!uuidPattern.test(key||''))throw new HttpError(400,'Falta una clave válida para reintentar el registro.');
  const data=validateOrder(req.body),result=await createOrder(pool,data,req.user.id,key,req.requestId);res.status(result.replayed?200:201).json(result);
 },
 get:async(req,res)=>{
  if(!/^RPX-\d{12}$/.test(req.params.folio))throw new HttpError(404,'Orden no encontrada.');
  const db=await pool.connect();
  try{
   await db.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
   const found=await db.query(`SELECT o.id FROM reparix.orders o WHERE o.folio=$1 AND ($2::text<>'tecnico' OR EXISTS (SELECT 1 FROM reparix.order_assignments a WHERE a.order_id=o.id AND a.technician_id=$3 AND a.ended_at IS NULL))`,[req.params.folio,req.user.role,req.user.id]);
   if(!found.rowCount)throw new HttpError(404,'Orden no encontrada.');
   const order=await readOrder(db,found.rows[0].id);await db.query('COMMIT');res.json({order:req.user.role==='tecnico'?technicalView(order):order});
  }catch(e){await db.query('ROLLBACK');throw e;}finally{db.release();}
 }
};}
