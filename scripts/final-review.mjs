import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const hash=b=>createHash('sha256').update(b).digest('hex');
const out='artifacts/reparix-cu02',checks=[];
for(const item of JSON.parse(await readFile('evidence/source-hashes.json','utf8')))assert.equal(hash(await readFile('docs/sources/'+item.name)),item.sha256);
checks.push('Tres fuentes originales conservan SHA-256');
const rows=(await readFile(out+'/SHA256SUMS','utf8')).trim().split('\n');
let compared=0;
for(const line of rows){
 const [expected,name]=line.split('  ');
 assert(name&&!name.split('/').some(x=>x==='node_modules'||x==='work'||x==='.env'||x.endsWith('.dump')));
 assert(!name.startsWith('docs/sources/'));
 const content=await readFile(out+'/'+name);assert.equal(hash(content),expected,name);
 if(/^(server\/|client\/|db\/|scripts\/|docs\/|README\.md$|package(-lock)?\.json$|compose\.yaml$)/.test(name)){assert.equal(hash(content),hash(await readFile(name)),'Outdated package: '+name);compared++;}
}
checks.push('SHA256SUMS íntegro y '+compared+' archivos técnicos/documentales iguales al workspace');
const lock=JSON.parse(await readFile('package-lock.json','utf8'));
for(const [name,value] of Object.entries(lock.packages))if(name.startsWith('node_modules/@angular/'))assert.equal(value.version,'22.1.7');
checks.push('Todos los paquetes Angular fijados en 22.1.7');
const time=JSON.parse(await readFile('evidence/continuation-time.json','utf8'));assert.equal(time.activities.length,7);assert(time.activities.every(x=>x.status==='Finalizado'&&x.estimateMinutes>0&&x.elapsedMinutes>0));
checks.push('Siete actividades con estimación y tiempo real, status Finalizado');
for(const id of ['final-unit','final-integration','final-build','final-browser','final-audit','final-distribution-install','final-distribution-smoke','final-production-audit']){const d=JSON.parse(await readFile(`evidence/cu02/${id}.json`,'utf8'));assert.equal(d.exitCode,0,id);}
checks.push('Resultados finales de pruebas/build/auditorías/distribución con salida 0');
const audit=JSON.parse(await readFile('evidence/cu02/final-audit.log','utf8'));assert.equal(audit.metadata.vulnerabilities.total,0);
const pdf=JSON.parse(await readFile('evidence/cu02/pdf-review.json','utf8'));assert.equal(pdf.sha256,hash(await readFile('docs/psp/PSP-Eric-Daniel-Salas-Martinez.pdf')));assert.equal(pdf.pages,8);assert.equal(pdf.status,'Finalizado');
checks.push('PDF de ocho páginas renderizado y revisado visualmente, huella coincide');
const result={checkedAt:new Date().toISOString(),status:'Finalizado',files:rows.length,checks};await writeFile('evidence/cu02/final-review.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));
