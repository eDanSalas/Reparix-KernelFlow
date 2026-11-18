import pg from 'pg';
import {randomUUID} from 'node:crypto';
import {hashPassword} from '../server/src/security.js';
const {REPARIX_USERNAME:username,REPARIX_PASSWORD:password,REPARIX_NAME:name,REPARIX_ROLE:role}=process.env;
if(!/^[a-z0-9._-]{3,80}$/.test(username||'')||!password||password.length<14||password.length>128||!name||name.length>120||!['recepcion','tecnico','administrador'].includes(role))throw Error('Set REPARIX_USERNAME, REPARIX_PASSWORD (14-128 chars), REPARIX_NAME, REPARIX_ROLE');
const db=new pg.Client({connectionString:process.env.OWNER_DATABASE_URL});await db.connect();
try{await db.query('INSERT INTO reparix.internal_users(id,username,display_name,password_hash,role) VALUES($1,$2,$3,$4,$5)',[randomUUID(),username,name,hashPassword(password),role]);console.log('Individual user created; password not printed.');}finally{await db.end();}