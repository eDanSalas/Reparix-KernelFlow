from pathlib import Path
from xml.sax.saxutils import escape
import re,json
from reportlab.platypus import SimpleDocTemplate,Paragraph,Spacer,Table,TableStyle,KeepTogether,PageBreak
from reportlab.lib.styles import getSampleStyleSheet,ParagraphStyle
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
root=Path(__file__).resolve().parents[1]
fonts=Path('C:/Windows/Fonts')
pdfmetrics.registerFont(TTFont('Segoe',str(fonts/'segoeui.ttf')));pdfmetrics.registerFont(TTFont('SegoeBold',str(fonts/'segoeuib.ttf')))
pdfmetrics.registerFontFamily('Segoe',normal='Segoe',bold='SegoeBold',italic='Segoe',boldItalic='SegoeBold')
styles=getSampleStyleSheet()
styles.add(ParagraphStyle(name='Body',fontName='Segoe',fontSize=9.5,leading=14,spaceAfter=8))
styles.add(ParagraphStyle(name='Cell',fontName='Segoe',fontSize=8,leading=11))
styles.add(ParagraphStyle(name='HeadCell',fontName='SegoeBold',fontSize=8,leading=11,textColor=colors.white))
for name in ['Title','Heading1','Heading2']:
 styles[name].fontName='SegoeBold';styles[name].textColor=colors.black;styles[name].keepWithNext=True
styles['Title'].fontSize=25;styles['Title'].leading=32;styles['Title'].alignment=0
styles['Heading1'].fontSize=15;styles['Heading1'].leading=21
styles['Heading2'].fontSize=11.5;styles['Heading2'].leading=16
width=A4[0]-96
def p(t,style='Body'):return Paragraph(escape(t),styles[style])
story=[Spacer(1,70),p('Mi vida bajo el PSP','Title'),p('Reparix estados hasta autorización','Heading1'),Spacer(1,24),p('Eric Daniel Salas Martínez','Heading2'),p('Metodologías de Desarrollo de Software'),p('Docente del formato Beatriz Osorio Urrutia'),p('4 de noviembre de 2026'),Spacer(1,24),p('CU 05 acotado desarrollo asistido con Codex. Registro separado del último incremento técnico OpenUP; conserva los PSP anteriores de Eric y Luis. Tiempo real observado como duración transcurrida; tiempo activo humano no medido. Revisión independiente y aceptación formal pendientes.'),PageBreak()]
lines=(root/'docs/psp/PSP-Eric-Daniel-Salas-Martinez-CU05.md').read_text(encoding='utf-8').splitlines();i=1
while i<len(lines):
 line=lines[i].strip()
 if not line:i+=1;continue
 if line.startswith('|'):
  rows=[]
  while i<len(lines) and lines[i].strip().startswith('|'):
   cells=[c.strip() for c in lines[i].strip().strip('|').split('|')]
   if not all(re.fullmatch(r':?-+:?',c or '-') for c in cells):rows.append(cells)
   i+=1
  n=len(rows[0]);weights={3:[1.6,.7,3.4],5:[1,1,1,1.2,1.1],6:[.9,.6,1.6,1.6,.8,.9]}.get(n,[1]*n)
  if n==3 and rows[0][0]=='ID':weights=[.8,2.7,3.7]
  table=Table([[p(c,'HeadCell' if r==0 else 'Cell') for c in row] for r,row in enumerate(rows)],colWidths=[width*w/sum(weights) for w in weights],repeatRows=1,hAlign='LEFT')
  table.setStyle(TableStyle([('BACKGROUND',(0,0),(-1,0),colors.HexColor('#254e43')),('ROWBACKGROUNDS',(0,1),(-1,-1),[colors.white,colors.HexColor('#f2f5f3')]),('GRID',(0,0),(-1,-1),.4,colors.HexColor('#d9d9d9')),('VALIGN',(0,0),(-1,-1),'MIDDLE'),('LEFTPADDING',(0,0),(-1,-1),6),('RIGHTPADDING',(0,0),(-1,-1),6),('TOPPADDING',(0,0),(-1,-1),7),('BOTTOMPADDING',(0,0),(-1,-1),7)]))
  group=[table]
  if story and isinstance(story[-1],Paragraph) and story[-1].style.name.startswith('Heading'):group.insert(0,story.pop())
  elif len(story)>1 and isinstance(story[-1],Paragraph) and isinstance(story[-2],Paragraph) and story[-2].style.name.startswith('Heading'):group.insert(0,story.pop());group.insert(0,story.pop())
  story.extend([KeepTogether(group),Spacer(1,12)]);continue
 if line.startswith('### '):story.append(p(line[4:],'Heading2'))
 elif line.startswith('## '):story.append(p(line[3:],'Heading1'))
 else:
  part=[line];i+=1
  while i<len(lines) and lines[i].strip() and not lines[i].strip().startswith(('#','|')) and not re.match(r'^\d+\.',lines[i].strip()):part.append(lines[i].strip());i+=1
  para=p(' '.join(part));story.append(KeepTogether([para]) if re.match(r'^\d+\.',part[0]) else para);continue
 i+=1
story.extend([PageBreak(),p('Evidencia de navegador y recuperación','Heading1')])
for file,label in [('browser-result.json','Navegador CU 05'),('final/recovery-result.json','Recuperación CU 05')]:
 d=json.loads((root/'evidence/cu05'/file).read_text(encoding='utf-8'));story.append(p(label,'Heading2'));story.append(p('Inicio UTC '+d['startedAt']+'; fin UTC '+d['finishedAt']+'; resultado '+d['status']))
 for c in d['checks']:story.append(p(c))
 if 'rows' in d:story.append(p(str(len(d['rows']))+' tablas comparadas; copia sintética '+str(d['backupBytes'])+' bytes. No fija RPO ni RTO.'))
def footer(canvas,doc):
 canvas.setFont('Segoe',8);canvas.setFillColor(colors.HexColor('#52625b'));canvas.drawString(48,27,'Reparix OpenUP  |  PSP CU 05');canvas.drawRightString(A4[0]-48,27,str(doc.page))
out=root/'docs/psp/PSP-Eric-Daniel-Salas-Martinez-CU05.pdf'
SimpleDocTemplate(str(out),pagesize=A4,leftMargin=48,rightMargin=48,topMargin=44,bottomMargin=44,title='Mi vida bajo el PSP Reparix CU 05',author='Registro académico para Eric Daniel Salas Martínez').build(story,onFirstPage=footer,onLaterPages=footer)
print(out)
