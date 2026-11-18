from pathlib import Path
from datetime import datetime,timezone,timedelta
import json,re
root=Path(__file__).resolve().parents[1]
def write(file,text): (root/file).write_text(text,encoding='utf-8')
def section(file,heading,body):
 p=root/file;s=p.read_text(encoding='utf-8').split('\n'+heading)[0];p.write_text(s+'\n'+heading+'\n\n'+body.strip()+'\n',encoding='utf-8')
def replace(file,old,new):
 p=root/file;s=p.read_text(encoding='utf-8')
 if old in s:p.write_text(s.replace(old,new),encoding='utf-8')
activities=json.loads((root/'evidence/cu05/time.json').read_text(encoding='utf-8'))['activities'];done=[x for x in activities if x.get('finishedAt')];real=sum(x['elapsedMinutes'] for x in done);estimate=sum(x['estimateMinutes'] for x in done);status='Finalizado' if len(done)==5 else 'En curso'
def local(s):return datetime.fromisoformat(s.replace('Z','+00:00')).astimezone(timezone(timedelta(hours=-6))).strftime('%d/%m/%Y %H:%M:%S')
rows='\n'.join(f"| {a['id']} | {a['estimateMinutes']:.0f} | {local(a['startedAt'])} | {local(a['finishedAt']) if a.get('finishedAt') else 'Abierto'} | {str(round(a['elapsedMinutes'],3)) if a.get('finishedAt') else 'Medición en curso'} | {a['status']} |" for a in activities)
metrics='\n'.join(f"| {a['id']} | {a['estimateMinutes']:.2f} | {a['elapsedMinutes']:.3f} | {a['elapsedMinutes']-a['estimateMinutes']:.3f} | {(a['elapsedMinutes']/a['estimateMinutes']-1)*100:.2f} % |" for a in done)
write('docs/psp/PSP-Eric-Daniel-Salas-Martinez-CU05.md',f'''# Mi vida bajo el PSP aplicado a Reparix CU 05 acotado

Responsable académico: Eric Daniel Salas Martínez. Asignatura: Metodologías de Desarrollo de Software. Docente del formato: Beatriz Osorio Urrutia. Fecha real de apertura y revisión: 4/11/2026, America/Mexico_City. Modalidad: desarrollo asistido con Codex. Tiempo real solicitado: duración transcurrida observada, incluidas esperas; tiempo activo humano no medido. No se atribuyen ejecución manual, reuniones, firmas ni aceptación externa a Eric. Se conservan sin sobrescribir el PSP anterior de Eric para CU-01/CU-02 y el de Luis Alberto Hernández Velasco para CU-03.

## 1 Propósito de la actividad

Aplicar planificación, bitácora real, dificultades, evidencia y métricas al último incremento técnico OpenUP seleccionado. Se conserva la estructura del formato PSP académico original, sin copiar fechas o tiempos del ejemplo. CU-05 es parcial: terminar este incremento no termina el catálogo completo de Reparix ni acredita aceptación del equipo o del taller.

## 2 Actividad y objetivo medible

Integrar únicamente Recibido → En diagnóstico con técnico vigente activo, y En diagnóstico → Pendiente de autorización con diagnóstico/presupuesto vigente de esa asignación. Comprobar sesión, rol, origen, CSRF, versión, nota y autor/fecha, con cambio e historial atómicos. Bloquear saltos, retrocesos, repetición, reparación, entrega, devolución y cancelación. Una aceptación enviada por el navegador no habilita reparación. Preservar folios, datos, revisiones y evidencias de CU-01/CU-02/CU-03.

## 3 Instrucciones paso a paso

### Paso 1 Define la actividad y el objetivo

CU-05 acotado tiene status técnico Finalizado. Se verifican 16 unitarias, 81 escenarios funcionales HTTP/PostgreSQL, 33 comprobaciones de navegador y 6 de recuperación: 136 distintas del build actual, incluidas regresiones. Node agrega cuatro padres en integración, por lo que 85 tests no significan 85 escenarios. Criterios y contrato en docs/cu05.md. Revisión independiente y cierre humano de E4 pendientes.

### Paso 2 Planea antes de comenzar

| Fase | Estimado min | Trabajo |
|---|---:|---|
| Preparación y organización | 10 | Inspección, escritura, copia y compatibilidad |
| Actividad principal | 15 | Diseño de estados, permisos, edición y riesgos |
| Implementación | 40 | Migraciones, función restringida, MVC y vista |
| Revisión o autoevaluación | 30 | Concurrencia, regresión, UI, migración y restauración |
| Cierre y reflexión | 15 | PSP/TSP, PDF y paquete final OpenUP |
| Total | 110 | Duración asistida estimada, sin equivalencia a horas-persona |

Plan registrado en docs/cu05.md. Preparación tiene estimación de referencia Codex porque la inspección empezó antes del cronómetro; su tramo previo no se reconstruye ni se cuenta como cero. Las otras fases son prospectivas y se conservan. El refuerzo de altas 005 se realizó dentro de revisión; no se modificó la migración 004 ya aplicada en la base local. Se conservan 544 h-persona totales, 340 construcción y UCP 810.92 h con supuestos provisionales; no se descuentan minutos asistidos de capacidad humana ni se promete productividad equivalente.

### Paso 3 Registra el tiempo real

Bitácora en evidence/cu05/time.json, marcas UTC conservadas y presentación local America/Mexico_City. Las filas miden duración transcurrida de ejecución asistida, incluidos comandos y espera. No se midió tiempo activo humano ni interrupciones. Duraciones de comandos incluidas en las fases: no volver a sumarlas.

| ID | Est min | Inicio local | Fin local | Real min | Status |
|---|---:|---|---|---:|---|
{rows}

Subtotal medido al corte: {real:.3f} min; registro {status}. La inspección anterior al cronómetro y la sincronización final de registro/PDF/huellas después del corte se delimitan como no cronometradas; no se inventan comienzos, pausas ni horas-persona del equipo.

### Paso 4 Registra las dificultades

| ID | Dificultad del proceso | Acción y resultado |
|---|---|---|
| P05-01 | CU-03 previo permitía registrar preparación en Recibido | Al integrar CU-05 se exige En diagnóstico para nuevas revisiones; se ajustaron precondiciones de pruebas conservando rechazos, integridad e historia |
| P05-02 | Reasignar o revisar presupuesto en pendiente podría invalidar su vigencia | Edición solo en Recibido/En diagnóstico según CU; pendiente queda de consulta, sin añadir retornos fuera del alcance |
| P05-03 | Un comando auxiliar PowerShell falló por comillas | No ejecutó modificaciones; se reemplazó por parches explícitos y se verificó el resultado guardado |
| P05-04 | Ampliar CHECK de estados podía permitir altas SQL fuera de Recibido | Refuerzo preventivo 005 con trigger de alta; 004 aplicada conservada; S20 y restauración final comprueban la protección |

No se observaron nuevos defectos del producto en los escenarios ejecutados. P05-04 es un refuerzo identificado por revisión, sin inventar explotación o falla ejecutada previa. Los fallos P0001 de historial son inyecciones deliberadas para comprobar rollback; no defectos abiertos. DEF-001/002/003 mantienen su historial en docs/defects.md. No se inventan dificultades personales de Eric.

### Paso 5 Comprueba el resultado y reúne evidencia

Código MVC y migraciones 004/005 en server/client/db. Runtime sigue sin UPDATE directo de estado ni historial; función SECURITY DEFINER fija y sin PUBLIC verifica actor, versión, asignación y presupuesto bajo bloqueo. El trigger obliga a comenzar cualquier alta en Recibido. Historial y metadatos de estado usan misma fecha y autor. La UI consulta versiones coherentes, confirma explícitamente y conserva nota ante resultado incierto.

Evidencia nueva en evidence/cu05. unit.log 16 U; final-integration-migrations.log 81 escenarios (I17+A22+D17+S22+M03/M04/M05), 85 tests con padres. browser-result.json 9 F y regresiones 15 B/C + 9 E, sin pageErrors. build.log Angular 22.1.7 compilado. final-migration registra cinco migraciones conservando datos previos; base principal vacía, sin cuentas humanas. M05 verifica CU-03 poblado antes de migrar y conserva su presupuesto histórico en Recibido sin fabricar eventos. final/recovery-result.json compara once tablas, incluidos estados En diagnóstico/Pendiente, metadatos, revisiones y permisos; R06 confirma transición después de restaurar y bloqueo de reparación. El ensayo no establece RPO/RTO aprobados.

Capturas sintéticas de escritorio, móvil e inicio de diagnóstico inspeccionadas. PDF renderizado y revisado en todas sus páginas. Distribución Node/Angular en artifacts/reparix-openup, con instalación de producción, smoke, SHA256SUMS y ZIP verificados; no es un .exe autónomo. ZIP excluye .env, bases, node_modules y adjuntos fuente. Fuentes, PSP anteriores y paquetes históricos conservados. No se hicieron pruebas físicas de equipos ni operación productiva.

### Paso 6 Calcula e interpreta las métricas

Diferencia = real - estimado; desviación = (real - estimado) / estimado × 100. Se comparan solo actividades cerradas. Valor positivo indica mayor duración; negativo menor. Preparación se compara con referencia identificada, no con un plan anterior a toda la inspección.

| ID | Est min | Real min | Diferencia min | Desviación |
|---|---:|---:|---:|---:|
{metrics}

Subtotal comparable: estimado {estimate:.2f} min, real {real:.3f} min, diferencia {real-estimate:.3f} min, desviación {(real/estimate-1)*100 if estimate else 0:.2f} %. Este dato no demuestra productividad humana ni viabilidad UCP. Tamaño del incremento: CU-05 parcial con dos transiciones, consulta e historial; cuatro de ocho CU seleccionados no equivalen a 50 % de esfuerzo ni a todo el producto terminado.

### Paso 7 Propón un plan personal de mejora

1. Abrir el cronómetro antes de inspeccionar la siguiente actividad y conservar estimaciones y cortes, separando espera asistida de tiempo activo humano.
2. Mantener la matriz de transiciones y edición junto con casos de carrera entre presupuesto, asignación y estado; verificar cada rechazo sin escritura y cada rollback completo.
3. Antes de ampliar reparación en Scrum, definir CU-04 y evidencia de aceptación ligada a la revisión vigente, revisar capacidad humana y validar PD-03 con el taller. No resolver el calendario retirando controles.

## 4 Preguntas para las conclusiones

1. La fase de mayor duración entre las cerradas es {max(done,key=lambda x:x['elapsedMinutes'])['id'] if done else 'aún no determinada'}, según el intervalo asistido observado; no se deduce tiempo activo humano.
2. El subtotal comparable difiere en {real-estimate:.3f} min ({(real/estimate-1)*100 if estimate else 0:.2f} %). Se conservan estimaciones y límite de preparación no medida.
3. Revisar conjuntamente estados, edición y permisos SQL permite anticipar la invalidación de presupuesto o una alta fuera del estado inicial. Un comando con comillas debe comprobarse antes de atribuir su ejecución.
4. El objetivo técnico se alcanzó en dos transiciones con condiciones, auditoría, conflictos y recuperación verificados. Los controles mantienen reparación bloqueada y la aceptación formal pendiente.
5. Sin bitácora faltarían esperas, refinamiento 005, límites de tiempo y distinción entre trabajo asistido y capacidad humana.
6. Se cerró un ciclo objetivo, criterios/riesgos, diseño, implementación, integración, pruebas y registros OpenUP, con PSP académico y consolidación TSP sin asistencia inventada.
7. Dificultades de herramientas o alcance no son automáticamente defectos. La inyección de fallas verifica manejo del error; no es prueba de que existiera un defecto del producto.
8. La siguiente mejora se verificará manteniendo pruebas de bloqueo hasta que CU-04 aporte aceptación válida por versión. Son conclusiones técnicas del desarrollo asistido, no opiniones, firmas o aceptación atribuidas a Eric.

## 5 Entregables

PSP CU-05 Markdown/PDF a nombre de Eric Daniel Salas Martínez, contrato y matriz de estados, código MVC, migraciones incrementales, casos/resultados, documentación, plan actualizado y distribución con huellas. CU-01/CU-02/CU-03 y CU-05 parcial: Finalizado técnico. Actividades terminadas con status exacto Finalizado. PSP previos de Eric y Luis intactos. Proyecto completo, E4, revisión independiente y aceptación humana no finalizados.

## 6 Rúbrica del formato PSP

Objetivo 10, planeación 15, tiempo real 20, dificultades 15, métricas 15, evidencia 10, mejora 10 y presentación 5: total 100 puntos. Criterios conservados, sin calificación autoasignada.

## 7 Criterios importantes

Conservar fuentes, estimaciones y fechas reales, sin mtime como tiempo activo ni equivalencia automática con horas-persona. Modalidad asistida explícita. No copiar tiempos de otro proyecto ni inventar participación, pruebas físicas, firmas, reuniones o aceptación del taller.

## 8 Cierre y conexión con la ingeniería de software

Último incremento técnico OpenUP seleccionado cerrado hasta Pendiente de autorización; CU-05 es parcial. Scrum conserva CU-04, CU-06, CU-07, CU-08 y ampliación de CU-05. No se inicia reparación con aceptación inexistente, antigua o enviada arbitrariamente por navegador. Continúan revisión independiente, validación con taller, PD-03, políticas de respaldo, recuperación persistente de borrador y preparación productiva. Una recarga forzada pierde captura/clave en memoria; pruebas aprobadas no demuestran ausencia de defectos.

Referencia del formato: Humphrey, W. S. (2000), The personal software process, CMU/SEI-2000-TR-022, indicada en la fuente académica conservada.
''')
replace('README.md','y CU-03 Registrar diagnóstico y presupuesto, status','CU-03 Registrar diagnóstico y presupuesto y CU-05 acotado, status')
replace('README.md','CU-02 Asignar técnico CU-03','CU-02 Asignar técnico, CU-03')
replace('README.md','implementa CU-01, CU-02 y CU-03. CU-05 todavía no está construido.','implementa CU-01, CU-02, CU-03 y CU-05 parcial hasta Pendiente de autorización.')
replace('README.md','[contrato CU-03](docs/cu03.md).','[contrato CU-03](docs/cu03.md) y [CU-05 acotado](docs/cu05.md).')
replace('README.md','La transición de estado sigue bloqueada.','Recepción/administrador y técnico asignado pueden avanzar Recibido → En diagnóstico → Pendiente de autorización con condiciones, nota y versión; reparación sigue bloqueada. Nuevas revisiones solo en En diagnóstico y pendiente de consulta.')
replace('README.md',"$env:EVIDENCE_DIR='evidence/cu03'","$env:EVIDENCE_DIR='evidence/cu05'\nnode --env-file=.env scripts/cu05-browser-check.mjs")
replace('README.md','artifacts/reparix-cu03 y artifacts/reparix-cu03.zip contienen','artifacts/reparix-openup y artifacts/reparix-openup.zip contienen')
replace('README.md','CU-01, CU-02 y CU-03 tienen evidencia técnica;','CU-01, CU-02, CU-03 y CU-05 parcial tienen evidencia técnica;')
replace('README.md','se entrega artifacts/reparix-cu03.','se conserva también artifacts/reparix-cu03 y se entrega artifacts/reparix-openup.')
replace('README.md','CU-05 y aceptación externa pendientes.','CU-05 parcial implementado; ampliación y aceptación externa pendientes.')
section('README.md','## Último incremento OpenUP y PSP CU-05','[PSP Eric Daniel Salas Martínez CU-05](docs/psp/PSP-Eric-Daniel-Salas-Martinez-CU05.md), con PDF separado. Se conservan el PSP CU-01/CU-02 de Eric y CU-03 de Luis. Último incremento técnico seleccionado Finalizado, con CU-05 parcial. Crear cuentas individuales mediante New-LocalUser.ps1; no hay usuarios humanos o contraseñas por defecto. Aplicar npm run db:migrate sin borrar datos. El presupuesto y la asignación son de consulta al quedar pendientes; CU-04 y ampliación del flujo deben definirse antes de reparación o retornos. No se declara producción ni cierre formal del equipo.')
replace('docs/architecture.md','Estado limitado por CHECK a Recibido, sin ruta de transición. Al incorporar CU-05, migración explícita para los tres estados OpenUP y reglas por orden/version; En reparación seguirá bloqueado.','CHECK de tres estados OpenUP con transición controlada por función restringida; trigger de altas obliga a Recibido. En reparación permanece bloqueado.')
replace('docs/architecture.md','CU-05 sigue pendiente.','CU-05 acotado se incorpora abajo.')
replace('docs/architecture.md','No hay aceptación heredada, decisión cliente ni transición.','No hay aceptación heredada, decisión cliente ni transición implícita; las transiciones explícitas se incorporan mediante CU-05 acotado.')
section('docs/architecture.md','## Modelo transaccional CU-05 acotado','Migración 004 agrega metadatos de estado y CHECK de tres estados sin reescribir órdenes; 005 refuerza altas en Recibido. El rol runtime conserva sin UPDATE(state/state_changed_at/state_changed_by). Ejecuta función transition_order sin PUBLIC y search_path fijo, que bloquea orden, actor y técnico; valida estado previo/destino, rol, pertenencia, cuenta activa, versión y última revisión de la asignación. Estado/versión/metadatos e historial con misma fecha se confirman juntos o se revierten juntos. API GET/POST /api/orders/:folio/state, DTO de estados sin contacto cliente. La vista verifica que orden, presupuesto y estado tengan la misma versión al consultar; si cambió durante la lectura exige consultar de nuevo. CU-03 registra solo en En diagnóstico; CU-02 reasigna en Recibido/En diagnóstico; pendiente queda de consulta. Las revisiones históricas en Recibido se preservan y pueden usarse si su asignación aún es vigente. No se implementa aceptación ni reparación.')
replace('docs/implementation-plan.md','Versión 0.3 de planificación','Versión 0.4 de planificación')
replace('docs/implementation-plan.md','CU-01, CU-02 y CU-03 tienen status Finalizado','CU-01, CU-02, CU-03 y CU-05 parcial tienen status Finalizado')
replace('docs/implementation-plan.md','CU-05 conserva criterios, sin rutas ni pantallas funcionales.','CU-05 parcial integra las dos transiciones hasta Pendiente de autorización, con permisos e historial; no completa el flujo del producto.')
replace('docs/implementation-plan.md','CU-01, CU-02 y CU-03 tienen status Finalizado','CU-01, CU-02, CU-03 y CU-05 parcial tienen status Finalizado')
replace('docs/implementation-plan.md','CU-03 y CU-05 permanecen condicionados.','El compromiso humano de funciones y aceptación sigue condicionado; el cierre técnico asistido de CU-03/CU-05 parcial se registra abajo.')
replace('docs/implementation-plan.md','CU-05 y la aceptación formal permanecen condicionados.','La ampliación de CU-05 y la aceptación formal permanecen condicionadas.')
replace('docs/implementation-plan.md','CU-05 sigue condicionado y sin implementar.','CU-05 acotado se integra en el apartado siguiente; su ampliación sigue condicionada.')
replace('docs/implementation-plan.md','CU-03 y CU-05 conservan criterios, sin rutas ni pantallas funcionales.','CU-03 y CU-05 parcial tienen implementación técnica verificada; el flujo completo sigue fuera de alcance.')
replace('docs/implementation-plan.md','CU-03 implementado; CU-05 planificado.','CU-03 y CU-05 parcial implementados técnicamente.')
replace('docs/implementation-plan.md','client/dist/client/browser; artifacts/reparix-cu03','client/dist/client/browser; artifacts/reparix-openup')
section('docs/implementation-plan.md','## Último incremento seleccionado CU-05','Por instrucción del usuario, CU-05 acotado a nombre de Eric Daniel Salas Martínez: Finalizado técnico hasta Pendiente de autorización, con PSP independiente. Se conservan los cuatro CU seleccionados y alcance completo del catálogo; cuatro de ocho representan 50 % del catálogo, con CU-05 parcial, no 50 % del esfuerzo ni finalización del producto. Calendario R0–T1, 544 h-persona totales, 340 construcción y UCP 810.92 h conservados; duraciones asistidas no sustituyen capacidad humana. El trabajo técnico adelantado en E4 no acredita ejecución futura ni doble carga. Restante OpenUP: revisión independiente, capacidad real/PD, demostración y aceptación formal; no construir más funciones sin un nuevo incremento autorizado. Scrum conserva CU-04/06/07/08 y ampliación de CU-05. Evidencias de Fase III: código server/client/db, componentes architecture/cu01/cu02/cu03/cu05, casos test-cases, resultados evidence/cu05, build artifacts/reparix-openup, documentación README/docs y plan/TSP/PSP actualizados.')
section('docs/tsp/team-record.md','## Último incremento técnico CU-05 AT-004','4/11/2026 local. Usuario solicita último incremento OpenUP y PSP a nombre de Eric Daniel Salas Martínez. CU-05 parcial Finalizado técnico; CU-01/CU-02 de Eric y CU-03 de Luis conservados. Plan asistido 110 min, preparación con referencia identificada y restantes prospectivas; tiempos en evidence/cu05/time.json. No hay reunión, firma ni horas humanas atribuidas. DEC-013: dos transiciones sin reparación; DEC-014: edición solo antes de pendiente; DEC-015: función restringida sin UPDATE general y refuerzo de alta 005 aditivo. Revisar decisiones con responsables reales. Capacidad, calendario y UCP originales conservados. Revisión independiente y aceptación externa pendientes; último incremento técnico no cierra E4 por sí mismo.')
replace('docs/tsp/iteration-close.md','CU-01, CU-02 y CU-03: status Finalizado técnico','CU-01/CU-02/CU-03 y CU-05 parcial: status Finalizado técnico')
replace('docs/tsp/iteration-close.md','Revisión independiente CU-01/CU-02/CU-03; reestimar CU-05 acotado, aún sin construir','Revisión independiente de los cuatro CU seleccionados, demostración/PD y decisión formal; CU-05 parcial ya integrado')
section('docs/tsp/risks.md','## Riesgos revisados CU-05','ORM-20: función/contrato/CHECK bloquean reparación y aceptación forjada; S11/S20/R06. ORM-21: versión, bloqueos e historial controlan concurrencia con presupuesto/asignación; S14–18. ORM-23: técnico solo propio y DTO mínimo; S02/S13/F09. ORM-26: once tablas y metadatos exactos restaurados, sin RPO/RTO aprobado. ORM-30: cierre asistido no acredita productividad humana ni viabilidad UCP. Persiste pérdida del borrador al forzar cierre/recarga. Riesgos operativos, PD-03 y aceptación externa no se eliminan por pruebas aprobadas.')
replace('docs/cu05.md','Estado inicial Planificado.','Estado técnico Finalizado. Revisión independiente y aceptación pendientes.')
section('docs/cu05.md','## Refuerzo final y resultado','004 conserva su definición aplicada; 005 agrega trigger que rechaza altas SQL fuera de Recibido o con versión/metadatos de transición iniciales. Ninguna migración previa 001/002/003 se modifica. Las pruebas actuales pasan 16 U + 81 integración + 33 navegador + 6 recuperación = 136 comprobaciones funcionales distintas, sin sumar padres ni repeticiones. Detalles en PSP Eric CU-05 y verification.md. Estado técnico Finalizado; alcance parcial, sin reparación.')
section('docs/cu02.md','## Integración posterior con CU-05','El contrato inicial CU-02 se conserva como corte histórico. En el build actual se permite asignar/reasignar en Recibido o En diagnóstico; pendiente de autorización es de consulta. Se conserva una vigente, autor/fecha e historial, versión y conflicto. La nueva asignación invalida vigencia del presupuesto anterior, sin borrar antecedentes. Reglas de edición y transición en docs/cu05.md.')
section('docs/cu03.md','## Integración posterior con CU-05','El corte histórico CU-03 permitía preparación en Recibido; sus revisiones y PSP de Luis quedan conservados. En el build actual, nuevas revisiones solo en En diagnóstico. Pendiente de autorización es de consulta; requiere revisar reglas de retorno en una ampliación posterior para editar. Un presupuesto histórico de Recibido conserva fecha/autor y puede usarse tras iniciar diagnóstico si aún corresponde a la asignación vigente. No se fabrican eventos pasados ni se hereda aceptación. Ver docs/cu05.md.')
labels=[]
for m in re.finditer(r"t\.test\('(S\d+) ([^']+)'",(root/'server/test/state.integration.test.js').read_text(encoding='utf-8')):labels.append(f'| {m[1]} | {m[2]} | Finalizado |')
for c in json.loads((root/'evidence/cu05/browser-result.json').read_text(encoding='utf-8'))['checks']:labels.append('| '+c.split(' ',1)[0]+' | '+c.split(' ',1)[1]+' | Finalizado |')
section('docs/test-cases.md','## Casos CU-05 acotado verificados','Precondiciones: dependencias fijadas y PostgreSQL migrado. U14–16 validan destinos/nota/versión; M05 conserva CU-03 poblado y presupuesto histórico; R06 restaura estado, metadatos y bloqueo de reparación. Rechazos conservan estado, presupuesto e historial; S15 inyecta P0001 y comprueba rollback.\n\n| ID | Condición y resultado esperado comprobado | Status |\n|---|---|---|\n'+'\n'.join(labels)+'\n\nRegresión CU-03 ahora prepara En diagnóstico antes de registrar; no se retiran pruebas negativas. State fuera de alcance devuelve 422 en lugar del antiguo 404 de ruta ausente. S20 también prueba que una alta SQL fuera de Recibido sea rechazada. Preparación de pruebas y evidencias históricas anteriores conservadas.')
section('docs/verification.md','## Último incremento OpenUP CU-05 acotado','4/11/2026 local, UTC 5/11 convertido a America/Mexico_City. PSP nuevo Eric CU-05; PSP Eric CU-01/CU-02 y Luis CU-03 intactos. Resultado técnico Finalizado parcial, revisión humana pendiente.\n\n| Comprobación | Resultado real | Evidencia |\n|---|---|---|\n| npm test | 16/16, salida 0 | evidence/cu05/unit.log |\n| npm run test:integration, cadena 001–005 | 81 escenarios; 85 tests con cuatro padres, salida 0 | evidence/cu05/final-integration-migrations.log |\n| npm run build | Angular 22.1.7, 216.75 kB iniciales y 57.31 kB estimados de transferencia | evidence/cu05/build.log |\n| Navegador CU-05 | 9 F, sin pageErrors | evidence/cu05/browser-result.json |\n| Regresión navegador CU-01/02 | 15 B/C, sin pageErrors | evidence/cu05/regression-cu02/browser-result.json |\n| Regresión navegador CU-03 | 9 E, sin pageErrors, precondición En diagnóstico | evidence/cu05/regression-cu03/browser-result.json |\n| Migración y repetición local | Cinco versiones y trigger de alta presentes; diez tablas históricas/secuencia conservadas, base vacía | evidence/cu05/migration-result.json y final-migration.log |\n| Migraciones pobladas | M03/M04/M05 conservan datos, revisiones y folios; metadatos nuevos NULL excluidos de comparación histórica | final-integration-migrations.log |\n| Recuperación final con trigger 005 | 6 R; once tablas exactas, estados y metadatos restaurados; copia sintética 38577 bytes, ensayo 608 ms | evidence/cu05/final/recovery-result.json |\n\n136 comprobaciones funcionales distintas del build actual: 16 + 81 + 33 + 6. No sumar padres o repeticiones ni atribuir todas como funciones nuevas. Dos estados alcanzables adicionales, sin reparación ni decisión cliente. Capturas sintéticas escritorio/móvil/inicio inspeccionadas. El rol runtime sigue sin UPDATE directo de estado, fechas, autores o historial. Función restringida verifica condiciones y trigger obliga a iniciar altas en Recibido. Una falla de historial revierte estado/versión/metadatos; conflictos exigen consulta y confirmación.\n\nSe mantuvieron 001/002/003 y se agregó 005 después de 004 para no reescribir una migración aplicada. Se repitió recuperación porque el trigger debe permitir restaurar órdenes ya avanzadas. No se reinició durante otra prueba dependiente. Un comando auxiliar falló por comillas sin ejecutarse, sustituido por parches; no se atribuyen sus modificaciones como guardadas. No se observaron nuevos defectos del producto; refuerzos por revisión no se presentan como explotación observada.\n\nAlcance técnico de cuatro CU seleccionado disponible, con CU-05 parcial. No equivale a cierre del producto completo, E4 ni aceptación humana. Sin pruebas físicas, despliegue público o producción. Persisten PD-03, revisión independiente, RPO/RTO y borrador en memoria. Dependencias preservadas y Angular/CLI 22.1.7; versión identificadora 0.4.0-openup.')
print('PSP Eric CU-05 and final OpenUP documentation synchronized')
