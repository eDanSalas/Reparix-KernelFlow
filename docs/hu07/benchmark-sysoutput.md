# HU-07 · Confirmar entrega física

Clock Cycle 2 · Benchmark & SysOutput · 26 de noviembre de 2026

## Criterios de aceptación

| Criterio | Resultado observado | Prueba |
| --- | --- | --- |
| Confirmar la salida de una orden lista y registrar sus datos | El técnico asignado marcó **Listo para recoger** desde Angular. Recepción confirmó la entrega y Express respondió HTTP 201. PostgreSQL guardó receptor, evidencia, fecha, hora y responsable, agregó un movimiento al historial y cambió la orden a **Entregado**. Los datos siguieron visibles en Angular después de recargar. | HU07-E2E, HU07-01, HU07-05 y HU07-06 |
| Bloquear la salida en diagnóstico o reparación | Angular ocultó el formulario en ambos estados y la API devolvió HTTP 409 al intentar confirmar la entrega. También se verificó el rechazo de un técnico que intentó entregar una orden lista. | HU07-E2E y HU07-01 a HU07-03 |
| Evitar duplicados al reintentar | La primera confirmación llegó a Express y se guardó, pero la prueba descartó la respuesta antes de que llegara a Angular. El botón de reintento envió la misma clave y los mismos datos. Express devolvió HTTP 200 con la misma entrega. PostgreSQL conservó una sola entrega y un solo movimiento. | HU07-E2E y HU07-04 |

El técnico asignado o Administración puede marcar terminada la reparación. Recepción o Administración confirma la entrega física cuando la orden ya está lista. El backend valida la versión de la orden y registra cada cambio con su autor y fecha.

## Evidencia

- [Confirmación en móvil a 390 px](01-confirmacion-movil.png)
- [Reintento en móvil tras perder la primera respuesta](02-reintento-movil.png)
- [Datos de entrega recuperados en escritorio a 1440 px](03-entrega-guardada-escritorio.png)
- [Movimiento de la entrega en el historial](04-movimiento-en-historial.png)
- [Respuestas HTTP, migraciones y registros de PostgreSQL](resultado.json)

## Reproducción

Sigue la [instalación local](../../README.md#inicio-local) y ejecuta desde la raíz con PostgreSQL y Edge disponibles.

```powershell
npm run db:migrate
npm run build
npm test
npm run test:integration
npm run test:hu07:browser
npm run test:hu06:browser
npm run test:hu05:browser
npm run test:hu04:browser
npm run test:hu02:browser
```

El recorrido usa una orden sintética en una base temporal. La migración `012` protege la entrega única y guarda el movimiento junto al cambio de estado. La `017` permite marcar una reparación terminada con la versión vigente y un registro de quién lo hizo.

Angular compiló sin errores ni advertencias. Pasaron 29 pruebas unitarias, 133 de integración y los cinco recorridos en Edge. Las migraciones `012` y `017` quedaron aplicadas en la base local configurada. La prueba de arranque del paquete confirmó que Express sirve Angular y se conecta a PostgreSQL 18.4.

## Decisión del Product Owner

Acepto HU-07 para el incremento local. El taller puede distinguir un equipo listo para recoger de uno entregado físicamente. Recepción puede acreditar la salida con receptor, evidencia, responsable y fecha, y un reintento recupera el mismo registro. La revisión del PR y su integración en `main` quedaron fuera del alcance de esta verificación.
