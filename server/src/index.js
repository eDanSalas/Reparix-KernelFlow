import pg from 'pg';
import {createApp} from './app.js';
if(!process.env.DATABASE_URL)throw Error('Configure DATABASE_URL');
const pool=new pg.Pool({connectionString:process.env.DATABASE_URL,connectionTimeoutMillis:5000,max:10});
pool.on('error',error=>console.error(JSON.stringify({event:'database-idle-error',code:error.code||'CONNECTION_ERROR'})));
const port=Number(process.env.PORT||3000),app=createApp(pool,{origin:process.env.APP_ORIGIN||`http://localhost:${port}`,production:process.env.NODE_ENV==='production'});
const server=app.listen(port,'127.0.0.1',()=>console.log(`Reparix disponible en http://localhost:${port}`));
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>server.close(async()=>{await pool.end();process.exit(0);}));
