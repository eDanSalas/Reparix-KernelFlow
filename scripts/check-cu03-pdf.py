from pathlib import Path
import json
import pypdfium2 as pdfium
from pypdf import PdfReader
from PIL import Image,ImageOps,ImageDraw
root=Path(__file__).resolve().parents[1];out=root/'work/psp-cu03-qa';out.mkdir(parents=True,exist_ok=True)
path=root/'docs/psp/PSP-Luis-Alberto-Hernandez-Velasco-CU03.pdf';pdf=pdfium.PdfDocument(path);pages=[]
for i,page in enumerate(pdf):
 im=page.render(scale=1.5).to_pil().convert('RGB');im.save(out/f'page-{i+1:02}.png');pages.append(im)
for offset in range(0,len(pages),4):
 sheet=Image.new('RGB',(840,1250),'#d5d5d5');draw=ImageDraw.Draw(sheet)
 for j,im in enumerate(pages[offset:offset+4]):
  thumb=ImageOps.contain(im,(400,590));x=10+(j%2)*420;y=25+(j//2)*625;sheet.paste(thumb,(x,y));draw.text((x,y-18),f'Page {offset+j+1}',fill='black')
 sheet.save(out/f'sheet-{offset//4+1}.png')
text='\n'.join(p.extract_text() for p in PdfReader(path).pages)
for term in ['Luis Alberto Hernández Velasco','CU-03','95','58 escenarios','Finalizado','tiempo activo humano']:assert term.lower() in text.lower(),term
(out/'extracted.txt').write_text(text,encoding='utf-8');print(json.dumps({'pages':len(pages),'renderedAll':True,'textAssertionsPassed':True,'output':str(out)}))
