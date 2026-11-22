import express from 'express';
import helmet from 'helmet';
import {rateLimit} from 'express-rate-limit';
import {randomUUID,randomBytes} from 'node:crypto';
import {existsSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {digest,verifyPassword,cookieOptions} from './security.js';
import {HttpError} from './validation.js';
import {orderController} from './controllers/order-controller.js';
import {assignmentController} from './controllers/assignment-controller.js';
import {assessmentController} from './controllers/assessment-controller.js';
import {stateController} from './controllers/state-controller.js';
export function createApp(pool,{origin='http://localhost:3000',production=false,logger=console}={}){
 const app=express();app.disable('x-powered-by');
 app.use((req,res,next)=>{req.requestId=randomUUID();res.set('X-Request-Id',req.requestId);next();});
 app.use(helmet({contentSecurityPolicy:{directives:{'style-src':["'self'","'unsafe-inline'"],'script-src':["'self'"]}}}));
 app.use('/api',rateLimit({windowMs:60000,limit:120,standardHeaders:'draft-8',legacyHeaders:false}));
 app.use('/api',(req,res,next)=>{res.set('Cache-Control','no-store');if(!['GET','HEAD','OPTIONS'].includes(req.method)&&req.get('origin')!==origin)return next(new HttpError(403,'Origen de solicitud no permitido.'));next();});
 app.use(express.json({limit:'32kb',strict:true}));
 app.get('/api/health',async(req,res)=>{await pool.query('SELECT 1');res.json({status:'ok'});});
 const loginLimit=rateLimit({windowMs:15*60000,limit:10,standardHeaders:'draft-8',legacyHeaders:false});
 app.post('/api/session',loginLimit,async(req,res)=>{
  const {username,password}=req.body||{};
  if(typeof username!=='string'||username.length>80||typeof password!=='string'||password.length>128)throw new HttpError(401,'Credenciales inválidas.');
  const result=await pool.query('SELECT * FROM reparix.internal_users WHERE username=$1',[username]);
  const u=result.rows[0],valid=verifyPassword(password,u?.password_hash);
  if(!u||!valid||!u.active)throw new HttpError(401,'Credenciales inválidas.');
  const token=randomBytes(32).toString('hex'),csrf=randomBytes(32).toString('hex');
  await pool.query("INSERT INTO reparix.sessions(token_hash,user_id,csrf_token,expires_at) VALUES($1,$2,$3,now()+interval '8 hours')",[digest(token),u.id,csrf]);
  res.cookie('reparix_session',token,cookieOptions(production));res.json({user:{name:u.display_name,username:u.username,role:u.role},csrfToken:csrf});
 });
 app.use('/api',async(req,res,next)=>{
  const raw=(req.headers.cookie||'').split(';').map(x=>x.trim()).find(x=>x.startsWith('reparix_session='))?.slice(16);
  if(!raw||!/^[a-f0-9]{64}$/.test(raw))throw new HttpError(401,'Inicia sesión.');
  const {rows}=await pool.query('SELECT u.id,u.display_name,u.username,u.role,s.csrf_token FROM reparix.sessions s JOIN reparix.internal_users u ON u.id=s.user_id WHERE s.token_hash=$1 AND s.expires_at>now() AND u.active=true',[digest(raw)]);
  if(!rows.length)throw new HttpError(401,'La sesión no es válida o expiró.');req.user=rows[0];req.sessionHash=digest(raw);
  if(!['GET','HEAD'].includes(req.method)&&req.get('X-CSRF-Token')!==req.user.csrf_token)throw new HttpError(403,'La solicitud requiere verificación de sesión.');next();
 });
 app.get('/api/session',(req,res)=>res.json({user:{name:req.user.display_name,username:req.user.username,role:req.user.role},csrfToken:req.user.csrf_token}));
 app.delete('/api/session',async(req,res)=>{await pool.query('DELETE FROM reparix.sessions WHERE token_hash=$1',[req.sessionHash]);res.clearCookie('reparix_session',{path:'/api',httpOnly:true,sameSite:'strict',secure:production});res.sendStatus(204);});
 const permit=(req,res,next)=>['recepcion','administrador'].includes(req.user.role)?next():next(new HttpError(403,'Tu rol no permite registrar ni consultar recepciones.'));
 const orders=orderController(pool),assignments=assignmentController(pool);
 app.post('/api/orders',permit,orders.create);app.get('/api/orders/:folio',orders.get);
 app.get('/api/technicians',permit,assignments.list);app.post('/api/orders/:folio/assignments',permit,assignments.assign);
 const assessments=assessmentController(pool);app.get('/api/orders/:folio/assessments',assessments.get);app.post('/api/orders/:folio/assessments',assessments.create);
 const states=stateController(pool);app.get('/api/orders/:folio/state',states.get);app.post('/api/orders/:folio/state',states.create);
 app.use('/api',(req,res,next)=>next(new HttpError(404,'Operación no encontrada.')));
 const dist=fileURLToPath(new URL('../../client/dist/client/browser/',import.meta.url));
 if(existsSync(dist)){app.use(express.static(dist));app.get('/{*path}',(req,res)=>res.sendFile(path.join(dist,'index.html')));}
 app.use((error,req,res,next)=>{
  let status=error.status||500;if(status<400||status>599)status=500;
  if(status>=500)logger.error(JSON.stringify({requestId:req.requestId,code:error.code||'INTERNAL_ERROR'}));
  res.status(status).json({message:status>=500?(req.path.endsWith('/state')?'No fue posible confirmar el cambio. Conserva la nota y consulta el estado del folio.':req.path.endsWith('/assessments')?'No fue posible confirmar la revisión. Conserva la captura y consulta las revisiones del folio.':'No fue posible confirmar el guardado. Conserva la captura y reintenta con la misma clave.'):error.type==='entity.parse.failed'?'El cuerpo JSON no es válido.':error.message,fields:error.fields,conflict:error.conflict,requestId:req.requestId});
 });return app;
}
