from pathlib import Path
from xml.sax.saxutils import escape
import re,json
from reportlab.platypus import SimpleDocTemplate,Paragraph,Spacer,Table,TableStyle,PageBreak,Image,KeepTogether
from reportlab.lib.styles import getSampleStyleSheet,ParagraphStyle
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.lib.utils import ImageReader
root=Path(__file__).resolve().parents[1]
fontdir=Path('C:/Windows/Fonts')
pdfmetrics.registerFont(TTFont('Segoe',str(fontdir/'segoeui.ttf')))
pdfmetrics.registerFont(TTFont('SegoeBold',str(fontdir/'segoeuib.ttf')))
pdfmetrics.registerFontFamily('Segoe',normal='Segoe',bold='SegoeBold',italic='Segoe',boldItalic='SegoeBold')
styles=getSampleStyleSheet()
styles.add(ParagraphStyle(name='BodyCustom',fontName='Segoe',fontSize=9.2,leading=13,spaceAfter=7,textColor=colors.black))
styles.add(ParagraphStyle(name='TableCustom',fontName='Segoe',fontSize=8,leading=11,spaceAfter=0))
styles.add(ParagraphStyle(name='HeaderCell',fontName='SegoeBold',fontSize=8,leading=11,textColor=colors.white))
for name in ['Title','Heading1','Heading2','Heading3']:
 styles[name].fontName='SegoeBold';styles[name].textColor=colors.black;styles[name].keepWithNext=True
styles['Title'].fontSize=25;styles['Title'].leading=32;styles['Title'].alignment=0
styles['Heading1'].fontSize=16;styles['Heading1'].leading=21
styles['Heading2'].fontSize=12;styles['Heading2'].leading=17
styles['Heading3'].fontSize=10.5;styles['Heading3'].leading=15
width=A4[0]-96
story=[]
def p(t,style='BodyCustom'):
 t=escape(t)
 t=re.sub(r'\*\*(.*?)\*\*',r'<b>\1</b>',t)
 return Paragraph(t,styles[style])
story += [Spacer(1,70),p('Mi vida bajo el PSP','Title'),p('Reparix desarrollo incremental','Heading1'),Spacer(1,24),p('Eric Daniel Salas Martínez','Heading2'),p('Metodologías de Desarrollo de Software'),p('Docente del formato Beatriz Osorio Urrutia'),p('Apertura y revisión 4 de noviembre de 2026'),Spacer(1,24),p('Desarrollo asistido con Codex. Tiempo real: duración transcurrida observada, con esperas incluidas. Estimaciones de referencia para trabajo histórico y prospectivas para la continuación. Tiempo activo humano no medido; capacidad del equipo y aceptación formal separadas.'),PageBreak()]
lines=(root/'docs/psp/PSP-Eric-Daniel-Salas-Martinez.md').read_text(encoding='utf-8').splitlines();i=1
while i<len(lines):
 line=lines[i].strip()
 if not line:i+=1;continue
 if line.startswith('|'):
  rows=[]
  while i<len(lines) and lines[i].strip().startswith('|'):
   cells=[c.strip() for c in lines[i].strip().strip('|').split('|')]
   if not all(re.fullmatch(r':?-+:?',c or '-') for c in cells):rows.append(cells)
   i+=1
  n=len(rows[0]);weights=[1]*n
  if n==4:weights=[1.4,1,1.5,2.4]
  elif n==5:weights=[2.5,1.6,1.6,1,1]
  elif n==7:weights=[1.1,1.4,.8,.8,1.25,1.25,1.7]
  elif n==3:weights=[1.6,1.7,2.7]
  widths=[width*w/sum(weights) for w in weights]
  cells=[[p(c,'HeaderCell' if r==0 else 'TableCustom') for c in row] for r,row in enumerate(rows)]
  table=Table(cells,colWidths=widths,repeatRows=1,hAlign='LEFT')
  table.setStyle(TableStyle([('BACKGROUND',(0,0),(-1,0),colors.HexColor('#254e43')),('ROWBACKGROUNDS',(0,1),(-1,-1),[colors.white,colors.HexColor('#f2f5f3')]),('GRID',(0,0),(-1,-1),.4,colors.HexColor('#d9d9d9')),('VALIGN',(0,0),(-1,-1),'MIDDLE'),('LEFTPADDING',(0,0),(-1,-1),6),('RIGHTPADDING',(0,0),(-1,-1),6),('TOPPADDING',(0,0),(-1,-1),7),('BOTTOMPADDING',(0,0),(-1,-1),7)]))
  group=[table]
  if story and isinstance(story[-1],Paragraph) and story[-1].style.name.startswith('Heading'):
   group.insert(0,story.pop())
  elif len(story)>1 and isinstance(story[-1],Paragraph) and isinstance(story[-2],Paragraph) and story[-2].style.name.startswith('Heading'):
   group.insert(0,story.pop());group.insert(0,story.pop())
  story.extend([KeepTogether(group),Spacer(1,12)]);continue
 if line.startswith('### '):story.append(p(line[4:],'Heading2'))
 elif line.startswith('## '):story.append(p(line[3:],'Heading1'))
 else:
  para=[line];i+=1
  while i<len(lines) and lines[i].strip() and not lines[i].strip().startswith(('#','|')):
   if re.match(r'^\d+\.',lines[i].strip()):break
   para.append(lines[i].strip());i+=1
  story.append(p(' '.join(para)));continue
 i+=1
story += [PageBreak(),p('Evidencia técnica observada','Heading1'),p('Histórico CU-01: 35 comprobaciones distintas (7 unitarias, 17 integración, 8 navegador, 3 recuperación). Continuación CU-02: 69 (10 unitarias, 40 integración incluida migración 001 poblada, 15 navegador, 4 recuperación). No se suman padres de Node ni repeticiones como nuevas funciones. Angular 22.1.7 compilado. Resultados y límites en docs/verification.md.'),p('Captura histórica de comprobante con datos sintéticos','Heading2')]
for name in ['receipt']:
 file=root/'evidence/browser'/f'{name}.png';w,h=ImageReader(str(file)).getSize();scale=min(width/w,510/h);story.append(Image(str(file),width=w*scale,height=h*scale))
story += [PageBreak(),p('Pruebas y recuperación','Heading1')]
for source in ['cu02/browser-result.json','cu02/recovery-result.json']:
 file=root/'evidence'/source
 if 'browser-result' in source and (root/'evidence/cu02/final/browser-result.json').exists():file=root/'evidence/cu02/final/browser-result.json'
 if not file.exists():file=root/'evidence'/source.split('/')[-1]
 data=json.loads(file.read_text(encoding='utf-8'))
 story.append(p('Navegador' if 'browser-result' in source else 'Recuperación','Heading2'))
 story.append(p('Inicio UTC '+data['startedAt']+'; fin UTC '+data['finishedAt']+'; resultado '+data['status']))
 for check in data['checks']:story.append(p(check))
 if 'restoreMilliseconds' in data:story.append(p(f"Muestra sintética: {data['backupBytes']} bytes; ensayo de copia/restauración {data['restoreMilliseconds']} ms. No representa RTO acordado. {len(data['rows'])} tablas comparadas con igualdad de contenido."))
story.append(p('La duración asistida está registrada en la bitácora PSP. Tiempo activo humano no medido. Revisión independiente y decisión de cierre TSP permanecen pendientes.'))
def footer(canvas,doc):
 canvas.setFont('Segoe',8);canvas.setFillColor(colors.HexColor('#52625b'));canvas.drawString(48,27,'Reparix OpenUP  |  PSP académico');canvas.drawRightString(A4[0]-48,27,str(doc.page))
out=root/'docs/psp/PSP-Eric-Daniel-Salas-Martinez.pdf'
SimpleDocTemplate(str(out),pagesize=A4,leftMargin=48,rightMargin=48,topMargin=44,bottomMargin=44,title='Mi vida bajo el PSP Reparix CU 01',author='Registro para Eric Daniel Salas Martínez').build(story,onFirstPage=footer,onLaterPages=footer)
print(out)
