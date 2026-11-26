import {HttpError,validateCancellation,validateRepairCompletion,validateStateTransition} from '../validation.js';
import {cancelOrder,completeRepair,readState,transitionState} from '../models/state-model.js';
export function stateController(pool){return {
 get:async(req,res)=>{
  if(!/^RPX-\d{12}$/.test(req.params.folio))throw new HttpError(404,'Orden no encontrada.');
  const db=await pool.connect();try{await db.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');const result=await readState(db,req.params.folio,req.user);await db.query('COMMIT');res.json(result);}catch(e){await db.query('ROLLBACK');throw e;}finally{db.release();}
 },
 create:async(req,res)=>{if(!/^RPX-\d{12}$/.test(req.params.folio))throw new HttpError(404,'Orden no encontrada.');res.status(201).json(await transitionState(pool,req.params.folio,validateStateTransition(req.body),req.user,req.requestId));},
 complete:async(req,res)=>{
  const {folio}=req.params;
  if(!/^RPX-\d{12}$/.test(folio))throw new HttpError(404,'Orden no encontrada.');
  res.status(201).json(await completeRepair(pool,folio,validateRepairCompletion(req.body),req.user,req.requestId));
 },
 cancel:async(req,res)=>{
  const {folio}=req.params;
  if(!/^RPX-\d{12}$/.test(folio))throw new HttpError(404,'Orden no encontrada.');
  const data=validateCancellation(req.body);
  res.status(201).json(await cancelOrder(pool,folio,data,req.user,req.requestId));
 }
};}
