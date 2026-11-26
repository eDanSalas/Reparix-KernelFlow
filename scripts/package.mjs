import {mkdir,cp,writeFile,readFile,readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const out='artifacts/reparix';await mkdir(out,{recursive:true});
for(const name of ['server','client/package.json','client/dist','db','docs/hu02','docs/hu04','docs/hu05','docs/hu06','docs/hu07','docs/hu08','scripts','package.json','package-lock.json','.gitignore','.npmrc','.env.example','compose.yaml','README.md'])await cp(name,`${out}/${name}`,{recursive:true,filter:p=>!p.includes('node_modules')});
const {version}=JSON.parse(await readFile('package.json','utf8'));
await writeFile(`${out}/BUILD.json`,JSON.stringify({version,builtAt:new Date().toISOString(),angular:'22.1.7',node:process.version,lockSha256:createHash('sha256').update(await readFile('package-lock.json')).digest('hex'),requires:'Node 24, PostgreSQL, configuration and individual user'},null,2));
const manifest=[];
async function walk(dir){for(const e of await readdir(dir,{withFileTypes:true})){const p=`${dir}/${e.name}`;if(e.name==='node_modules'||e.name==='work'||e.name==='SHA256SUMS')continue;if(e.isDirectory())await walk(p);else manifest.push(`${createHash('sha256').update(await readFile(p)).digest('hex')}  ${p.slice(out.length+1)}`);}}
await walk(out);await writeFile(`${out}/SHA256SUMS`,manifest.sort().join('\n')+'\n');console.log(`Prepared ${manifest.length} files in ${out}; no secrets, source attachments or node_modules included.`);
