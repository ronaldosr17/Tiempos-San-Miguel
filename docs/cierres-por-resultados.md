# Cierres por publicación de resultados

El horario normal sigue cerrando las ventas sin escribir un cierre en Firestore.
Publicar o importar el resultado a la hora de cierre o después guarda resultado y
premios, sin generar un cierre adicional en configuración.

Si se detecta un resultado válido de hoy antes de la hora, se registra un cierre
anticipado `auto_<resultadoId>` para compatibilidad con los clientes actuales.
Además, la aplicación no permite vender un sorteo con un resultado publicado para
hoy, incluso si el snapshot del cierre todavía no llegó. La hora usa Costa Rica;
La Primera (6:00 PM) conserva el nombre, pero compara contra las 17:00.

El importador ya no espera el cierre más dos minutos: valida nombre, fecha,
número y BB/BR, y puede detectar publicaciones anticipadas. La detección sigue
sujeta a la frecuencia de cron-job.org y la disponibilidad del origen; no se
promete detectar una publicación en el instante en que aparece.

Los cierres automáticos de resultados dejan de mostrarse y de actuar como cierres
adicionales al llegar el horario. Los marcadores antiguos permanecen almacenados:
no hay limpieza ni borrado automático de datos históricos. Los cierres manuales
reales mantienen su comportamiento y la opción Reabrir.

Un cierre anticipado por resultado no ofrece Reabrir: mientras el resultado siga
publicado no deben aceptarse apuestas. Para corregir un resultado se usa su
operación de eliminación, que también retira únicamente su marcador automático,
si el documento existe y está identificado como automático. No borra cierres
manuales de la administración.

Validación local: 30 pruebas Python (incluyen transacciones con y sin cierre y
límites de hora) y 16 comprobaciones en navegador sobre resultados manuales,
estados de venta, cierres antiguos y eliminación del marcador propio. Se conservan
las 20 regresiones de bloqueos. Firebase se simula; no se ejecutaron cambios en
la base de producción durante el desarrollo.
