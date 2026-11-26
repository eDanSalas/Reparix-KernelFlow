# HU-05 · Gestionar roles y permisos

Clock Cycle 2 · Benchmark & SysOutput · 26 de noviembre de 2026

## Criterios de aceptación

| Criterio | Resultado observado | Prueba |
| --- | --- | --- |
| Solo administración modifica roles y el cambio queda en el historial | Una cuenta administrativa cambió una cuenta de Recepción a Técnico en Angular. Express devolvió HTTP 201. PostgreSQL guardó el nuevo rol y un único evento con cuenta, rol anterior, rol nuevo, autor y fecha. El evento se mostró en Angular después de recargar. La escritura del rol se revirtió cuando se provocó un fallo en el historial. | HU05-E2E, HU05-01 y HU05-06 |
| Impedir el escalamiento sin autorización | La API devolvió HTTP 403 al intentar elevar los permisos propios o los de otra cuenta sin autorización. El rol y el historial se conservaron. El backend rechazó con HTTP 422 un rol inválido y un autor enviado en la solicitud. | HU05-E2E, HU05-02, HU05-03 y HU05-06 |
| Bloquear operaciones incompatibles con el rol en la API | La misma sesión pasó de HTTP 200 a HTTP 403 en el catálogo reservado a Recepción y Administración al recibir el rol Técnico. La API protegió el directorio y el historial administrativo. En Angular, la cuenta apareció como técnica disponible al volver a la asignación de la orden. | HU05-E2E, HU05-04 y HU05-05 |

Los permisos se aplican mediante los perfiles existentes de Recepción, Técnico y Administrador. El directorio entrega la identidad de la cuenta, su rol y si está activa. Las sesiones consultan el rol vigente en cada solicitud.

## Evidencia

- [Formulario en móvil a 390 px](01-cambio-movil.png)
- [Historial recargado en escritorio a 1440 px](02-historial-escritorio.png)
- [Respuestas HTTP y fila consultada en PostgreSQL](resultado.json)

## Verificación reproducible

Sigue la [instalación local](../../README.md#inicio-local) y ejecuta desde la raíz con PostgreSQL y Edge disponibles.

```powershell
npm run db:migrate
npm run build
npm test
npm run test:integration
npm run test:hu05:browser
npm run test:hu02:browser
```

La prueba de HU-05 usa cuentas y una orden sintéticas. PostgreSQL 18.4 aplicó la migración `009-internal-user-role-changes` en las bases temporales. Angular compiló sin errores ni advertencias. Pasaron 29 pruebas unitarias, 125 de integración y los recorridos en Edge de HU-05 y HU-02. La prueba de arranque del paquete confirmó que Express sirvió Angular y se conectó a PostgreSQL con las dependencias de producción.

## Decisión del Product Owner

Acepto HU-05 para el incremento en el entorno local de pruebas. Administración puede asignar roles con un historial comprobable y los permisos de las cuentas se ajustan desde la siguiente solicitud, incluso con sesiones abiertas. Los intentos de autoescalamiento y de acceso fuera del rol fueron rechazados directamente por la API. La revisión del PR y su integración en la rama principal están fuera del alcance de esta verificación.
