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

## Pruebas

Ejecuta `npm test` para las pruebas unitarias y `npm run test:integration` para las pruebas con PostgreSQL.

## Metodologías del desarrollo de Sistemas
## Ingeniería en Sistemas Computacionales
