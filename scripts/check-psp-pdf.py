from pathlib import Path
import json
import pypdfium2 as pdfium
from pypdf import PdfReader
from PIL import Image,ImageOps,ImageDraw
root=Path(__file__).resolve().parents[1]
out=root/'work/psp-continuation-qa';out.mkdir(parents=True,exist_ok=True)
path=root/'docs/psp/PSP-Eric-Daniel-Salas-Martinez.pdf'
pdf=pdfium.PdfDocument(path); reader=PdfReader(path)
pages=[]
for i,page in enumerate(pdf):
 image=page.render(scale=1.5).to_pil().convert('RGB'); image.save(out/f'page-{i+1:02}.png');pages.append(image)
for offset in range(0,len(pages),4):
 canvas=Image.new('RGB',(840,1250),'#d5d5d5'); draw=ImageDraw.Draw(canvas)
 for j,p in enumerate(pages[offset:offset+4]):
  thumb=ImageOps.contain(p,(400,590));x=10+(j%2)*420;y=25+(j//2)*625;canvas.paste(thumb,(x,y));draw.text((x,y-18),f'Page {offset+j+1}',fill='black')
 canvas.save(out/f'sheet-{offset//4+1}.png')
text='\n'.join(p.extract_text() for p in reader.pages)
assert 'desarrollo asistido' in text.lower()
assert '20.870803' in text
assert 'Finalizado' in text
assert not any(x in text for x in ['horas humanas y la decisión','Estimación inicial personal min','Pendiente de declaración de Eric'])
(out/'extracted.txt').write_text(text,encoding='utf-8')
print(json.dumps({'pages':len(pages),'renderedAll':True,'textAssertionsPassed':True,'output':str(out)}))
