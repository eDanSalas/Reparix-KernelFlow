# Reparix OpenUP

Incrementos académicos CU-01 Registrar orden, CU-02 Asignar técnico, CU-03 Registrar diagnóstico y presupuesto y CU-05 acotado, status Finalizado en implementación y verificación técnica, con Angular **22.1.7**, Node.js **24 JavaScript**, PostgreSQL **18.4** y separación MVC cliente/servidor. El plan selecciona CU-01→CU-02→CU-03→CU-05 acotado; este repositorio implementa CU-01, CU-02, CU-03 y CU-05 parcial hasta Pendiente de autorización. Revisión independiente y aceptación formal pendientes. CU-04/06/07/08 y el resto del flujo quedan para Scrum.

## Documentos y resultados

- [Plan completo y UCP](docs/implementation-plan.md): capacidad total 544 h, construcción 340 h; cuatro CU estimados en 810.92 h bajo supuestos provisionales, sin compromiso ficticio de viabilidad.
- [Arquitectura](docs/architecture.md) , [contrato CU-01](docs/cu01.md) y [contrato CU-02](docs/cu02.md) y [contrato CU-03](docs/cu03.md) y [CU-05 acotado](docs/cu05.md).
- [Casos de prueba](docs/test-cases.md), [resultados reales](docs/verification.md) y [defectos](docs/defects.md).
- [PSP de Eric Daniel Salas Martínez](docs/psp/PSP-Eric-Daniel-Salas-Martinez.md), con PDF en esa misma carpeta: desarrollo asistido con Codex, estimaciones identificadas y duración transcurrida observable.
- [Continuación y estimaciones prospectivas](docs/continuation-plan.md): secuencia documental, regresión y CU-02; registros de tiempos separados de capacidad humana.
- [TSP, decisiones y capacidad](docs/tsp/team-record.md), [cierre de iteración](docs/tsp/iteration-close.md), [riesgos](docs/tsp/risks.md).
- Fuentes originales en docs/sources. Evidencias de ejecución y capturas sintéticas en evidence. Git local inicializado, sin commits ni publicación del agente.

## Inicio en Windows PowerShell

Requisitos: Node.js 24.15 o posterior de la rama 24, npm compatible y Docker Desktop iniciado. El proyecto se verificó con Node 24.20.0 y npm 11.19.0. El contenedor de este proyecto publica PostgreSQL solo en 127.0.0.1:55432; no usar ese puerto si ya está ocupado por otro servicio. No se modifican otras bases o proyectos.

```powershell
Set-Location 'C:\Users\danie\Documents\Reparix-OpenUp'
npm ci
# Solo si todavía no existe .env: genera credenciales distintas sin imprimirlas.
node scripts/setup-local.mjs
docker compose up -d --wait
npm run db:migrate
npm run build
# Alta individual local de soporte; solicitará una contraseña sin mostrarla.
.\scripts\New-LocalUser.ps1 -Username 'eric.daniel' -DisplayName 'Eric Daniel Salas Martínez' -Role 'recepcion'
npm start
```

En el entorno ya preparado por esta sesión .env y la base existen: omitir setup-local, que rechaza sobrescribir .env. No hay cuenta ni contraseña por defecto. No se creó una cuenta humana sin que el usuario elija su contraseña. Abrir http://localhost:3000, iniciar sesión y usar datos sintéticos. El formulario permite registrar recepción, recuperar comprobante exacto por folio e imprimirlo. Recepción/administración asigna o reasigna un técnico activo con confirmación explícita, versión e historial. El técnico consulta por folio únicamente su asignación vigente, sin contacto del cliente. Diagnóstico y cambios de estado siguen bloqueados. Para una cuenta técnico usar New-LocalUser.ps1 con -Role tecnico y contraseña individual elegida por el usuario. La base local no contiene cuentas humanas ni órdenes de pruebas.

Desarrollo con dos consolas: establecer APP_ORIGIN=http://localhost:4200 en .env; ejecutar npm run dev:server y npm run dev:client. Para el build servido por Node volver a APP_ORIGIN=http://localhost:3000. Nunca desactivar la verificación de origen para resolver una configuración errónea.

## Pruebas reproducibles

```powershell
npm test
npm run test:integration
$env:EVIDENCE_DIR='evidence/cu05'
node --env-file=.env scripts/cu05-browser-check.mjs
node --env-file=.env scripts/cu03-browser-check.mjs
node --env-file=.env scripts/browser-check.mjs
node --env-file=.env scripts/recovery-check.mjs
```

Integración crea y retira una base aislada de nombre reparix_test_UUID; no vacía la base principal. Browser-check usa Edge instalado, puerto 3301 y datos sintéticos; conserva capturas reales. Recovery-check crea dos bases sintéticas, reinicia solo el contenedor db de este proyecto y compara once tablas, incluidas asignaciones y revisiones CU-03. No ejecutarlo durante una captura o sesión operativa: el reinicio interrumpe conexiones. El ensayo no fija RPO/RTO aprobados ni valida datos reales.

## Distribución y operación

```powershell
npm run build
npm run package
```

artifacts/reparix-openup y artifacts/reparix-openup.zip contienen build Angular, servidor JS, migraciones, scripts, documentación, lockfile y manifiesto de huellas. El ZIP no incluye .env, datos ni node_modules. En destino: npm ci --omit=dev, configurar .env con setup-local, iniciar PostgreSQL, migrar, crear cuenta individual y npm start. La distribución es una aplicación Node ejecutable; no es un archivo .exe ni un servicio de Windows instalado. No requiere compilar Angular en destino.

Respaldos de operación: ejecutar pg_dump de PostgreSQL con credencial autorizada por canal seguro y guardar la copia protegida; restaurar primero en base separada con pg_restore, cotejar tablas/folios/historial/idempotencia y permisos, y documentar RPO/RTO antes de cambiar la base activa. scripts/recovery-check.mjs es un ensayo reproducible para datos sintéticos, no una política de respaldo productivo. No distribuir work/recovery ni secretos. No ejecutar docker compose down -v ni reiniciar secuencias si se necesitan conservar órdenes. Para detener el contenedor conservando datos: docker compose stop db.

.env está excluido de Git. El servidor usa DATABASE_URL con rol restringido; OWNER_DATABASE_URL y APP_DB_PASSWORD se reservan a preparación local. Separarlos de la configuración runtime antes de desplegar en un alojamiento real. HTTPS, validación del taller, pruebas de accesibilidad con usuarios y políticas de conservación siguen pendientes. Con NODE_ENV=production la cookie exige HTTPS. El proyecto escucha solo en loopback.

## Límite del incremento

Un resultado incierto conserva la captura y clave en la pestaña y permite reintentar incluso al restablecer la misma cuenta. Forzar la recarga o cerrar el navegador pierde ese borrador: hay aviso al salir, no persistencia offline. No se ha validado operación productiva. CU-01, CU-02, CU-03 y CU-05 parcial tienen evidencia técnica; E4 continúa abierta hasta revisión del equipo. Revisar docs/verification.md antes de declarar una función terminada.

Distribución anterior conservada en artifacts/reparix-cu01 con corrección documental. ZIP original previo en work/before-continuation-20261104. Paquete histórico CU-02 con SHA256SUMS e integridad ZIP verificados; no incluye .env, bases, adjuntos fuente ni node_modules.

## PSP por incremento

CU-01/CU-02 permanecen en docs/psp/PSP-Eric-Daniel-Salas-Martinez.md y su PDF. CU-03 tiene registro separado en [PSP Luis Alberto Hernández Velasco](docs/psp/PSP-Luis-Alberto-Hernandez-Velasco-CU03.md), con PDF en esa carpeta. Se conserva artifacts/reparix-cu02 como distribución histórica y se conserva también artifacts/reparix-cu03 y se entrega artifacts/reparix-openup. Registro académico asistido: duración transcurrida, tiempo activo humano no medido. CU-05 parcial implementado; ampliación y aceptación externa pendientes.

## Último incremento OpenUP y PSP CU-05

[PSP Eric Daniel Salas Martínez CU-05](docs/psp/PSP-Eric-Daniel-Salas-Martinez-CU05.md), con PDF separado. Se conservan el PSP CU-01/CU-02 de Eric y CU-03 de Luis. Último incremento técnico seleccionado Finalizado, con CU-05 parcial. Crear cuentas individuales mediante New-LocalUser.ps1; no hay usuarios humanos o contraseñas por defecto. Aplicar npm run db:migrate sin borrar datos. El presupuesto y la asignación son de consulta al quedar pendientes; CU-04 y ampliación del flujo deben definirse antes de reparación o retornos. No se declara producción ni cierre formal del equipo.
