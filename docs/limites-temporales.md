# Límites temporales por familia

En Reportes, debajo de los bloqueos de números, el administrador puede configurar un límite para Tica, Nica o La Primera. Aplica a todos los números (00–99) y todos los horarios de esa familia. Cada familia conserva una configuración independiente; guardar nuevamente la misma familia reemplaza su configuración.

## Alcance

El límite es **por número y por tiquete**, igual que el alcance del límite general existente. No suma las apuestas de varios tiquetes o puntos de venta. Se suman las líneas repetidas del mismo número para evitar superar el máximo dividiendo líneas.

Se configura un máximo directo y, para Tica, otro máximo para reventado. El directo debe ser al menos ₡50; el reventado puede ser ₡0 (deshabilita temporalmente reventados). Los montos son múltiplos de ₡50. El límite general de directo + reventado sigue aplicándose: un límite temporal nunca permite excederlo. Por ejemplo, con general ₡20 000, directo temporal ₡5 000 y reventado temporal ₡1 000, cada número admite como máximo esos dos componentes, respetando también las demás reglas de venta.

La fecha y hora de vencimiento se interpreta en Costa Rica (UTC−6), independientemente de la zona horaria del dispositivo. Después del vencimiento deja de aplicar y desaparece el aviso sin necesidad de borrar documentos; vuelve a regir el límite general.

El motivo es obligatorio (hasta 200 caracteres). Los vendedores ven familia, montos y motivo debajo de los números bloqueados, sin controles administrativos ni vencimiento. El administrador ve el vencimiento y puede quitar un límite antes de tiempo.

## Persistencia y validación

Se almacena el mapa `limitesTemporales` dentro del documento existente `configuracion/bloqueos_numeros`. Reutiliza su suscripción y la lectura transaccional al vender; no agrega suscripciones ni consultas periódicas. Las operaciones de bloqueos preservan los límites y viceversa. No cambia saldos, tiquetes anteriores ni resultados.

La aplicación valida al agregar líneas, confirmar y dentro de la transacción que registra tiquete e ingreso. Si otro administrador cambia la configuración durante la venta, la lectura transaccional vuelve a comprobarla. La configuración que solo proviene de caché o no se puede interpretar impide nuevas apuestas hasta verificarla.

Los controles de rol son de la aplicación y se reutilizan los permisos actuales de Firestore. Este cambio no modifica ni verifica las reglas de producción. La protección frente a clientes modificados requiere reglas de servidor adecuadas, como el resto de las restricciones de venta.

## Pruebas

`node tests/limites_temporales.browser.cjs` ejecuta pruebas con datos simulados: familias, montos, vencimiento, motivos, líneas repetidas, venta transaccional, cambios remotos, caché y preservación de bloqueos. No utiliza Firebase de producción.
