import {readFile,writeFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
const file=process.env.TIME_FILE||'evidence/continuation-time.json';
if(!/^evidence\/(continuation-time\.json|cu0[35]\/time\.json)$/.test(file))throw Error('Unexpected time record path');
const [action,id,minutes,...description]=process.argv.slice(2);
let data;try{data=JSON.parse(await readFile(file,'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;data={modality:'Desarrollo asistido con Codex',timezone:'America/Mexico_City',measure:'Duración transcurrida; incluye espera; tiempo activo humano no medido',activities:[]};}
if(action==='start'){
 if(data.activities.some(x=>x.id===id))throw Error('Activity already recorded');
 const estimate=Number(minutes);if(!Number.isFinite(estimate)||estimate<=0)throw Error('Positive estimate required before work');
 data.activities.push({id,description:description.join(' '),estimateMinutes:estimate,estimateKind:['PREP03','PREP05'].includes(id)?'Referencia Codex; inspección previa no cronometrada':'Prospectiva Codex',startedAt:new Date().toISOString(),status:'En curso'});
}else if(action==='end'){
 const a=data.activities.find(x=>x.id===id);if(!a||a.finishedAt)throw Error('Open activity required');
 a.finishedAt=new Date().toISOString();a.elapsedMinutes=(Date.parse(a.finishedAt)-Date.parse(a.startedAt))/60000;a.status='Finalizado';
}else throw Error('Use start/end');
await mkdir(path.dirname(file),{recursive:true});await writeFile(file,JSON.stringify(data,null,2)+'\n');console.log(action+' '+id+' '+new Date().toISOString());
