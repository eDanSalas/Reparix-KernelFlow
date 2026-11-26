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

### HU-04 · Registro de usuarios internos

Ejecuta `npm run db:migrate` para aplicar las migraciones `010` y `015`, que habilitan el alta y su historial. Conserva las cuentas existentes. Con una sesión administrativa, abre **Roles y permisos → Registrar cuenta interna** y captura el nombre completo, el nombre de usuario único, la contraseña inicial y el rol. La cuenta queda activa y puede iniciar sesión con sus propias credenciales.

Con PostgreSQL y Edge disponibles, ejecuta `npm run build` y `npm run test:hu04:browser`. La prueba usa una base temporal y guarda sus resultados en `test-results/hu04/`. Puedes cambiar el puerto con `REPARIX_BROWSER_PORT` o usar Chrome con `REPARIX_BROWSER_CHANNEL=chrome`. [Benchmark & SysOutput de HU-04](docs/hu04/benchmark-sysoutput.md)

### HU-05 · Roles y permisos

Ejecuta `npm run db:migrate` para aplicar la migración `009`, que agrega el historial de roles. Si necesitas crear una cuenta administrativa para el entorno local, usa `.\scripts\New-LocalUser.ps1 -Username admin-local -DisplayName "Administración" -Role administrador`. Inicia sesión con esa cuenta y abre **Roles y permisos** en la cabecera. Selecciona una cuenta interna y el rol que quieres asignarle. El cambio se refleja en el historial y en los permisos de sus sesiones abiertas.

Con PostgreSQL activo, ejecuta `npm run build` y `npm run test:hu05:browser`. El recorrido usa una base temporal y Microsoft Edge. Puedes elegir otro puerto con `REPARIX_BROWSER_PORT` o Google Chrome con `REPARIX_BROWSER_CHANNEL=chrome`. Los resultados se guardan en `test-results/hu05/`. [Benchmark & SysOutput de HU-05](docs/hu05/benchmark-sysoutput.md)

### HU-06 · Desactivación de usuarios internos

Ejecuta `npm run db:migrate` antes de iniciar la aplicación actualizada. La migración `011` registra las desactivaciones y cierra las sesiones abiertas. La `016` comprueba que la cuenta sigue activa al emitir una sesión, incluso si coincide con una desactivación.

Con una sesión administrativa, abre **Roles y permisos**, selecciona la cuenta y confirma **Desactivar cuenta** en **Acceso de la cuenta**. La cuenta queda inactiva y el historial muestra quién la desactivó y cuándo. La autoría de sus operaciones anteriores se conserva.

Con PostgreSQL y Edge disponibles, ejecuta `npm run build` y `npm run test:hu06:browser`. El recorrido usa una base temporal y deja sus resultados en `test-results/hu06/`. Puedes cambiar el puerto con `REPARIX_BROWSER_PORT` o usar Chrome con `REPARIX_BROWSER_CHANNEL=chrome`. [Benchmark & SysOutput de HU-06](docs/hu06/benchmark-sysoutput.md)

### HU-07 · Confirmación de entrega física

Ejecuta `npm run db:migrate` antes de iniciar la aplicación actualizada. La migración `012` guarda la entrega y protege el estado **Entregado**. La `017` habilita el paso de **En reparación** a **Listo para recoger**.

El técnico asignado o Administración marca el equipo **Listo para recoger** desde **Estado de la orden**. Recepción o Administración recupera el folio, captura el receptor y la evidencia en **Entrega física** y confirma que el equipo se entregó. Si la respuesta queda pendiente, **Reintentar la misma entrega** conserva la clave y la captura de la solicitud original. Al consultar de nuevo un folio entregado, el panel muestra el registro persistido.

Con PostgreSQL y Edge disponibles, ejecuta `npm run build` y `npm run test:hu07:browser`. El recorrido usa una base temporal, simula que el navegador pierde la primera respuesta de confirmación y guarda los resultados en `test-results/hu07/`. Puedes cambiar el puerto con `REPARIX_BROWSER_PORT` o usar Chrome con `REPARIX_BROWSER_CHANNEL=chrome`. [Benchmark & SysOutput de HU-07](docs/hu07/benchmark-sysoutput.md)

### HU-08 · Cancelación de órdenes

Ejecuta `npm run db:migrate` antes de iniciar la aplicación actualizada. La migración `013` habilita **Cancelado** y registra la transición con el motivo, el usuario y la fecha.

Con una sesión de Recepción o Administración, consulta una orden **En diagnóstico**. En **Estado de la orden**, abre **Cancelar orden**, captura el motivo y confirma. El historial muestra la cancelación y el equipo permanece bajo custodia del taller.

Con PostgreSQL y Edge disponibles, ejecuta `npm run build` y `npm run test:hu08:browser`. El recorrido usa una base temporal y guarda sus resultados en `test-results/hu08/`. Puedes cambiar el puerto con `REPARIX_BROWSER_PORT` o usar Chrome con `REPARIX_BROWSER_CHANNEL=chrome`. [Benchmark & SysOutput de HU-08](docs/hu08/benchmark-sysoutput.md)

## Metodologías del desarrollo de Sistemas
## Ingeniería en Sistemas Computacionales
