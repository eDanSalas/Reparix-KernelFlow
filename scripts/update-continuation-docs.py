from pathlib import Path
from datetime import datetime, timezone, timedelta
import json
root=Path(__file__).resolve().parents[1]
local=timezone(timedelta(hours=-6))
def dt(s): return datetime.fromisoformat(s.replace('Z','+00:00'))
def stamp(s): return dt(s).astimezone(local).strftime('%d/%m/%Y %H:%M:%S.%f')[:-3]
def write(p,s): (root/p).write_text(s,encoding='utf-8')
historical=[]
for file,title,estimate in [('first-checks.json','Primeras unitarias y build',1),('recovery-result.json','Reinicio y recuperación CU-01',1),('browser-result.json','Navegador CU-01 corregido',1),('distribution-result.json','Instalación y smoke del paquete CU-01',2)]:
 d=json.loads((root/'evidence'/file).read_text(encoding='utf-8')); minutes=(dt(d['finishedAt'])-dt(d['startedAt'])).total_seconds()/60
 historical.append(dict(source=file,activity=title,startedAt=d['startedAt'],finishedAt=d['finishedAt'],elapsedMinutes=minutes,referenceEstimateMinutes=estimate))
start=historical[0]['startedAt']; end=historical[-1]['finishedAt']; interval=(dt(end)-dt(start)).total_seconds()/60
write('evidence/historical-time-summary.json',json.dumps(dict(timezone='America/Mexico_City',measure='Duración transcurrida de ejecución asistida; tiempo activo no medido',blocks=historical,enclosingInterval=dict(startedAt=start,finishedAt=end,elapsedMinutes=interval,referenceEstimateMinutes=30),warning='Los bloques están dentro del intervalo; no sumarlos nuevamente. Preparación e implementación previas sin inicio/fin acreditados.'),ensure_ascii=False,indent=2)+'\n')
activities=json.loads((root/'evidence/continuation-time.json').read_text(encoding='utf-8'))['activities']
rows='\n'.join(f"| {x['activity']} | {stamp(x['startedAt'])} | {stamp(x['finishedAt'])} | {x['elapsedMinutes']:.6f} | Finalizado |" for x in historical)
newrows='\n'.join(f"| {x['id']} {x['description']} | {stamp(x['startedAt'])} | {stamp(x['finishedAt']) if x.get('finishedAt') else 'Registro abierto'} | {x.get('elapsedMinutes',0):.3f} {'medidos' if x.get('finishedAt') else 'al cierre se calcula'} | {x['status']} |" for x in activities)
metrics='\n'.join(f"| {x['activity']} | {x['referenceEstimateMinutes']:.2f} | {x['elapsedMinutes']:.6f} | {x['elapsedMinutes']-x['referenceEstimateMinutes']:.6f} | {(x['elapsedMinutes']/x['referenceEstimateMinutes']-1)*100:.2f} % |" for x in historical)
newmetrics='\n'.join(f"| {x['id']} prospectiva | {x['estimateMinutes']:.2f} | {x['elapsedMinutes']:.3f} | {x['elapsedMinutes']-x['estimateMinutes']:.3f} | {(x['elapsedMinutes']/x['estimateMinutes']-1)*100:.2f} % |" for x in activities if x.get('finishedAt'))
done=[x for x in activities if x.get('finishedAt')]; total=sum(x['elapsedMinutes'] for x in done); estimated=sum(x['estimateMinutes'] for x in done)
plan=root/'docs/continuation-plan.md'
base=plan.read_text(encoding='utf-8').split('\n## Estado técnico al cierre')[0]
state='\n'.join(f"| {x['id']} | {x['estimateMinutes']:.2f} | {x['elapsedMinutes']:.3f} | {x['status']} |" for x in done)
plan.write_text(base+'\n## Estado técnico al cierre\n\n| Actividad | Estimado original min | Real asistido min | Status |\n|---|---:|---:|---|\n'+state+f'\n\nSubtotal medido {total:.3f} min frente a {estimated:.2f} min originales. El tiempo real es transcurrido, incluidas esperas. La reestimación de seguridad de 12 min está incluida en CLOSE; no se suma al real. Se congela la medición al concluir revisión y comprobaciones; la sincronización mecánica final del registro/PDF/huellas posterior a ese corte no está cronometrada.\n',encoding='utf-8')
write('docs/psp/PSP-Eric-Daniel-Salas-Martinez.md',f'''# Mi vida bajo el PSP aplicado a Reparix

Responsable del PSP: Eric Daniel Salas Martínez. Asignatura: Metodologías de Desarrollo de Software. Docente del formato: Beatriz Osorio Urrutia. Apertura y revisión documental: 4/11/2026, America/Mexico_City. Modalidad: desarrollo asistido con Codex. Por indicación del usuario, el tiempo real de este registro es la duración observada de ejecución asistida; incluye esperas. Tiempo activo humano no medido. No se imputa a cinco integrantes ni se acredita asistencia, firma o aceptación externa.

## 1 Propósito de la actividad

Aplicar planificación, bitácora cronológica, dificultades, evidencia y métricas al desarrollo incremental de Reparix. Se conserva la estructura del PDF académico original de ocho páginas; sus tiempos y fechas de otro proyecto no se reutilizan. Es una introducción académica a PSP, sin atribuir certificación formal.

## 2 Actividad y objetivo medible

Conservar CU-01 Registrar orden y desarrollar el siguiente incremento CU-02 Asignar técnico después de verificar la base. CU-01 exige folio único, recepción válida, permisos, transacción e historial, reintentos sin duplicado y comprobante. CU-02 exige una sola asignación vigente, técnico activo, historial de reasignación, versión y conflicto explícito, con pruebas positivas, negativas y concurrentes. CU-03 y CU-05 siguen fuera de esta implementación. Resultado vigente y aceptación formal se consultan en docs/verification.md.

## 3 Instrucciones paso a paso

### Paso 1 Define la actividad y el objetivo

El resultado se contrasta con criterios y pruebas de CU-01 y CU-02, build Angular 22.1.7, PostgreSQL real y distribución verificable. Cerrar una actividad técnica con status Finalizado no cierra la iteración E4 ni acredita aceptación del equipo o del taller.

### Paso 2 Planea antes de comenzar

Para el trabajo histórico no se registró una estimación previa. La siguiente es una estimación de referencia elaborada por Codex el 4/11/2026 durante esta revisión; no es un plan anterior a la ejecución. Cada fase tiene estimación aunque algunas carecen de tiempo real recuperable.

| Fase | Referencia min | Alcance |
|---|---:|---|
| Preparación y organización | 30 | Fuentes, entorno y estructura inicial |
| Actividad principal | 30 | Criterios, planificación y decisiones |
| Implementación | 120 | Código CU-01 y correcciones |
| Revisión o autoevaluación | 30 | Intervalo observable de primeras pruebas a smoke del paquete |
| Cierre y reflexión | 20 | Registros, métricas y entrega documental inicial |
| Total de referencia | 230 | No comparable con un total real de desarrollo inexistente |

La referencia de revisión de 30 min se compara únicamente con el intervalo delimitado por marcas reales. Los bloques internos tienen referencias separadas de 1, 1, 1 y 2 min, sin añadirse al total de fases. El antiguo plan de revisión humana de 310 min se conserva en work/before-continuation-20261104 como versión sustituida, sin presentarlo como tiempo consumido ni capacidad aceptada.

La continuación tiene estimación prospectiva original de 110 min: preparación documental 25, regresión base 5, paquete CU-01 5, diseño CU-02 10, implementación 30, pruebas 20 y cierre 15. Se registró antes de ejecutar estas actividades en docs/continuation-plan.md; inicios, finales y estimaciones inmutables en evidence/continuation-time.json. Durante el cierre se estimó una subactividad de seguridad de 12 min antes de modificar dependencias, pronóstico revisado 122 min; su tiempo real está incluido en CLOSE, sin sumarlo dos veces. La estimación original se conserva para las métricas. Las actividades aún abiertas no tienen duración final. No se estima a partir de fechas de modificación.

### Paso 3 Registra el tiempo real

Bitácora histórica cronológica. Todas las fechas siguientes son 4/11/2026 locales; se conserva UTC en los JSON originales. No se conocen interrupciones ni tiempo activo; las cifras son duración transcurrida.

| Actividad | Inicio local | Fin local | Real min | Status |
|---|---|---|---:|---|
{rows}

Intervalo contenedor: {stamp(start)} a {stamp(end)}, {interval:.6f} min (20 min 52.248 s). Cubre desde primeras unitarias/build hasta instalación y smoke de distribución, con intervalos intermedios no desglosados. Los cuatro bloques suman {sum(x['elapsedMinutes'] for x in historical):.6f} min y están incluidos en ese intervalo: no sumarlos otra vez. No acredita el comienzo de preparación o implementación anteriores, ni el tiempo total de CU-01. Esos tiempos reales no son recuperables con las evidencias disponibles; no se inventan ceros, interrupciones ni horas-persona.

Bitácora de esta continuación, medida desde el inicio de cada actividad estimada. Puede incluir espera y revisión del agente.

| Actividad | Inicio local | Fin local | Real min | Status |
|---|---|---|---:|---|
{newrows}

### Paso 4 Registra las dificultades

| ID | Dificultad de proceso | Acción y situación |
|---|---|---|
| D-01 | Acceso de escritura insuficiente en la sesión anterior | Corrección documental aplazada entonces; escritura comprobada y copia previa guardada en esta continuación |
| D-02 | Consola cp1252 rechazó caracteres de la fuente | Extracción UTF-8; en esta revisión se repitió la lectura con stdout UTF-8 |
| D-03 | Comando de scaffolding demasiado largo en Windows | Creación inicial dividida en lotes; lote rechazado no se atribuye como ejecutado |
| D-04 | Motor Docker detenido en preparación histórica | Inicio y evidencia histórica; en esta continuación API denegada dentro del sandbox, consulta autorizada y contenedor activo confirmado |
| D-05 | Dos descargas PostgreSQL 18.3 truncadas por EOF | Imagen 18.4 local fijada por digest conservada |
| D-06 | El runtime documental no incluye PyMuPDF | Lectura con pypdf y render con pypdfium2 ya disponibles, sin reinstalar dependencias del proyecto |
| D-07 | Invocación de Angular CLI fuera de su workspace | Repetición con npm run build desde la raíz y script del workspace, salida 0 |
| D-08 | Primer fixture de migración reutilizó un parámetro con tipos varchar y text | Corregir solo preparación sintética; M03 pasa después, ambos logs conservados |

Los defectos de software DEF-001 (INSERT de equipo), DEF-002 (CSS/CSP) y DEF-003 (dependencias con avisos altos/críticos) se registran por separado en docs/defects.md. Sus correcciones técnicas tienen status Finalizado, con revisión independiente pendiente. DEF-003 se corrigió con cuatro overrides transitivos dentro de las mismas versiones mayores; Angular/CLI siguen 22.1.7 y la auditoría completa final reporta cero hallazgos conocidos, sin afirmar ausencia total de vulnerabilidades. No se inventan opiniones ni dificultades personales de Eric.

### Paso 5 Comprueba el resultado y reúne evidencia

CU-01 histórico: 35 comprobaciones distintas, 7 unitarias + 17 integración HTTP/PostgreSQL + 8 navegador + 3 recuperación. Node agrega un padre a integración: 18 tests no significan 18 escenarios. Hay build y smoke de instalación distribuida, capturas sintéticas y prueba de restauración de nueve tablas. Esta continuación tras CU-02: 10 unitarias, 40 escenarios de integración (17 I + 22 A + M03), 15 de navegador (8 B + 7 C) y 4 de recuperación, 69 comprobaciones distintas; migración local y smoke adicionales. CU-01/CU-02: status Finalizado técnico. Las nuevas ejecuciones se conservan aparte en evidence/continuation y evidence/cu02; consultar docs/verification.md. Los originales no se reemplazan. Fuentes íntegras en docs/sources, código en client/server/db, casos en docs/test-cases.md y paquete Node en artifacts/reparix-cu02. No es un .exe autónomo.

### Paso 6 Calcula e interpreta las métricas

Fórmulas: diferencia = real - estimado; desviación = (real - estimado) / estimado × 100. Un valor negativo indica menor duración que la referencia; no demuestra mayor productividad humana. Referencias históricas comparables por ventana:

| Ventana | Est min | Real min | Diferencia min | Desviación |
|---|---:|---:|---:|---:|
| Revisión observable completa | 30.00 | {interval:.6f} | {interval-30:.6f} | {(interval/30-1)*100:.2f} % |
{metrics}

Actividades nuevas con cierre medido:

| Actividad | Est min | Real min | Diferencia min | Desviación |
|---|---:|---:|---:|---:|
{newmetrics if newmetrics else '| DOC abierta | 25.00 | Medición en curso | Se calcula al cerrar | Se calcula al cerrar |'}

Subtotal de actividades nuevas finalizadas: estimado {estimated:.2f} min, real {total:.3f} min. No se agrega al intervalo histórico para fingir tiempo total del desarrollo completo. Preparación e implementación histórica carecen de intervalos completos y por tanto no tienen desviación calculable, aunque su referencia sí esté estimada. La duración asistida no calibra automáticamente la productividad UCP ni consume la capacidad de cinco personas.

Tamaño verificable: CU-01 contiene un alta de orden, consulta exacta y comprobante; el alcance CU-02 se registra en su contrato. No se usa LOC generado como productividad humana. Defectos observados y correcciones están trazados; no se declara ausencia total de defectos.

### Paso 7 Propón un plan personal de mejora

1. Fijar estimaciones antes del próximo incremento y registrar cada inicio/fin automáticamente; comprobar que ninguna actividad cerrada pierda evidencia ni mezcle tiempo transcurrido con activo.
2. Verificar escritura, PostgreSQL y herramientas de PDF al preparar la sesión; registrar bloqueos del ambiente por separado para reducir retrabajo documental.
3. Definir ejemplos negativos y concurrentes antes de ampliar el flujo; comparar defectos detectados y restante reestimado al cerrar CU-02, conservando controles de seguridad.

## 4 Preguntas para las conclusiones

1. La ventana histórica completa de revisión es la mayor duración recuperada ({interval:.6f} min). No puede determinarse qué fase de todo el desarrollo consumió más sin marcas de las fases anteriores; sus intervalos no se reconstruyen.
2. Esa ventana quedó {30-interval:.6f} min por debajo de la referencia de 30 min, {(interval/30-1)*100:.2f} %. La referencia fue elaborada después; no demuestra precisión de una estimación histórica previa.
3. La comprobación inicial de permisos, codificación y disponibilidad del motor permite anticipar las dificultades documentadas. No sustituye la corrección de defectos SQL o de estilos.
4. CU-01 alcanzó sus criterios técnicos en los 35 escenarios históricos. Esta continuación conservó la regresión y verificó CU-02, incluidos concurrencia, rollback, acceso técnico y restauración. La aceptación externa sigue pendiente.
5. Un resultado final aislado ocultaría intentos fallidos, correcciones, alcance de los tiempos y limitación de borrador. Los logs y marcas permiten auditar esos límites.
6. El ciclo objetivo, diseño, implementación, integración, pruebas y cierre conecta PSP con incrementos OpenUP. TSP mantiene capacidad y responsabilidades sin convertir calendarios en asistencia.
7. Una dificultad del proceso afecta organización o herramientas; un defecto de software incumple un comportamiento comprobable. DEF-001 y DEF-002 pertenecen al segundo registro.
8. La mejora se comprobará con estimaciones prospectivas, registros por actividad y pruebas de concurrencia/permisos, sin borrar la línea base. Son conclusiones técnicas sustentadas del desarrollo asistido, no opiniones personales ni firmas de Eric.

## 5 Entregables

Descripción, objetivo, estimaciones de referencia y prospectivas, bitácora observada, dificultades, evidencias, métricas, conclusiones y tres mejoras en este Markdown y PDF. CU-01 y sus entregables técnicos históricos: status Finalizado. Cada actividad nueva terminada usa exactamente Finalizado en su registro; las abiertas mantienen su estado real. CU-03/CU-05 no se marcan terminados. E4 y revisión independiente permanecen pendientes de decisión humana.

## 6 Rúbrica del formato PSP

Objetivo 10, planeación 15, tiempo real 20, dificultades 15, métricas 15, evidencia 10, mejora 10 y presentación 5: total 100. Son criterios, sin calificación autoasignada ni afirmación de estimación previa para trabajo histórico.

## 7 Criterios importantes

Conservar versiones, fechas originales y estimaciones; no inventar tiempos ni usar mtime como tiempo activo. Modalidad asistida explícita. No copiar fechas, tiempos o conclusiones del ejemplo de otro proyecto. No atribuir al equipo trabajo del agente.

## 8 Cierre y conexión con la ingeniería de software

El registro documental corrige la falta de estimaciones mediante referencias identificadas y mide la continuación con planificación previa. Las evidencias permiten reproducir CU-01 y revisar CU-02 según el estado técnico vigente. Borrador y clave siguen en memoria de pestaña: una recarga forzada los pierde; no se declara operación productiva. Proyecto y aceptación formal no están finalizados.

Referencia del formato: Humphrey, W. S. (2000), The personal software process, CMU/SEI-2000-TR-022, citada en la fuente académica conservada.
''')
print('PSP and historical timing summary updated from preserved evidence')
