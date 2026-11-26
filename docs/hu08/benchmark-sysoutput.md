# HU-08 · Registrar cancelación

Clock Cycle 2 · Benchmark & SysOutput · 26 de noviembre de 2026

## Criterios de aceptación

| Criterio | Resultado observado | Prueba |
| --- | --- | --- |
| Exigir motivo y auditar el cambio de estado | Recepción canceló una orden **En diagnóstico** desde Angular. Express devolvió HTTP 201. PostgreSQL agregó un movimiento de **En diagnóstico** a **Cancelado** con motivo, responsable y fecha y hora. El historial siguió visible tras recargar. El intento sin motivo devolvió HTTP 422. | HU08-E2E, HU08-01 y HU08-02 |
| Conservar la custodia del equipo | Angular mostró que el equipo seguía bajo custodia del taller. La consulta de PostgreSQL confirmó cero entregas físicas y conservó la orden, sus asignaciones y sus revisiones de diagnóstico. La API bloqueó el avance operativo, los cambios de presupuesto y la confirmación de entrega en la orden cancelada. | HU08-E2E y HU08-01 |
| Rechazar intentos incompatibles | Un técnico recibió HTTP 403 y una cancelación en **En reparación**, con versión obsoleta o repetida recibió HTTP 409. Los intentos denegados conservaron la orden y su historial. Si falla la escritura del historial, la transición se revierte. | HU08-E2E y HU08-03 a HU08-06 |

La acción de cancelación está disponible para Recepción y Administración mientras la orden está **En diagnóstico**. La migración `013` valida el rol, el estado y la versión de la orden al registrar el movimiento.

## Evidencia

- [Confirmación con motivo en móvil a 390 px](01-confirmacion-movil.png)
- [Custodia e historial en escritorio a 1440 px](02-custodia-e-historial-escritorio.png)
- [Respuestas HTTP, migración y resultado en PostgreSQL](resultado.json)

## Reproducción

Sigue la [instalación local](../../README.md#inicio-local) y ejecuta desde la raíz con PostgreSQL y Edge disponibles.

```powershell
npm run db:migrate
npm run build
npm test
npm run test:integration
npm run test:hu08:browser
npm run test:hu07:browser
npm run test:hu06:browser
npm run test:hu05:browser
npm run test:hu04:browser
npm run test:hu02:browser
```

El recorrido usa órdenes y cuentas sintéticas en una base temporal de PostgreSQL. Angular compiló sin errores ni advertencias. Pasaron 29 pruebas unitarias, 135 de integración y los seis recorridos en Edge. La migración `013` quedó confirmada en la base local configurada. La prueba de arranque del paquete confirmó que Express sirve Angular y se conecta a PostgreSQL 18.4.

## Decisión del Product Owner

Acepto HU-08 para el incremento local. Recepción puede cerrar administrativamente una orden habilitada con un motivo verificable, y el taller conserva la custodia del equipo y la autoría del cambio. La API rechaza los intentos fuera del rol o estado permitido y conserva los datos de la orden. La revisión del PR y su integración en `main` quedaron fuera del alcance de esta verificación.
