from pathlib import Path
import zipfile, hashlib, json
root=Path(__file__).resolve().parents[1]
source=root/'artifacts/reparix-openup'
files=[line.split('  ',1)[1] for line in (source/'SHA256SUMS').read_text(encoding='utf-8').splitlines()]
files.append('SHA256SUMS')
assert all(Path(f).name!='.env' and 'node_modules' not in Path(f).parts and 'work' not in Path(f).parts for f in files)
archive=root/'artifacts/reparix-openup.zip'
with zipfile.ZipFile(archive,'w',zipfile.ZIP_DEFLATED,compresslevel=8) as z:
 for file in files: z.write(source/file,'reparix-openup/'+file)
with zipfile.ZipFile(archive) as z:
 assert z.testzip() is None
 for line in z.read('reparix-openup/SHA256SUMS').decode('utf-8').splitlines():
  digest,name=line.split('  ',1)
  assert hashlib.sha256(z.read('reparix-openup/'+name)).hexdigest()==digest,name
result={'archive':str(archive),'bytes':archive.stat().st_size,'files':len(files),'sha256':hashlib.sha256(archive.read_bytes()).hexdigest(),'manifestVerified':True,'secretsAndDependenciesExcluded':True}
(root/'evidence/cu05/archive-result.json').write_text(json.dumps(result,indent=2),encoding='utf-8')
print(json.dumps(result,indent=2))
