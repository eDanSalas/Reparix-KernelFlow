from pathlib import Path
from datetime import datetime,timezone,timedelta
import json,re
root=Path(__file__).resolve().parents[1]
def write(p,t): (root/p).write_text(t,encoding='utf-8')
def append_section(file,heading,body):
 p=root/file;s=p.read_text(encoding='utf-8').split('\n'+heading)[0];p.write_text(s+'\n'+heading+'\n\n'+body.strip()+'\n',encoding='utf-8')
def edit_once(file,old,new):
 p=root/file;s=p.read_text(encoding='utf-8')
 if old in s:p.write_text(s.replace(old,new),encoding='utf-8')
time=json.loads((root/'evidence/cu03/time.json').read_text(encoding='utf-8'));activities=time['activities'];local=timezone(timedelta(hours=-6))
def stamp(s):return datetime.fromisoformat(s.replace('Z','+00:00')).astimezone(local).strftime('%d/%m/%Y %H:%M:%S')
rows='\n'.join(f"| {a['id']} | {a['estimateMinutes']:.0f} | {stamp(a['startedAt'])} | {stamp(a['finishedAt']) if a.get('finishedAt') else 'Abierto'} | {a['elapsedMinutes']:.3f} | {a['status']} |" if a.get('finishedAt') else f"| {a['id']} | {a['estimateMinutes']:.0f} | {stamp(a['startedAt'])} | Abierto | Medición en curso | En curso |" for a in activities)
metrics='\n'.join(f"| {a['id']} | {a['estimateMinutes']:.2f} | {a['elapsedMinutes']:.3f} | {a['elapsedMinutes']-a['estimateMinutes']:.3f} | {(a['elapsedMinutes']/a['estimateMinutes']-1)*100:.2f} % |" for a in activities if a.get('finishedAt'))
done=[a for a in activities if a.get('finishedAt')];real=sum(a['elapsedMinutes'] for a in done);est=sum(a['estimateMinutes'] for a in done)
status='Finalizado' if len(done)==5 else 'En curso'
write('docs/psp/PSP-Luis-Alberto-Hernandez-Velasco-CU03.md',f'''# Mi vida bajo el PSP aplicado a Reparix CU 03

Responsable académico: Luis Alberto Hernández Velasco, por instrucción explícita del usuario. Asignatura: Metodologías de Desarrollo de Software. Docente del formato: Beatriz Osorio Urrutia. Apertura y revisión: 4/11/2026, America/Mexico_City. Modalidad: desarrollo asistido con Codex. Tiempo real: duración transcurrida observada, incluidas esperas; tiempo activo humano no medido. Este documento no atribuye ejecución manual, reunión, firma ni aceptación externa a Luis. El PSP de Eric Daniel Salas Martínez conserva CU-01 y CU-02 sin modificación.

## 1 Propósito de la actividad

Aplicar planificación, registro de tiempo real, análisis de dificultades y métricas al incremento CU-03. Se mantiene la estructura de la actividad académica PSP conservada en docs/sources; no se copian fechas, tiempos ni conclusiones de su ejemplo de otro proyecto.

## 2 Actividad y objetivo medible

Implementar Registrar diagnóstico y presupuesto después de CU-01/CU-02: técnico activo asignado, revisiones inmutables, trabajo/importe/moneda validados, autor y fecha, historial atómico, control de versión y conflicto concurrente. Verificar con PostgreSQL real, navegador y build, conservando recepción/asignaciones. Reasignar conserva antecedentes e invalida la vigencia de la revisión anterior para la nueva asignación. El estado sigue Recibido; no hay decisión del cliente ni reparación.

## 3 Instrucciones paso a paso

### Paso 1 Define la actividad y el objetivo

Resultado técnico CU-03: Finalizado. Pruebas: 13 unitarias, 58 escenarios de integración, 24 comprobaciones de navegador y 5 de recuperación; total 100 distintas del build actual. Se incluyen regresiones, no 100 funciones nuevas. Integración cuenta 61 tests de Node porque agrega tres padres: no duplicarlos. Casos y resultados en docs/cu03.md, docs/test-cases.md y docs/verification.md. La aceptación humana sigue separada.

### Paso 2 Planea antes de comenzar

| Fase | Estimado min | Alcance |
|---|---:|---|
| Preparación y organización | 10 | Inspección, fuentes, copia y contrato |
| Actividad principal | 10 | Diseño, modelo y primera implementación del backend |
| Implementación | 35 | Integración MVC y vista técnica de registro/revisión |
| Revisión o autoevaluación | 25 | Validación, permisos, concurrencia, regresión, UI y recuperación |
| Cierre y reflexión | 15 | PSP/TSP, PDF, distribución y huellas |
| Total | 95 | Estimación Codex, sin equivalencia a horas-persona de cinco integrantes |

El plan está en docs/cu03.md. Preparación usa estimación de referencia elaborada por Codex, porque la inspección comenzó antes del cronómetro. Las demás son prospectivas. La fase de diseño incluyó el primer modelo y controlador; la implementación siguiente integró UI y ajustes. Las estimaciones originales no se modifican para coincidir con lo observado. La inspección previa no cronometrada no se inventa ni se suma como cero. Se conservan 544 h-persona totales, 340 de construcción y 810.92 h UCP; estos minutos asistidos no descuentan automáticamente capacidad humana.

### Paso 3 Registra el tiempo real

Registro por actividad del agente. UTC en evidence/cu03/time.json; presentación local en America/Mexico_City. No se midieron interrupciones ni tiempo activo humano. El tiempo real contiene lectura, edición, comandos y espera dentro del intervalo registrado.

| ID | Est min | Inicio local | Fin local | Real min | Status |
|---|---:|---|---|---:|---|
{rows}

Subtotal de actividades finalizadas: {real:.3f} min observados. Status del registro al corte: {status}. Los comandos también conservan comienzo, fin y código de salida en sus JSON; sus duraciones están dentro de las fases y no se vuelven a sumar. La sincronización final del registro/PDF/huellas después del corte de medición se identifica como posterior, sin fabricar tiempo activo.

### Paso 4 Registra las dificultades

| ID | Dificultad del proceso | Acción y resultado |
|---|---|---|
| P03-01 | El primer cronómetro apuntó a una subcarpeta aún inexistente | Falló con ENOENT, sin guardar tiempos; se corrigió creación de carpeta y se inició medición real después. No se atribuye éxito al intento fallido |
| P03-02 | CU-05 todavía no ofrece el estado En diagnóstico | Se permite registrar CU-03 con orden Recibido como preparación incremental explícita, sin simular transición ni progreso físico |
| P03-03 | PD-03 aún no define moneda/desglose aprobados por taller | Total exacto positivo en MXN como regla provisional documentada; decisión del cliente y reparación siguen bloqueadas |
| P03-04 | El backend original devuelve DTO técnico mínimo y las capturas viven en memoria | CU-03 usa endpoint propio sin contacto cliente; cambio de folio limpia la captura anterior y resultado incierto exige consulta |

No se observaron nuevos defectos del producto en las ejecuciones de CU-03. Se corrigieron preventivamente por revisión la limpieza de captura al cambiar folio y la eliminación de una vista de presupuesto desactualizada al reasignar; no se inventa un fallo ejecutado previo. DEF-001/002/003 conservan su historial aparte. Las dificultades de proceso no se clasifican como defectos del software sin evidencia.

### Paso 5 Comprueba el resultado y reúne evidencia

Código en server/client/db con migración 003; contrato y decisiones en docs/cu03.md. evidence/cu03/unit.log: 13 unitarias. final-integration.log: 58 escenarios (17 I, 22 A, 17 D, M03 y M04), 61 tests con padres. browser-result.json: 9 E; regression/browser-result.json: 15 B/C, ambos sin pageErrors. build.log: Angular 22.1.7, 211.12 kB iniciales. recovery-result.json: 5 R y once tablas exactas, incluidas dos revisiones previas. M04 verifica una base CU-02 poblada antes de 003; migration-result.json verifica la base local vacía y secuencia conservada. No se crearon cuentas humanas ni órdenes de prueba en la base principal.

La distribución CU-03 contiene Node/Angular compilado y configuración de ejemplo, sin .env, bases ni node_modules en el ZIP. Pruebas de instalación de producción y smoke documentadas en verificación. PDF renderizado e inspeccionado en todas sus páginas antes de entrega. Evidencias históricas y fuentes se conservan. Ninguna captura acredita diagnóstico físico de equipos reales.

### Paso 6 Calcula e interpreta las métricas

Diferencia = real - estimado. Desviación = (real - estimado) / estimado × 100. Solo se comparan intervalos cerrados; positivo indica mayor duración y negativo menor. Preparación está comparada con referencia retrospectiva identificada, no con una estimación histórica previa.

| ID | Est min | Real min | Diferencia min | Desviación |
|---|---:|---:|---:|---:|
{metrics}

Subtotal comparable: estimado {est:.2f} min, real {real:.3f} min, diferencia {real-est:.3f} min y desviación {(real/est-1)*100 if est else 0:.2f} %. Este resultado no demuestra productividad humana ni viabilidad UCP. Tamaño funcional: un CU, registro y consulta de revisiones emparejadas de diagnóstico/presupuesto; CU-05 sigue pendiente.

### Paso 7 Propón un plan personal de mejora

1. Abrir carpeta de evidencia y cronómetro antes de inspeccionar el siguiente incremento; comprobar el registro en disco para evitar otra preparación parcialmente no medida.
2. Mantener ejemplos negativos de versión, dinero, reasignación y respuesta perdida antes de ampliar estados; comprobar que cada rechazo no produzca escrituras.
3. Resolver PD-03 con evidencia y reestimar esfuerzo restante antes de CU-05; comparar el pronóstico con capacidad humana confirmada, sin reducir controles ni convertir minutos asistidos en horas del equipo.

## 4 Preguntas para las conclusiones

1. La fase con más duración entre las cerradas es {max(done,key=lambda a:a['elapsedMinutes'])['id'] if done else 'aún no determinada'}; el registro permite comparar intervalos asistidos, sin deducir tiempo activo humano.
2. La variación del subtotal comparable es {real-est:.3f} min ({(real/est-1)*100 if est else 0:.2f} %). Las estimaciones se conservaron y la preparación tiene referencia retrospectiva explícita.
3. Crear primero el destino del registro habría prevenido ENOENT; definir el límite CU-03/CU-05 evitó implementar estados o autorización anticipadamente.
4. El objetivo técnico se alcanzó mediante versiones preservadas, dinero exacto, permisos, pruebas concurrentes y restauración. La revisión independiente sigue pendiente.
5. Sin bitácora faltarían los intentos fallidos de medición, alcance de cada prueba y diferencia entre tiempo asistido y capacidad humana.
6. La experiencia sigue objetivo, criterios/riesgos, diseño, integración, pruebas y cierre OpenUP; PSP registra el proceso individual académico y TSP conserva responsabilidades/capacidad.
7. Una dificultad afecta organización/herramientas; un defecto incumple un comportamiento comprobable. No se inventaron defectos personales de Luis ni aceptación externa.
8. La mejora se comprobará con cronómetro abierto antes del siguiente trabajo, PD-03 documentada y pruebas de transición que bloqueen reparación sin CU-04. Son conclusiones técnicas del desarrollo asistido, no opiniones ni firmas atribuidas a Luis.

## 5 Entregables

PSP Markdown/PDF a nombre de Luis Alberto Hernández Velasco, contrato CU-03, código MVC, migración incremental, pruebas y evidencia, build ejecutable y paquete con huellas. CU-03: Finalizado técnico; cada actividad terminada usa exactamente Finalizado. El PSP de Eric permanece independiente para CU-01/CU-02. Proyecto, E4, revisión humana y aceptación del taller no se marcan finalizados.

## 6 Rúbrica del formato PSP

Objetivo 10, planeación 15, tiempo real 20, dificultades 15, métricas 15, evidencia 10, mejora 10 y presentación 5: 100 puntos. Son criterios del formato, sin calificación autoasignada ni afirmación de participación manual.

## 7 Criterios importantes

No premiar rapidez ni ocultar límites. Conservar fuentes y estimaciones originales, distinguir referencia de estimación previa y medir la duración asistida solicitada sin pedir reconstrucción manual. No usar fecha de modificación como tiempo activo. No inventar reuniones, firmas, aprobación ni pruebas físicas.

## 8 Cierre y conexión con la ingeniería de software

CU-03 incorpora revisiones trazables sin sobrescribir presupuestos ni heredar autorización. Las pruebas demuestran los escenarios ejecutados, no ausencia de defectos. Persistencia de borrador al cerrar/recargar, PD-03, validación con taller y operación productiva siguen pendientes. El siguiente incremento es CU-05 acotado: Recibido a En diagnóstico con técnico vigente y después Pendiente de autorización con diagnóstico/presupuesto vigente; aún no está implementado y no habilitará reparación sin CU-04.

Referencia del formato: Humphrey, W. S. (2000), The personal software process, CMU/SEI-2000-TR-022, indicada en la fuente académica conservada.
''')
edit_once('README.md','Incrementos académicos CU-01 Registrar orden y CU-02 Asignar técnico','Incrementos académicos CU-01 Registrar orden, CU-02 Asignar técnico y CU-03 Registrar diagnóstico y presupuesto')
edit_once('README.md','este repositorio implementa CU-01 y CU-02. CU-03 y CU-05 todavía no están construidos.','este repositorio implementa CU-01, CU-02 y CU-03. CU-05 todavía no está construido.')
edit_once('README.md','[contrato CU-02](docs/cu02.md).','[contrato CU-02](docs/cu02.md) y [contrato CU-03](docs/cu03.md).')
edit_once('README.md','Diagnóstico y transición de estado siguen bloqueados.','El técnico asignado registra diagnóstico y presupuesto en nuevas revisiones; recepción/administración las consultan. Total positivo con dos decimales en MXN, regla provisional PD-03. La transición de estado sigue bloqueada.')
edit_once('README.md',"$env:EVIDENCE_DIR='evidence/cu02'","$env:EVIDENCE_DIR='evidence/cu03'\nnode --env-file=.env scripts/cu03-browser-check.mjs")
edit_once('README.md','artifacts/reparix-cu02 y artifacts/reparix-cu02.zip contienen','artifacts/reparix-cu03 y artifacts/reparix-cu03.zip contienen')
edit_once('README.md','compara un respaldo restaurado de diez tablas, incluidas asignaciones y versiones CU-02.','compara once tablas, incluidas asignaciones y revisiones CU-03.')
edit_once('README.md','CU-01 y CU-02 tienen evidencia técnica;','CU-01, CU-02 y CU-03 tienen evidencia técnica;')
edit_once('README.md','Paquete nuevo CU-02','Paquete histórico CU-02')
edit_once('docs/implementation-plan.md','Versión 0.2 de planificación','Versión 0.3 de planificación')
edit_once('docs/implementation-plan.md','CU-01 y CU-02 tienen status Finalizado','CU-01, CU-02 y CU-03 tienen status Finalizado')
edit_once('docs/implementation-plan.md','CU-03 y CU-05 conservan criterios, sin rutas ni pantallas funcionales.','CU-03 incorpora registro y consulta de revisiones de diagnóstico/presupuesto. CU-05 conserva criterios, sin rutas ni pantallas funcionales.')
edit_once('docs/implementation-plan.md','CU-03 y CU-05 permanecen condicionados.','CU-03 tiene cierre técnico asistido; CU-05 y la aceptación formal permanecen condicionados.')
edit_once('docs/implementation-plan.md','CU-03 y CU-05 están planificados.','CU-03 implementado; CU-05 planificado.')
edit_once('docs/implementation-plan.md','client/dist/client/browser; artifacts/reparix-cu02','client/dist/client/browser; artifacts/reparix-cu03')
edit_once('docs/implementation-plan.md','Restante: revisión humana de ambos CU, diseño/reestimación de CU-03 y después CU-05 acotado, condicionados por capacidad.','Al cierre de CU-02 se propuso revisar ambos CU y diseñar CU-03; la continuación CU-03 se registra abajo. Restante actual: revisión humana de tres CU y diseño/reestimación de CU-05 acotado, condicionado por capacidad.')
append_section('README.md','## PSP por incremento','CU-01/CU-02 permanecen en docs/psp/PSP-Eric-Daniel-Salas-Martinez.md y su PDF. CU-03 tiene registro separado en [PSP Luis Alberto Hernández Velasco](docs/psp/PSP-Luis-Alberto-Hernandez-Velasco-CU03.md), con PDF en esa carpeta. Se conserva artifacts/reparix-cu02 como distribución histórica y se entrega artifacts/reparix-cu03. Registro académico asistido: duración transcurrida, tiempo activo humano no medido. CU-05 y aceptación externa pendientes.')
edit_once('docs/architecture.md','schema_migrations y order_assignments.','schema_migrations, order_assignments y order_assessments.')
edit_once('docs/architecture.md','No se implementó CU-03/CU-05.','CU-03 se incorpora en la sección siguiente; CU-05 sigue pendiente.')
append_section('docs/architecture.md','## Modelo transaccional CU-03','order_assessments conserva snapshots emparejados de diagnóstico/presupuesto, revisión única por orden, asignación, autor/fecha, trabajo, importe numeric(12,2), moneda MXN y motivo. FK compuesta obliga a que orden/asignación/autor coincidan. Runtime SELECT/INSERT, sin UPDATE/DELETE. El modelo bloquea orden y cuenta técnico activa, valida pertenencia/versión y confirma revisión, versión e historial juntos; falla revierte todo. GET usa snapshot consistente y DTO sin contacto cliente; recepción/admin consultan, solo técnico asignado registra. Reasignar conserva las revisiones anteriores e invalida su vigencia para la nueva asignación. No hay aceptación heredada, decisión cliente ni transición. Rutas GET/POST /api/orders/:folio/assessments; contrato completo en docs/cu03.md. La moneda y total único son reglas provisionales PD-03. El importe se recibe como texto decimal exacto, sin cálculo monetario en coma flotante.')
append_section('docs/tsp/team-record.md','## Continuación CU-03 AT-003','4/11/2026 local. Instrucción explícita del usuario: continuar CU-03 a nombre de Luis Alberto Hernández Velasco, quien conserva además la responsabilidad de planeación identificada antes como Luis. No se reatribuye a Luis el trabajo CU-01/CU-02 de Eric. Modalidad asistida con Codex, sin firma, reunión ni horas humanas simuladas. PSP independiente y tiempos en evidence/cu03/time.json; plan original 95 min, preparación con referencia identificada y demás fases prospectivas. CU-03 Finalizado técnico: revisiones inmutables, importe exacto, permisos, versión, historial y recuperación verificados. Capacidad original 544 h-persona y UCP 810.92 h sin descontar minutos asistidos. Trabajo adelantado en E4 no acredita ejecución futura de C3 ni se vuelve a cargar. Siguiente CU-05 acotado, aún no construido; revisión independiente y aceptación pendientes. DEC-010: total MXN provisional PD-03; DEC-011: revisión emparejada y vigencia por asignación; DEC-012: escritura solo por técnico vigente, recepción/admin de lectura. Son decisiones de implementación del agente, sujetas a revisión real.')
edit_once('docs/tsp/iteration-close.md','CU-01 y CU-02: status Finalizado técnico','CU-01, CU-02 y CU-03: status Finalizado técnico')
edit_once('docs/tsp/iteration-close.md','Revisión independiente CU-01/CU-02; reestimar y diseñar CU-03 sin implementar todavía','Revisión independiente CU-01/CU-02/CU-03; reestimar CU-05 acotado, aún sin construir')
append_section('docs/tsp/risks.md','## Riesgos revisados para CU-03','ORM-20: se mantiene estado Recibido y bloqueo de reparación/decisión, D15. ORM-21: presupuestos de asignación anterior se conservan como antecedentes, sin vigencia para la nueva; D10/E09. ORM-23: técnico ajeno no accede, D09; recepción/admin solo leen, D02. ORM-26: once tablas comparadas en restauración y revisión posterior verificada R05. ORM-30: duración asistida no acredita viabilidad UCP ni capacidad humana disponible. PD-03 moneda/desglose y validación con taller permanecen pendientes; MXN/total único no representan aceptación externa.')
append_section('docs/implementation-plan.md','## Incremento CU-03 a nombre de Luis','Por instrucción del usuario, CU-03 se continúa a nombre de Luis Alberto Hernández Velasco con PSP propio. CU-01/CU-02 de Eric conservados. CU-03: Finalizado técnico, ver docs/cu03.md y evidence/cu03; CU-05 sigue condicionado y sin implementar. Estimación de duración asistida 95 min, tiempo observado por fase en PSP; no horas-persona de los cinco integrantes. Calendario R0–T1, 544 h-persona totales, 340 construcción y UCP 810.92 h se conservan. Anticipación técnica en E4 no acredita jornadas futuras de C3 ni doble imputación. Restante: revisión independiente de los tres CU, PD-03 y diseño/reestimación CU-05 acotado, con controles y capacidad humana confirmada.')
edit_once('docs/cu03.md','Estado inicial: Planificado.','Estado técnico: Finalizado. Revisión independiente y aceptación pendientes.')
append_section('docs/cu03.md','## Resultado técnico y tiempo observado',f'13 unitarias, 58 escenarios HTTP/PostgreSQL (61 tests con tres padres), 24 navegador (15 regresión + 9 CU-03), 5 recuperación: 100 comprobaciones distintas del build actual. No son funciones nuevas ni aceptación externa. Migración desde 001/002 pobladas conservó datos y folios. Estado de actividades al corte: {status}; subtotal medido {real:.3f} min. Detalle en PSP de Luis y evidence/cu03/time.json. Fuentes, PSP Eric y paquetes anteriores conservados.')
labels=[]
for m in re.finditer(r"t\.test\('(D\d+) ([^']+)'",(root/'server/test/assessment.integration.test.js').read_text(encoding='utf-8')):labels.append('| '+m.group(1)+' | '+m.group(2)+' | Finalizado |')
browser=json.loads((root/'evidence/cu03/browser-result.json').read_text(encoding='utf-8'))
for c in browser['checks']:labels.append('| '+c.split(' ',1)[0]+' | '+c.split(' ',1)[1]+' | Finalizado |')
append_section('docs/test-cases.md','## Casos CU-03 verificados','Precondiciones: dependencias fijadas, PostgreSQL migrado y datos sintéticos. RF-04/05/09/16 y controles de integridad. U11 valida dinero exacto; U12 rechaza ambigüedad/aceptación extra; U13 valida textos/versión. M04 conserva base CU-02 poblada al aplicar 003. R05 restaura revisiones y crea otra conservando antecedentes.\n\n| ID | Condición y resultado esperado comprobado | Status |\n|---|---|---|\n'+'\n'.join(labels)+'\n\nEl contrato contiene códigos esperados y reglas. Resultados originales de CU-01/CU-02 permanecen; el build actual agrega CU-03 sin habilitar CU-05. D08 inyecta P0001 deliberadamente y comprueba rollback; no se cuenta como defecto abierto.')
append_section('docs/verification.md','## Continuación CU-03 para Luis Alberto Hernández Velasco','Fecha real 4/11/2026 local; UTC 5/11 convertido a America/Mexico_City. PSP anterior de Eric contiene CU-01/CU-02 y se conserva sin edición. CU-03 Finalizado técnico con registro separado de Luis, modalidad asistida; revisión formal pendiente.\n\n| Comando o prueba | Resultado real | Evidencia |\n|---|---|---|\n| npm test | 13/13, salida 0 | evidence/cu03/unit.log |\n| npm run test:integration | 58 escenarios: I17+A22+D17+M03+M04; 61 tests con 3 padres, salida 0 | evidence/cu03/final-integration.log |\n| npm run build | Angular 22.1.7, 211.12 kB iniciales, 56.37 kB estimados de transferencia | evidence/cu03/build.log |\n| cu03-browser-check | 9 E, sin pageErrors, Edge 156.0.4314.58 | evidence/cu03/browser-result.json |\n| browser-check regresión | 15 B/C, sin pageErrors | evidence/cu03/regression/browser-result.json |\n| Migración 003 y repetición local | Conserva 9 tablas previas y secuencia; base principal vacía | evidence/cu03/migration-result.json |\n| Migraciones pobladas | M03 conserva 001 poblada; M04 conserva 002 con asignación y permite CU-03 | evidence/cu03/migration-populated.log |\n| recovery-check | 5 R pasan; once tablas exactas; copia sintética 31912 bytes y ensayo 593 ms | evidence/cu03/recovery-result.json |\n\n100 comprobaciones distintas del build actual: 13 U + 58 integración + 24 navegador + 5 recuperación. No sumar padres o repeticiones. No fija RPO/RTO. Capturas sintéticas escritorio/móvil/recepción inspeccionadas. Diagnóstico/presupuesto permanecen versionados, sin autorización ni transición; reparación, entrega y cancelación bloqueadas. PD-03 y revisión independiente pendientes. Dinero decimal exacto como texto en API y numeric en PostgreSQL. No se cambiaron dependencias ni Angular en esta continuación, solo versión identificadora 0.3.0-cu03 y scripts. Preparación parcialmente no cronometrada y fallo ENOENT del primer registro informados en PSP; no se atribuye una escritura que falló. Borradores siguen en memoria y no se declara operación productiva.')
print('PSP Luis and CU-03 documentation synchronized; Eric documents preserved')
