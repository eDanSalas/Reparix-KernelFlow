# HU-06 · Desactivar usuarios internos

Clock Cycle 2 · Benchmark & SysOutput · 26 de noviembre de 2026

## Criterios de aceptación

| Criterio | Resultado observado | Prueba |
| --- | --- | --- |
| Una cuenta administrativa desactiva a otra cuenta con autor y fecha | Angular solicitó confirmación y Express devolvió HTTP 201. PostgreSQL conservó la cuenta inactiva y registró un evento con el usuario afectado, el administrador y la fecha. Angular mostró el evento después de recargar. Un intento desde recepción devolvió HTTP 403 y una desactivación repetida dejó un solo evento. | HU06-E2E, HU06-01, HU06-02, HU06-05 y HU06-07 |
| La cuenta desactivada pierde acceso | Las lecturas y escrituras con una sesión anterior devolvieron HTTP 401. Un ingreso nuevo con la contraseña correcta también devolvió HTTP 401 y quedó sin cookie de sesión. PostgreSQL quedó sin sesiones para esa cuenta. El caso concurrente comprobó el mismo resultado cuando el inicio de sesión coincidió con la desactivación. | HU06-E2E, HU06-03 y HU06-06 |
| Los registros históricos conservan su autoría | La orden anterior siguió disponible para administración. El comprobante en Angular mostró a la recepcionista original y en PostgreSQL tanto la orden como el evento de alta conservaron su identificador. | HU06-E2E y HU06-04 |

## Evidencia

- [Confirmación a 390 px](01-confirmacion-movil.png)
- [Cuenta inactiva e historial a 1440 px](02-cuenta-inactiva-escritorio.png)
- [Comprobante con la autora original](03-autoria-original.png)
- [Respuestas HTTP y filas verificadas en PostgreSQL](resultado.json)

## Reproducción

Sigue la [instalación local](../../README.md#inicio-local) y ejecuta desde la raíz con PostgreSQL y Edge disponibles.

```powershell
npm run db:migrate
npm run build
npm test
npm run test:integration
npm run test:hu06:browser
npm run test:hu05:browser
npm run test:hu04:browser
npm run test:hu02:browser
```

La prueba usa una orden y cuentas sintéticas en una base temporal. La migración `011` conserva la cuenta y ejecuta en una sola operación la desactivación, la revocación de sesiones y la escritura del historial. La migración `016` coordina la emisión de sesiones con esa operación.

Angular compiló sin errores ni advertencias. Pasaron 29 pruebas unitarias, 131 de integración y los cuatro recorridos en Edge. Las migraciones `011` y `016` quedaron aplicadas en la base local configurada. La prueba de arranque del paquete confirmó que Express sirve Angular y se conecta a PostgreSQL 18.4.

## Decisión del Product Owner

Acepto HU-06 para el incremento local. Administración puede retirar el acceso de una cuenta con un registro de quién lo hizo y cuándo. El backend bloquea las sesiones anteriores y los nuevos ingresos, y el taller conserva la autoría de las operaciones previas. La revisión del PR y su integración en `main` quedaron fuera del alcance de esta verificación.
