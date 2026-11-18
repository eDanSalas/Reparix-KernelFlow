import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const hash=b=>createHash('sha256').update(b).digest('hex'),out='artifacts/reparix-cu03',checks=[];
for(const item of JSON.parse(await readFile('evidence/source-hashes.json','utf8')))assert.equal(hash(await readFile('docs/sources/'+item.name)),item.sha256);
for(const name of ['PSP-Eric-Daniel-Salas-Martinez.md','PSP-Eric-Daniel-Salas-Martinez.pdf'])assert.equal(hash(await readFile('docs/psp/'+name)),hash(await readFile('work/before-cu03-20261104/docs/psp/'+name)));
for(const name of ['001-cu01.sql','002-cu02.sql'])assert.equal(hash(await readFile('db/'+name)),hash(await readFile('work/before-cu03-20261104/db/'+name)));
checks.push('Fuentes originales, PSP CU-01/CU-02 de Eric y migraciones 001/002 intactos');
const rows=(await readFile(out+'/SHA256SUMS','utf8')).trim().split('\n');let compared=0;
for(const line of rows){const [expected,name]=line.split('  ');assert(name&&!name.split('/').some(x=>['node_modules','work','.env'].includes(x)||x.endsWith('.dump')));assert(!name.startsWith('docs/sources/'));const content=await readFile(out+'/'+name);assert.equal(hash(content),expected,name);if(/^(server\/|client\/|db\/|scripts\/|docs\/|README\.md$|package(-lock)?\.json$|compose\.yaml$)/.test(name)){assert.equal(hash(content),hash(await readFile(name)),'Outdated package: '+name);compared++;}}
checks.push('SHA256SUMS verificado y '+compared+' archivos técnicos/documentales iguales al workspace');
const lock=JSON.parse(await readFile('package-lock.json','utf8')),previous=JSON.parse(await readFile('work/before-cu03-20261104/package-lock.json','utf8'));previous.version=lock.version;previous.packages[''].version=lock.packages[''].version;assert.deepEqual(previous,lock);
for(const [p,v] of Object.entries(lock.packages))if(p.startsWith('node_modules/@angular/'))assert.equal(v.version,'22.1.7');checks.push('Dependencias preservadas; Angular/CLI 22.1.7');
const time=JSON.parse(await readFile('evidence/cu03/time.json','utf8'));assert.equal(time.activities.length,5);assert(time.activities.every(x=>x.status==='Finalizado'&&x.estimateMinutes>0&&x.elapsedMinutes>0));checks.push('Cinco actividades con estimación y duración observada; Finalizado');
for(const id of ['unit','final-integration','build','browser','browser-regression','migration-local','migration-populated','recovery','distribution-install','distribution-smoke','production-audit'])assert.equal(JSON.parse(await readFile(`evidence/cu03/${id}.json`,'utf8')).exitCode,0,id);
const browser=JSON.parse(await readFile('evidence/cu03/browser-result.json','utf8')),recovery=JSON.parse(await readFile('evidence/cu03/recovery-result.json','utf8'));assert.equal(browser.checks.length,9);assert.deepEqual(browser.pageErrors,[]);assert.equal(recovery.checks.length,5);assert.equal(Object.keys(recovery.rows).length,11);assert.equal(JSON.parse(await readFile('evidence/cu03/production-audit.log','utf8')).metadata.vulnerabilities.total,0);
checks.push('Pruebas/build/recuperación/distribución con salida 0 y auditoría de producción sin hallazgos conocidos');
const pdf=JSON.parse(await readFile('evidence/cu03/pdf-review.json','utf8'));assert.equal(pdf.sha256,hash(await readFile('docs/psp/PSP-Luis-Alberto-Hernandez-Velasco-CU03.pdf')));assert.equal(pdf.pages,6);assert.equal(pdf.status,'Finalizado');checks.push('PSP de Luis de seis páginas renderizado y revisado visualmente');
const result={checkedAt:new Date().toISOString(),status:'Finalizado',files:rows.length,checks};await writeFile('evidence/cu03/final-review.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));
