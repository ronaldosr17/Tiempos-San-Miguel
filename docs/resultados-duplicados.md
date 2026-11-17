# Tarjetas duplicadas o incompletas en el origen

El 16/11/2026 loteriascostarica.com publicó dos tarjetas de TICA REVENTADOS 4:30:
una contenía solo 29 y otra 29 + BB. El importador original detenía toda la
extracción al encontrar la primera, por lo que nunca llegaba a la tarjeta completa
ni a los sorteos siguientes.

La extracción agrupa las tarjetas de cada sorteo de hoy antes de decidir:

- Si la tarjeta parcial y la completa coinciden en número, se usa una sola
  versión completa. La ausencia de bola nunca se interpreta como BB.
- Duplicados completos e idénticos también se procesan una sola vez.
- Si difieren números, bolas, hay datos inválidos o falta una versión completa,
  ese sorteo no se importa y se informa el error.
- Los demás sorteos válidos sí se procesan antes de finalizar con error si
  queda alguno que requiere revisión. No se ocultan los conflictos marcando
  la ejecución como correcta.
- Una página desconocida sigue deteniendo la ejecución sin escribir. No cambia
  la validación de fecha, tipos de sorteo, ni el cálculo de premios.

La comparación con Firebase y la protección de resultados existentes permanecen
iguales. No se sobrescriben resultados ni se repiten pagos. El script continúa
importando solo la fecha actual de Costa Rica: esta corrección no recupera días
anteriores automáticamente. Los resultados históricos faltantes se deben revisar
y registrar desde la administración; no basta reejecutar un workflow antiguo,
porque vuelve a consultar la fecha actual.

Pruebas: 41 casos Python, incluyendo una captura pública reducida del 16/11
(tests/fixtures/resultados_2026_11_16.html), ambos órdenes de duplicados, bolas y
números contradictorios, ceros iniciales, y procesamiento de sorteos sanos aunque
otro sea inválido. También se comprobó la página histórica completa: 8 resultados
válidos, con Tica Tarde 29/BB una sola vez. No se escribió en Firebase real.
