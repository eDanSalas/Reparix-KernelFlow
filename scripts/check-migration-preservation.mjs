import pg from 'pg';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {writeFile,mkdir} from 'node:fs/promises';
import assert from 'node:assert/strict';
const owner=new pg.Client({connectionString:process.env.OWNER_DATABASE_URL});await owner.connect();
const result={startedAt:new Date().toISOString(),checks:[]};
const originalTables=['internal_users','sessions','clients','devices','orders','received_accessories','order_history','order_requests','order_assignments','order_assessments'];
async function snapshot(){const data={};for(const table of originalTables){const r=await owner.query(`SELECT to_jsonb(t)-'state_changed_at'-'state_changed_by' data FROM reparix.${table} t ORDER BY to_jsonb(t)::text`);data[table]={rows:r.rowCount,sha256:createHash('sha256').update(JSON.stringify(r.rows)).digest('hex')};}data.sequence=(await owner.query('SELECT last_value,is_called FROM reparix.order_folio_seq')).rows;return data;}
try{
 const before=await snapshot();
 for(let i=0;i<2;i++){const r=spawnSync(process.execPath,['scripts/migrate.mjs'],{encoding:'utf8',env:process.env});assert.equal(r.status,0,r.stderr);}
 const after=await snapshot();assert.deepEqual(after,before);result.snapshot=after;
 result.checks.push('M01 migración incremental y repetición conservan diez tablas previas y secuencia; metadatos nuevos excluidos de la comparación histórica');
 result.migrations=(await owner.query('SELECT version FROM reparix.schema_migrations ORDER BY version')).rows;
 assert.deepEqual(result.migrations.map(x=>x.version),['001-cu01','002-cu02','003-cu03','004-cu05','005-cu05-initial-state']);assert.equal((await owner.query("SELECT 1 FROM pg_trigger WHERE tgname='initial_order_state' AND tgrelid='reparix.orders'::regclass AND NOT tgisinternal")).rowCount,1);result.checks.push('M02 cinco migraciones presentes y protección de alta disponible');
 result.status='passed';
}catch(e){result.status='failed';result.error=e.message;process.exitCode=1;}finally{result.finishedAt=new Date().toISOString();await owner.end();await mkdir('evidence/cu05',{recursive:true});await writeFile('evidence/cu05/migration-result.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));}
