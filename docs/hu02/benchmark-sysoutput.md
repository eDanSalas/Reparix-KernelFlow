# HU-02 · Registrar rechazo del presupuesto

Clock Cycle 2 · Benchmark & SysOutput · 26 de noviembre de 2026

## Criterios verificados

| Criterio | Resultado observado | Prueba |
| --- | --- | --- |
| Registrar orden, revisión vigente, canal, evidencia, fecha y usuario | Recepción comunicó la revisión 2 de la orden sintética `RPX-000000000001` y registró su rechazo desde Angular. Express devolvió HTTP 201 y PostgreSQL conservó la decisión vinculada al historial. Las solicitudes incompletas o sin permiso conservaron la orden y el historial. | HU02-E2E y HU02-01 a HU02-04 |
| Bloquear el paso a En reparación con un rechazo vigente | La pantalla del administrador mostró el motivo del bloqueo y omitió la transición. El intento por API devolvió HTTP 409 y PostgreSQL rechazó la actualización directa con SQLSTATE `23514`. | HU02-E2E, HU02-01 y HU03-03 |
| Conservar la custodia y el historial | La orden quedó en **Pendiente de autorización**, con la misma versión y estado de custodia. El historial mostró el rechazo después de recargar y lo conservó al emitir una revisión nueva. En el árbol de trabajo de Clock Cycle 2 también se verificó que la tabla de entregas quedó sin registros para la orden de prueba. | HU02-E2E y HU02-01, HU02-05, HU02-06 |

## Evidencia de la rama del PR

Angular compiló en modo producción sin errores ni advertencias de compilación. Pasaron 29 pruebas unitarias, 103 de integración con PostgreSQL 18.4 y el recorrido de navegador. En el árbol de trabajo de Clock Cycle 2 pasaron 123 pruebas de integración. La prueba de arranque del paquete confirmó el acceso a PostgreSQL y la carga de Angular desde Express con las dependencias de producción.

- [Captura del rechazo en móvil a 390 px](01-captura-movil.png)
- [Historial en Angular después de recargar](02-historial-movil.png)
- [Bloqueo de reparación como administrador a 1440 px](03-reparacion-bloqueada.png)
- [Resultado HTTP y fila consultada en PostgreSQL](resultado.json)

## Reproducción

Aplica la [instalación local](../../README.md#inicio-local) y ejecuta los comandos desde la raíz con PostgreSQL y Microsoft Edge disponibles.

```powershell
npm run db:migrate
npm run build
npm test
npm run test:integration
npm run test:hu02:browser
```

La migración `008` vincula el canal con el evento de rechazo. La prueba M06 aplica las migraciones sobre una base en versión `007` con una decisión histórica y repite la ejecución sin modificar los datos existentes. La migración `014` exige autorización vigente al entrar a **En reparación** incluso mediante una actualización directa de PostgreSQL.

## Decisión del Product Owner

Acepto el comportamiento de HU-02 en el entorno local de pruebas. Recepción puede registrar el rechazo del presupuesto comunicado, el taller queda impedido de iniciar la reparación mientras el rechazo esté vigente y el equipo permanece bajo custodia con la decisión disponible en el historial. El cierre del incremento queda pendiente de la validación formal del Root Dispatcher en Benchmark & SysOutput, la aprobación de otro desarrollador y la integración del PR en `main`.
