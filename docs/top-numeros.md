# Top Números (administrador)

La pestaña utiliza los tiquetes y resultados que la sesión ya carga. No agrega consultas a Firestore al abrirla ni al cambiar filtros. No modifica saldos, apuestas ni resultados.

- **Más salen:** cuenta resultados registrados, una vez por sorteo y fecha. Los duplicados equivalentes se unifican; los resultados contradictorios se excluyen y se avisa.
- **Más jugados:** cuenta tiquetes distintos que contienen el número. Varias líneas del mismo número en un tiquete cuentan una vez.
- **Más apostados:** suma directo y reventado de las líneas válidas y muestra su porcentaje del monto filtrado.
- **Riesgo de hoy:** agrupa las apuestas de hoy sin resultado registrado por número y sorteo. Muestra el premio máximo posible (directo ×85 y, en Tica, reventado ×200). Excluye tiquetes pagados. No es una deuda confirmada ni se resta del balance. Este cuadro siempre corresponde a hoy, aunque se consulte otro período histórico.

Se puede filtrar por fechas, familia (todos los horarios de Tica, Nica o La Primera), punto de venta y cantidad de filas. El punto filtra apuestas; los resultados de lotería son generales. Se excluyen tiquetes anulados/cancelados/eliminados y datos inválidos. Los números conservan el cero inicial.

La información representa el historial disponible en la base del sistema, no todo el historial de las loterías. Los datos en caché y los errores de carga se indican. La frecuencia histórica no predice próximos resultados.

**Preparar bloqueo** abre Reportes con número y familia seleccionados. El administrador debe elegir el vencimiento y guardar; no se bloquea automáticamente. Para los rankings agregados se debe seleccionar antes una familia.

La navegación y los métodos de estadísticas están restringidos al rol administrador. Se reutilizan los permisos y suscripciones existentes; este cambio no modifica las reglas de Firestore.

Validación: `node tests/top_numeros.browser.cjs` usa datos simulados y verifica agregaciones, filtros, permisos de interfaz, preparación de bloqueo y ausencia de consultas adicionales. No requiere credenciales de producción.
