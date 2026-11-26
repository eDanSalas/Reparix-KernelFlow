import pg from 'pg';
import {readFile,readdir} from 'node:fs/promises';
const db=new pg.Client({connectionString:process.env.OWNER_DATABASE_URL});
if(!process.env.APP_DB_PASSWORD||process.env.APP_DB_PASSWORD.length<24)throw Error('APP_DB_PASSWORD requires at least 24 characters');
await db.connect();
try{
 await db.query('BEGIN'); await db.query('SELECT pg_advisory_xact_lock(170102026)');
 await db.query('CREATE SCHEMA IF NOT EXISTS reparix');
 await db.query('CREATE TABLE IF NOT EXISTS reparix.schema_migrations(version text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())');
 for(const file of (await readdir(new URL('../db/',import.meta.url))).filter(x=>/^\d{3}-[a-z0-9-]+\.sql$/.test(x)).sort()){
  const version=file.slice(0,-4),applied=await db.query('SELECT 1 FROM reparix.schema_migrations WHERE version=$1',[version]);
  if(!applied.rowCount){await db.query(await readFile(new URL('../db/'+file,import.meta.url),'utf8'));await db.query('INSERT INTO reparix.schema_migrations(version) VALUES($1)',[version]);}
 }
 const role=await db.query("SELECT 1 FROM pg_roles WHERE rolname='reparix_app'");
 const escaped=process.env.APP_DB_PASSWORD.replaceAll("'","''");
 if(!role.rowCount)await db.query(`CREATE ROLE reparix_app LOGIN PASSWORD '${escaped}' NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT`);
 await db.query('REVOKE ALL ON SCHEMA public FROM PUBLIC');
 await db.query('REVOKE ALL ON SCHEMA reparix FROM PUBLIC');
 await db.query('GRANT USAGE ON SCHEMA reparix TO reparix_app');
 await db.query('GRANT SELECT ON reparix.internal_users,reparix.sessions,reparix.clients,reparix.devices,reparix.orders,reparix.received_accessories,reparix.order_history,reparix.order_requests TO reparix_app');
 await db.query('GRANT INSERT ON reparix.clients,reparix.devices,reparix.orders,reparix.received_accessories,reparix.order_history,reparix.order_requests TO reparix_app');
 await db.query('GRANT INSERT,DELETE ON reparix.sessions TO reparix_app');
 await db.query('GRANT USAGE ON SEQUENCE reparix.order_folio_seq TO reparix_app');
 await db.query('GRANT SELECT,INSERT ON reparix.order_assignments TO reparix_app');
 await db.query('GRANT UPDATE(ended_at,ended_by) ON reparix.order_assignments TO reparix_app');
 await db.query('GRANT UPDATE(version_lock) ON reparix.orders TO reparix_app');
 await db.query('GRANT EXECUTE ON FUNCTION reparix.lock_active_technician(uuid) TO reparix_app');
 await db.query('GRANT SELECT,INSERT ON reparix.order_assessments TO reparix_app');
 await db.query('GRANT SELECT,INSERT ON reparix.budget_communications,reparix.budget_acceptances TO reparix_app');
 await db.query('GRANT SELECT,INSERT ON reparix.budget_rejection_channels TO reparix_app');
 await db.query('GRANT EXECUTE ON FUNCTION reparix.has_budget_authorization(uuid,uuid) TO reparix_app');
 await db.query('GRANT EXECUTE ON FUNCTION reparix.transition_order(text,uuid,integer,text,text,uuid) TO reparix_app');
 await db.query('GRANT SELECT ON reparix.internal_user_role_changes TO reparix_app');
 await db.query('GRANT EXECUTE ON FUNCTION reparix.change_internal_user_role(uuid,text,uuid) TO reparix_app');
 await db.query('GRANT EXECUTE ON FUNCTION reparix.register_internal_user(uuid,text,text,text,text,uuid) TO reparix_app');
 await db.query('GRANT SELECT ON reparix.internal_user_registrations TO reparix_app');
 await db.query('GRANT SELECT ON reparix.internal_user_deactivations TO reparix_app');
 await db.query('GRANT EXECUTE ON FUNCTION reparix.deactivate_internal_user(uuid,uuid) TO reparix_app');
 await db.query('GRANT EXECUTE ON FUNCTION reparix.start_internal_user_session(uuid,text,text,text) TO reparix_app');
 await db.query('GRANT SELECT(id,order_id,receptor,evidencia,actor_id,recorded_at) ON reparix.order_deliveries TO reparix_app');
 await db.query('GRANT EXECUTE ON FUNCTION reparix.confirm_order_delivery(text,uuid,integer,text,text,uuid,text,uuid) TO reparix_app');
 await db.query('GRANT EXECUTE ON FUNCTION reparix.complete_order_repair(text,uuid,integer,text,uuid) TO reparix_app');
 await db.query('GRANT EXECUTE ON FUNCTION reparix.cancel_order(text,uuid,integer,text,uuid) TO reparix_app');
 await db.query('COMMIT');console.log('Incremental migrations applied or already present; runtime role restricted by column.');
}catch(error){await db.query('ROLLBACK');throw error;}finally{await db.end();}
