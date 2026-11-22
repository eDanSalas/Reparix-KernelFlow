import {spawn} from 'node:child_process';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import path from 'node:path';
const out=path.resolve('artifacts/reparix'),require=createRequire(path.join(out,'server/package.json'));
for(const name of ['express','pg','helmet','express-rate-limit'])assert(require.resolve(name).startsWith(out+path.sep),'Production dependency must resolve inside distribution: '+name);
const child=spawn(process.execPath,['server/src/index.js'],{cwd:out,env:{...process.env,PORT:'3302',APP_ORIGIN:'http://localhost:3302'},stdio:['ignore','pipe','pipe']});
let output='';child.stdout.on('data',x=>output+=x);child.stderr.on('data',x=>output+=x);
try{for(let i=0;i<50;i++){try{const r=await fetch('http://127.0.0.1:3302/api/health');if(r.ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
 const health=await fetch('http://127.0.0.1:3302/api/health');assert.equal(health.status,200);assert.deepEqual(await health.json(),{status:'ok'});
 const page=await fetch('http://127.0.0.1:3302');assert.equal(page.status,200);const html=await page.text();assert(html.includes('<app-root>'));
 for(const pattern of [/src="(main-[^"]+\.js)"/,/href="(styles-[^"]+\.css)"/]){const file=html.match(pattern)?.[1];assert(file);assert.equal((await fetch('http://127.0.0.1:3302/'+file)).status,200);}
 console.log(JSON.stringify({checkedAt:new Date().toISOString(),result:'passed',checks:['Production dependencies resolve within distribution','Packaged Node server starts','PostgreSQL connection works','Angular index, JS and CSS served','Health endpoint returns ok']},null,2));
}finally{child.kill();await new Promise(r=>child.once('exit',r));}
