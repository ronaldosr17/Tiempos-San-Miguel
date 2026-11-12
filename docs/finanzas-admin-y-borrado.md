# Finanzas del administrador y eliminación por punto

## Organización y funciones

Solo la vista de administrador se reorganiza en Resumen, Movimientos,
Operaciones de caja y Configuración y puntos. La vista del vendedor conserva
sus formularios y su caja; los controles no se duplican al cambiar de sesión.

- Filtro de punto y período: hoy, siete días, mes, todo o fechas personalizadas.
- Ventas, premios pagados, gastos y margen corresponden al período.
- La caja actual mantiene todo el historial del punto, aunque se elija otro
  período. No se reinicia ni se calcula usando solo los movimientos visibles.
- Tipo de movimiento filtra el listado y el CSV; las métricas del período
  mantienen sus categorías completas para comparar ventas/premios/gastos.
- Premios pendientes y saldos negativos se muestran como avisos. Un premio
  pendiente no se descuenta de caja hasta registrar su pago.
- Exportación CSV de los movimientos filtrados, con protección frente a fórmulas
  en textos introducidos por usuarios.
- Los pagos ahora leen el estado vigente del tiquete y guardan egreso y marca
  de pagado en la misma transacción, junto con la verificación de punto activo.

Los filtros trabajan sobre las suscripciones actuales de la aplicación. Cambiar
el período en pantalla no reduce por sí solo las lecturas del historial completo
de Firestore. Este cambio no implementa una migración a saldos agregados ni
paginación general de los movimientos; eso requiere una optimización separada
para conservar exactamente los balances.

## Retirar o borrar un punto

Configuración y puntos ofrece dos acciones para un único punto seleccionado:

1. **Retirar, conservar historial**: estado `archivado`. Conserva tiquetes,
   movimientos, cierres y balances; impide nuevas operaciones y asignaciones.
   Se puede reactivar más adelante.
2. **Eliminar punto y sus datos**: estado `eliminando` mientras se borran los
   documentos `owner == puntoId` de `tiquetes`, `movimientos` y `cierres`.
   Al verificar que no quedan registros, se marca `eliminado`. Cambia el saldo
   general al desaparecer los movimientos de ese punto. No se puede reactivar.

Ambas acciones muestran nombre y recuentos leídos desde servidor antes de aceptar
la confirmación exacta `Delete`; no se aceptan `delete`, espacios ni cadena vacía.
Si el recuento falla por permisos o conectividad, no se habilita la confirmación.
No se ejecuta ninguna acción destructiva al desplegar o iniciar sesión.

Las cuentas de Authentication y sus perfiles se conservan, pero la aplicación
cierra la sesión del vendedor de un punto inactivo y rechaza nuevas operaciones.
No se cambian otros puntos, resultados, bloqueos de números, horarios, límites
ni contadores globales. El catálogo conserva un marcador de punto eliminado
para impedir reutilizar su ID o que reaparezcan los puntos históricos por defecto.

Los nuevos registros de venta, movimientos y cierres consultan estado activo en
una transacción. Cada lote de borrado contiene hasta 400 documentos: vuelve a
leer el catálogo y los documentos en transacción, verifica el propietario vigente
y después los elimina. Una reasignación concurrente a otro owner detiene el lote.
El proceso consulta siempre por owner y nunca elimina una colección completa.

Si se interrumpe, los lotes anteriores permanecen eliminados y el punto queda
cerrado como `eliminando`. Un administrador puede volver a abrir la acción,
ver los recuentos restantes, escribir `Delete` y reanudar. El límite de esta sesión
es 1000 lotes por colección. No se afirma atomicidad de todo el borrado: la unidad
atómica es cada lote y la operación completa puede quedar parcial.

## Respaldo

La confirmación ofrece descargar un JSON paginado del punto y sus tres colecciones.
Es una descarga local, no una copia administrada de Firestore; no hay importación
ni restauración automática incluida. La exportación de un punto activo no es
una instantánea consistente entre colecciones. Para respaldar sin nuevas ventas,
retirar primero el punto, verificar sus permisos de bloqueo y después exportar.

Contar, respaldar y borrar consumen cuotas de Firestore. Borrar documentos no
restituye lecturas ya consumidas durante el día. No usar el borrado como remedio
para una advertencia de lecturas del plan Spark.

## Requisito antes de producción: reglas de Firestore

Este cambio se entrega en borrador hasta revisar las reglas reales, que no están
en el repositorio. No se ha leído ni escrito la base real durante el desarrollo.
Las comprobaciones del cliente no sustituyen la autorización del servidor.

Las reglas deben garantizar, también para clientes anteriores al despliegue:

- Solo administradores modifican catálogo, estados, roles y asignaciones.
- Solo administradores eliminan tiquetes, movimientos y cierres según las
  restricciones contables y de negocio elegidas.
- Vendedores solo leen su punto y no pueden cambiar el owner de documentos.
- Se rechazan creaciones/actualizaciones contables en puntos archivados,
  eliminando o eliminados. Los perfiles heredados mantienen la resolución
  libreria/supermercado; los nuevos resuelven puntoVentaId.
- La lectura del catálogo permite detectar puntos inactivos sin conceder su escritura.

Sin ese bloqueo de servidor, un cliente antiguo o una solicitud construida por
fuera de la interfaz podría crear documentos durante o después del borrado. La
verificación final de recuentos no evita futuras escrituras; por eso no basta para
habilitar producción sin revisar reglas. Las identidades de servidor con Admin
SDK/IAM omiten reglas: cualquier otro escritor externo también debe respetar estados.
El importador actual solo actualiza tiquetes existentes; no crea tiquetes o caja.

## Validación

- `node tests/finanzas_admin.browser.cjs`: 34 comprobaciones aisladas. Fechas,
  balance acumulado, margen, CSV, roles, confirmación exacta, permisos fallidos,
  respaldo de más de 400 documentos, borrado parcial y reanudación, propiedad
  concurrente, otro negocio intacto y marcadores de puntos heredados.
- `node tests/puntos_venta.browser.cjs`: 28 comprobaciones de regresión.
- `node tests/number_blocks.browser.cjs`: 20 comprobaciones de regresión.

Requieren Playwright y Chromium en /usr/bin/chromium. Todas simulan Firebase.
La aceptación real debe hacerse primero con un punto de prueba, después de
verificar reglas; nunca con las cajas reales para demostrar el borrado.
