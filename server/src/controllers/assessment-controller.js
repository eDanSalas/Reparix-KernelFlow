import {HttpError,validateAssessment} from '../validation.js';
import {assessmentAccess,readAssessments,saveAssessment} from '../models/assessment-model.js';
export function assessmentController(pool){return {
 get:async(req,res)=>{
  if(!/^RPX-\d{12}$/.test(req.params.folio))throw new HttpError(404,'Orden no encontrada.');
  const db=await pool.connect();try{await db.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');const order=await assessmentAccess(db,req.params.folio,req.user);const result=await readAssessments(db,order,req.user);await db.query('COMMIT');res.json(result);}catch(e){await db.query('ROLLBACK');throw e;}finally{db.release();}
 },
 create:async(req,res)=>{
  if(req.user.role!=='tecnico')throw new HttpError(403,'Solo el técnico asignado registra diagnóstico y presupuesto.');
  if(!/^RPX-\d{12}$/.test(req.params.folio))throw new HttpError(404,'Orden no encontrada.');
  res.status(201).json(await saveAssessment(pool,req.params.folio,validateAssessment(req.body),req.user,req.requestId));
 }
};}
