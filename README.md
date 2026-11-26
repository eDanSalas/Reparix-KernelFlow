# Reparix
# La Orden del Kernel

Aplicación interna para gestionar órdenes de un taller de reparación. El personal puede registrar la recepción de equipos, consultar órdenes por folio, asignar técnicos y dar seguimiento a los diagnósticos, presupuestos y cambios de estado.

La interfaz Angular está en `client/`, la API Node.js y sus pruebas en `server/`, y las migraciones de PostgreSQL en `db/`.

## Inicio local

Con Node.js 24 y Docker Desktop, ejecuta desde la raíz en PowerShell. El script de configuración crea `.env` cuando aún no existe.

```powershell
npm ci
if (-not (Test-Path .env)) { node scripts/setup-local.mjs }
docker compose up -d --wait db
npm run db:migrate
npm run build
npm start
```

Abre [Reparix](http://localhost:3000). Si necesitas una cuenta de recepción, créala desde otra terminal con `.\scripts\New-LocalUser.ps1 -Username recepcion -DisplayName "Recepción"`.

PostgreSQL se publica en `127.0.0.1:15432` con este Compose. Si conservas un `.env` generado con el puerto `55432`, ajusta `DATABASE_URL` y `OWNER_DATABASE_URL` al puerto publicado. Conserva las credenciales y el volumen existentes. Ejecuta `npm run db:migrate` al actualizar para aplicar las migraciones pendientes. La migración `008` agrega el canal de rechazo, vinculado al historial de la orden. Los rechazos anteriores a la migración se siguen mostrando con los datos que se registraron originalmente.

## Pruebas

Ejecuta `npm test` para las pruebas unitarias y `npm run test:integration` para las pruebas con PostgreSQL. Estas últimas requieren que el usuario de migración pueda crear y eliminar bases temporales en el entorno local de pruebas.

### HU-02 · Rechazo del presupuesto

Con PostgreSQL activo y Microsoft Edge instalado, ejecuta `npm run build` y `npm run test:hu02:browser`. La prueba levanta el backend en el puerto `3001`, sirve la compilación Angular y usa una orden sintética en una base temporal. Para usar otro puerto disponible, configura `REPARIX_BROWSER_PORT`. Para usar Google Chrome, establece `REPARIX_BROWSER_CHANNEL=chrome`.

El recorrido comprueba los campos obligatorios en Angular, el registro HTTP, la lectura del historial después de recargar, el bloqueo de reparación y la custodia en PostgreSQL. Guarda las capturas y el resultado de la consulta en `test-results/hu02/`. Consulta el [Benchmark & SysOutput de HU-02](docs/hu02/benchmark-sysoutput.md) para ver la evidencia del incremento.

## Metodologías del desarrollo de Sistemas
## Ingeniería en Sistemas Computacionales
