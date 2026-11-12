# Cajas independientes por punto de venta

## Modelo y conservación de datos

El balance sigue siendo la suma de `movimientos.amount` agrupada por `owner`.
No se introduce un saldo alternativo, no se reinicia caja y no se reescriben
movimientos, tiquetes, premios, usuarios ni cierres históricos al desplegar.

- `owner: libreria` conserva la Librería actual y todos sus movimientos.
- `owner: supermercado` conserva el Supermercado actual y todos sus movimientos.
- Cada punto nuevo tiene un ID `pv_<uuid>`, independiente de nombre y tipo.
  Sin movimientos, su balance es cero.
- Cambiar nombre/tipo actualiza solo el catálogo. El ID y la caja se mantienen.
- Varios usuarios asignados intencionalmente al mismo punto comparten su caja.
  Dos librerías diferentes deben tener IDs diferentes.

No se requiere migración para las dos cuentas actuales: los perfiles con rol
`libreria` o `supermercado` conservan automáticamente su `owner` histórico.
El catálogo ofrece ambos por defecto, aunque el documento nuevo aún no exista.
El primer guardado manual crea/actualiza exclusivamente el catálogo.

Catálogo nuevo: `configuracion/puntos_venta`:

```json
{
  "tipo": "puntos_venta",
  "puntos": {
    "pv_ejemplo-123": {"nombre": "Librería Arenal", "tipo": "Librería"}
  }
}
```

Perfiles nuevos en `usuarios/<uid>`:

```json
{"name":"Vendedora","email":"vendedor@example.com","role":"vendedor","puntoVentaId":"pv_ejemplo-123"}
```

Administrador: `role: admin`, sin caja asignada. El tipo de negocio ya no se
usa como rol de permisos. No se ofrece reasignar usuarios existentes: una
reasignación podría afectar la visibilidad del historial y requiere tratarse
como un cambio separado.

## Uso

1. Usuarios → Puntos de venta → crear nombre y tipo de negocio libre.
2. Crear usuario con rol Vendedor y elegir ese punto.
3. Finanzas muestra las cajas de todos los puntos, incluyendo los nuevos en cero.
4. El filtro superior de Finanzas selecciona punto para balance, movimientos,
   retiros/abonos, resúmenes y cierres. Reportes también filtra por punto.
5. Un vendedor consulta solo tiquetes, movimientos y cierres cuyo `owner` sea
   su punto. Ventas y gastos escriben ese ID; los pagos mantienen el `owner`
   del tiquete y los cierres cuentan/bloquean únicamente su caja.

Los sorteos, límites y bloqueos continúan siendo configuración común. Los
consecutivos de tiquetes siguen siendo globales. El importador mantiene el
`owner` del tiquete y no necesita modificar su lógica de premios.

## Antes de publicar: reglas reales de Firestore

Las reglas de producción no están versionadas en este repositorio y no se
puede afirmar aislamiento de servidor a partir de comprobaciones del navegador.
Esta entrega se debe revisar junto con las reglas vigentes antes de publicarla.
En particular:

- Solo un administrador puede crear o cambiar roles, asignaciones y catálogo.
- Un perfil nuevo `vendedor` debe tener un punto válido y no poder cambiarlo
  ni convertirse en administrador mediante una escritura propia.
- Los propietarios de documentos siguen siendo `owner`, pero para nuevos
  vendedores se comparan con `usuarios/<uid>.puntoVentaId`, no con `role`.
- Conservar compatibilidad de las cuentas actuales, resolviendo los roles
  históricos `libreria` y `supermercado` a sus IDs homónimos.
- Permitir a usuarios autenticados leer el catálogo y proteger su escritura
  como configuración exclusiva de administrador.
- Proteger tanto consultas como lecturas por ID y escrituras de tiquetes,
  movimientos y cierres; no basta ocultar filtros o botones.
- Conservar las validaciones existentes de montos, pagos, límites y bloqueos.

No se incluye una sustitución completa de reglas sin conocer las actuales,
para no eliminar validaciones o permisos que ya están en uso.

## Verificación y puesta en marcha

1. Registrar los saldos actuales y hacer el respaldo habitual antes de desplegar.
2. Revisar y probar reglas para los perfiles antiguos y nuevos; no crear puntos
   o cuentas en producción como parte de las pruebas locales.
3. Publicar y refrescar las sesiones. Entrar con los usuarios actuales y comparar
   exactamente sus saldos e historial con los anteriores al despliegue.
4. Crear un punto nuevo y comprobar caja cero. Crear un vendedor para ese punto.
5. Con dos sesiones distintas, verificar que una venta, gasto, premio o cierre
   del punto nuevo no altere las dos cajas históricas ni sea visible al otro vendedor.
6. Desde una sesión no administradora comprobar que Firestore rechaza consultar
   otra caja, cambiar `puntoVentaId`, escribir catálogo o elevar su rol.

No se han leído ni escrito datos reales de Firebase para esta implementación.
No hay scripts de migración o borrado de datos.

## Pruebas locales

`node tests/puntos_venta.browser.cjs` requiere Playwright y Chromium en
`/usr/bin/chromium`. Ejecuta 28 comprobaciones con Firebase simulado: conserva
IDs y balances históricos, crea puntos de tipos repetidos y diferentes con saldo
cero, renombra sin mover historial, separa rol/asignación, filtra por punto,
valida propietarios de ventas, gastos, premios y cierres y verifica consultas
Firestore. No prueba las reglas de producción.

`node tests/number_blocks.browser.cjs` mantiene las 20 comprobaciones de
bloqueos por sorteo y cierre de La Primera. La sintaxis de los módulos también
se verifica con `node --check`.
