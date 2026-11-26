import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import pg from 'pg';
import {assignTechnician} from '../src/models/assignment-model.js';
import {assessmentAccess,readAssessments,saveAssessment} from '../src/models/assessment-model.js';
import {transitionState} from '../src/models/state-model.js';
for(const [from, title] of [
 [1,'M03 actualización 001 poblada conserva ocho tablas y folio al aplicar 002/003/004'],
 [2,'M04 actualización 002 poblada conserva nueve tablas y permite registrar diagnósticos y presupuestos'],
 [3,'M05 actualización 003 poblada conserva revisiones y permite cambios de estado'],
 [7,'M06 actualización desde 007 conserva los rechazos históricos sin canal'],
])test(title,async()=>{
 const withAssignment=from>=2;
 const name='reparix_test_'+randomUUID().replaceAll('-','');assert.match(name,/^reparix_test_[a-f0-9]{32}$/);
 const admin=new pg.Client({connectionString:process.env.OWNER_DATABASE_URL});await admin.connect();await admin.query(`CREATE DATABASE "${name}"`);
 const url=new URL(process.env.OWNER_DATABASE_URL);url.pathname='/'+name;let owner,pool;
 try{
  owner=new pg.Client({connectionString:url.href});await owner.connect();
  await owner.query("CREATE SCHEMA reparix; CREATE TABLE reparix.schema_migrations(version text PRIMARY KEY,applied_at timestamptz NOT NULL DEFAULT now())");
  await owner.query(await readFile(new URL('../../db/001-cu01.sql',import.meta.url),'utf8'));await owner.query("INSERT INTO reparix.schema_migrations(version) VALUES('001-cu01')");
  const actor=randomUUID(),tech=randomUUID(),client=randomUUID(),device=randomUUID(),order=randomUUID();
  for(const [id,role] of [[actor,'recepcion'],[tech,'tecnico']])await owner.query('INSERT INTO reparix.internal_users(id,username,display_name,password_hash,role) VALUES($1,$2,$3,$4,$5)',[id,id,'Persona sintética '+role,'not-used-synthetic',role]);
  await owner.query("INSERT INTO reparix.sessions VALUES('synthetic-session',$1,'synthetic-csrf',now()+interval '1 hour')",[actor]);
  await owner.query("INSERT INTO reparix.clients VALUES($1,'Cliente sintético','5551234567',NULL)",[client]);
  await owner.query("INSERT INTO reparix.devices VALUES($1,'Portátil','Prueba','Modelo','SERIE-DEMO',NULL)",[device]);
  await owner.query("INSERT INTO reparix.orders(id,client_id,device_id,reported_fault,physical_condition,accessories_confirmed,physical_check_confirmed,created_by) VALUES($1,$2,$3,'No enciende','Condición sintética',true,true,$4)",[order,client,device,actor]);
  await owner.query("INSERT INTO reparix.received_accessories VALUES($1,0,'Cable')",[order]);
  await owner.query("INSERT INTO reparix.order_history(id,order_id,actor_id,field,new_value,note,request_id) VALUES($1,$2,$3,'estado','Recibido','Alta sintética',$4)",[randomUUID(),order,actor,randomUUID()]);
  await owner.query('INSERT INTO reparix.order_requests VALUES($1,$2,$3,$4)',[actor,randomUUID(),'synthetic-hash',order]);
  if(withAssignment){await owner.query(await readFile(new URL('../../db/002-cu02.sql',import.meta.url),'utf8'));await owner.query("INSERT INTO reparix.schema_migrations(version) VALUES('002-cu02')");await owner.query('INSERT INTO reparix.order_assignments(id,order_id,technician_id,assigned_by) VALUES($1,$2,$3,$4)',[randomUUID(),order,tech,actor]);await owner.query('UPDATE reparix.orders SET version_lock=2 WHERE id=$1',[order]);}
  const assessment=randomUUID();
  if(from>=3){await owner.query(await readFile(new URL('../../db/003-cu03.sql',import.meta.url),'utf8'));await owner.query("INSERT INTO reparix.schema_migrations(version) VALUES('003-cu03')");const assignment=(await owner.query('SELECT id FROM reparix.order_assignments WHERE order_id=$1',[order])).rows[0].id;await owner.query("INSERT INTO reparix.order_assessments(id,order_id,assignment_id,author_id,revision,diagnosis,proposed_work,amount,currency,note) VALUES($1,$2,$3,$4,1,'Diagnóstico histórico','Trabajo histórico','45.67','MXN','Presupuesto de una orden existente')",[assessment,order,assignment,tech]);await owner.query('UPDATE reparix.orders SET version_lock=3 WHERE id=$1',[order]);}
  const rejectionId=randomUUID();
  if(from===7){
   for(const version of ['004-cu05','005-cu05-initial-state','006-budget-acceptance','007-repair-transition']){
    await owner.query(await readFile(new URL(`../../db/${version}.sql`,import.meta.url),'utf8'));
    await owner.query('INSERT INTO reparix.schema_migrations(version) VALUES($1)',[version]);
   }
   await owner.query('INSERT INTO reparix.budget_communications(order_id,assessment_id,actor_id) VALUES($1,$2,$3)',[order,assessment,actor]);
   await owner.query(`INSERT INTO reparix.order_history(id,order_id,actor_id,field,new_value,note,request_id)
     VALUES($1,$2,$3,'rechazo_presupuesto',$4,'Rechazo histórico',$5)`,[rejectionId,order,actor,assessment,randomUUID()]);
  }
  const tables=['internal_users','sessions','clients','devices','orders','received_accessories','order_history','order_requests'];
  if(withAssignment)tables.push('order_assignments');if(from>=3)tables.push('order_assessments');
  if(from===7)tables.push('budget_communications');
  const snapshot=async()=>{const result={};for(const table of tables)result[table]=(await owner.query(`SELECT to_jsonb(t)-'state_changed_at'-'state_changed_by' data FROM reparix.${table} t ORDER BY to_jsonb(t)::text`)).rows;result.sequence=(await owner.query('SELECT last_value,is_called FROM reparix.order_folio_seq')).rows;return result;};
  const before=await snapshot();assert(tables.every(x=>before[x].length>0));
  const migrate=spawnSync(process.execPath,['scripts/migrate.mjs'],{encoding:'utf8',env:{...process.env,OWNER_DATABASE_URL:url.href}});assert.equal(migrate.status,0,migrate.stderr);assert.deepEqual(await snapshot(),before);
  const appURL=new URL(process.env.DATABASE_URL);appURL.pathname='/'+name;pool=new pg.Pool({connectionString:appURL.href});
  const folio=(await owner.query('SELECT folio FROM reparix.orders WHERE id=$1',[order])).rows[0].folio;
  if(from===7){
   const user={id:actor,role:'recepcion'};
   const view=await readAssessments(pool,await assessmentAccess(pool,folio,user),user);
   assert.equal(view.budgetRejected,true);
   assert.equal(view.rejection.channel,null);
   assert.equal(view.rejections.length,1);
   assert.equal(view.rejections[0].id,rejectionId);
   assert.equal(view.rejections[0].evidence,'Rechazo histórico');
   const repeated=spawnSync(process.execPath,['scripts/migrate.mjs'],{encoding:'utf8',env:{...process.env,OWNER_DATABASE_URL:url.href}});
   assert.equal(repeated.status,0,repeated.stderr);
   assert.deepEqual(await snapshot(),before);
   return;
  }
  if(from===3){const started=await transitionState(pool,folio,{expectedVersion:3,state:'En diagnóstico',note:'Inicio después de migración'},{id:actor,role:'recepcion'},randomUUID());assert.equal(started.orderVersion,4);const pending=await transitionState(pool,folio,{expectedVersion:4,state:'Pendiente de autorización',note:'Presupuesto histórico vigente'},{id:tech,role:'tecnico'},randomUUID());assert.equal(pending.state,'Pendiente de autorización');assert.equal((await owner.query('SELECT count(*) FROM reparix.order_assessments')).rows[0].count,'1');}else if(withAssignment){await transitionState(pool,folio,{expectedVersion:2,state:'En diagnóstico',note:'Inicio tras migración'},{id:actor,role:'recepcion'},randomUUID());const saved=await saveAssessment(pool,folio,{expectedVersion:3,diagnosis:'Diagnóstico tras actualizar',proposedWork:'Trabajo tras actualizar',amount:'100.01',currency:'MXN',note:'Primera revisión'}, {id:tech,role:'tecnico'},randomUUID());assert.equal(saved.orderVersion,4);assert.equal(saved.currentAssessment.amount,'100.01');}else{const assigned=await assignTechnician(pool,folio,{technicianId:tech,expectedVersion:1,note:'Primera asignación tras actualizar'},actor,randomUUID());assert.equal(assigned.folio,folio);assert.equal(assigned.version,2);assert.equal(assigned.history.length,2);assert.equal(assigned.assignmentHistory.length,1);}
 }finally{if(pool)await pool.end();if(owner)await owner.end();await admin.query(`DROP DATABASE "${name}"`);await admin.end();}
});
