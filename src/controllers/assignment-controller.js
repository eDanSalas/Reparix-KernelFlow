import {assignTechnician} from '../models/assignment-model.js';
import {validateAssignment,HttpError} from '../validation.js';
export function assignmentController(pool){return {
 list:async(req,res)=>{const result=await pool.query("SELECT id,display_name AS name FROM reparix.internal_users WHERE active AND role='tecnico' ORDER BY display_name,id");res.json({technicians:result.rows});},
 assign:async(req,res)=>{
  if(!/^RPX-\d{12}$/.test(req.params.folio))throw new HttpError(404,'Orden no encontrada.');
  res.status(201).json({order:await assignTechnician(pool,req.params.folio,validateAssignment(req.body),req.user.id,req.requestId)});
 }
};}
