# HU-04 · Registrar usuarios internos

Clock Cycle 2 · Benchmark & SysOutput · 26 de noviembre de 2026

## Criterios de aceptación

| Criterio | Resultado observado | Prueba |
| --- | --- | --- |
| Crear una cuenta única con los datos y el rol válidos | Una sesión administrativa creó `tecnico.hu04` en Angular. Express devolvió HTTP 201. PostgreSQL guardó una cuenta activa, la contraseña derivada y el registro del alta con el autor, la fecha y el rol inicial. La cuenta inició sesión con sus credenciales y apareció en el catálogo de técnicos. Los datos incompletos y los roles inválidos se rechazaron con HTTP 422. | HU04-E2E, HU04-01, HU04-04 y HU04-06 |
| Rechazar un nombre de usuario duplicado | Angular mostró el error del servidor en el campo de nombre de usuario. La API devolvió HTTP 409. PostgreSQL conservó una sola cuenta y un solo registro de alta, también al recibir solicitudes simultáneas. | HU04-E2E, HU04-02 y HU04-05 |
| Impedir el registro sin permiso administrativo | Recepción y Técnico recibieron HTTP 403 al enviar el alta directamente a la API. Ninguno de esos intentos creó una cuenta. | HU04-E2E y HU04-03 |

La migración `015` escribe la cuenta y el historial de alta dentro de la misma operación. Si falla el historial se revierte la cuenta. Las cuentas anteriores se conservan con los datos de alta que estaban disponibles antes de la migración.

## Evidencia

- [Formulario de alta en móvil a 390 px](01-alta-movil.png)
- [Cuenta y autor del alta tras recargar el directorio](02-alta-en-directorio.png)
- [Rechazo del duplicado en escritorio a 1440 px](03-duplicado-escritorio.png)
- [Respuestas HTTP, migraciones y consulta de PostgreSQL](resultado.json)

## Reproducción

Sigue la [instalación local](../../README.md#inicio-local) y ejecuta desde la raíz con PostgreSQL y Edge disponibles.

```powershell
npm run db:migrate
npm run build
npm test
npm run test:integration
npm run test:hu04:browser
npm run test:hu05:browser
npm run test:hu02:browser
```

Los recorridos usan cuentas sintéticas en bases temporales. La prueba M07 ejecuta la actualización desde la versión `014` con una cuenta previa y verifica que una segunda ejecución conserve los datos y el historial de la nueva cuenta.

Angular compiló sin errores ni advertencias. Pasaron 29 pruebas unitarias, 128 de integración y los tres recorridos en Edge. La prueba de arranque del paquete confirmó que Express sirve Angular y se conecta a PostgreSQL 18.4. Las migraciones `010` y `015` quedaron verificadas también en la base local configurada.

## Decisión del Product Owner

Acepto HU-04 para el incremento local. Administración puede crear cuentas nominativas que funcionan con el rol asignado y dejan un alta auditable. El sistema protege la unicidad del nombre de usuario e impide que una sesión ajena a Administración cree cuentas. La revisión del PR y su integración en `main` quedaron fuera del alcance de esta verificación.
