import {randomBytes} from 'node:crypto';
import {writeFile} from 'node:fs/promises';
const owner=randomBytes(32).toString('hex'),app=randomBytes(32).toString('hex');
await writeFile('.env',`POSTGRES_PASSWORD=${owner}\nAPP_DB_PASSWORD=${app}\nDATABASE_URL=postgresql://reparix_app:${app}@127.0.0.1:55432/reparix\nOWNER_DATABASE_URL=postgresql://reparix_owner:${owner}@127.0.0.1:55432/reparix\nAPP_ORIGIN=http://localhost:3000\nPORT=3000\nNODE_ENV=development\n`,{flag:'wx'});
console.log('Created .env with random distinct DB credentials; existing files are never replaced.');