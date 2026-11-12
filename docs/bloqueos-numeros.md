# Bloqueos temporales de números

En Reportes, el administrador puede indicar un número de 00 a 99 y una fecha y
hora de vencimiento en Costa Rica, o desbloquear antes de que venza. Se elige Tica, Nica o La Primera: un bloqueo aplica a todos los horarios de
esa familia y a ambos negocios. El mismo número puede tener vencimientos distintos
por familia. Volver a bloquear el mismo número y familia cambia su vencimiento. No modifica tiquetes vendidos anteriormente.

En Ventas hay un panel independiente a la izquierda que agrupa los números
activos por Tica, Nica y La Primera, sin fechas ni duración. En móvil se ubica
antes del formulario.
El vencimiento se evalúa cada segundo en las sesiones abiertas; no requiere
cron-job.org. Los controles del administrador están ocultos para vendedores.
Esto oculta el vencimiento en la interfaz; el dato se descarga para evaluar
la expiración en el navegador y no es un secreto inaccesible desde herramientas
de desarrollo.

Los bloqueos viven en `configuracion/bloqueos_numeros`, con formato:

```json
{"tipo":"bloqueos_numeros","numeros":{"tica_05":{"hasta":"2026-12-01T18:00:00.000Z"}}}
```

La app espera una lectura confirmada por Firestore antes de permitir nuevas
apuestas. La selección aleatoria evita números bloqueados. Confirmar una venta
vuelve a leer ese documento dentro de la misma transacción que guarda tiquete e
ingreso; si el bloqueo cambia concurrentemente, Firestore reintenta la operación.
Si falla la conexión o faltan permisos, la venta no se guarda. Las fechas usan
UTC−6 explícitamente, independientemente de la zona horaria del dispositivo.

## Permisos y validación en producción

Las reglas del Firebase real no están en el repositorio. Deben permitir:

- Lectura del documento a los vendedores autenticados y al administrador.
- Escritura de ese documento solo a administradores.
- Lectura de ese documento y escritura de tiquete e ingreso en la transacción
  de venta con los permisos de negocio existentes.

La aplicación verifica roles y bloqueos, pero esas comprobaciones del cliente
no sustituyen reglas del servidor. Revisar las reglas actuales antes de afirmar
que se impide una operación construida fuera de esta interfaz; no se han cambiado
ni verificado reglas reales como parte de esta modificación.

Prueba de aceptación: abrir admin y vendedor en sesiones distintas, bloquear
05 por unos minutos, verificar que aparece sin vencimiento en Ventas y que no
puede agregarse ni venderse desde un borrador anterior. Probar expiración y
Desbloquear. Verificar que un vendedor no puede escribir el documento de bloqueos.

## Prueba local aislada

`tests/number_blocks.browser.cjs` requiere Playwright y Chromium instalado
(`/usr/bin/chromium`). Ejecutar `node tests/number_blocks.browser.cjs` desde un
entorno con esas dependencias. Simula Firebase y no accede a la base real.
Comprueba 20 casos: roles, fecha Costa Rica, visualización, bloqueo del borrador,
validación remota en transacción, caducidad, desconexión y venta válida atómica.

## Compatibilidad y horario de La Primera

Los documentos anteriores con claves `05` se interpretan como bloqueos de las
tres familias para conservar su alcance hasta vencer. Al guardar o desbloquear,
la transacción usa claves `tica_05`, `nica_05` y `primera_05`. El administrador
puede quitar cada familia por separado. Refrescar las sesiones abiertas después
del despliegue; el cliente anterior no reconoce las nuevas claves.

La Primera (6:00 PM) conserva su nombre e identificadores para el historial,
los tiquetes y el origen de scraping, pero cierra ventas a las 17:00 Costa Rica.
El importador permite ese resultado a partir de las 17:02 cuando esté publicado.
