# Resultados automáticos

GitHub Actions consulta https://loteriascostarica.com/ cada diez minutos entre
10:07 y 21:57 de Costa Rica. Las ejecuciones pueden retrasarse por disponibilidad
de GitHub. El sitio de origen no es una fuente oficial y puede cambiar o corregir
resultados; los conflictos se reportan y requieren revisión humana.

## Configuración sin claves privadas

Variables del repositorio (Settings → Secrets and variables → Actions → Variables):

- `GCP_PROJECT_ID`: `tiempos-san-miguel`
- `GCP_SERVICE_ACCOUNT`: `github-resultados@tiempos-san-miguel.iam.gserviceaccount.com`
- `GCP_WORKLOAD_IDENTITY_PROVIDER`: `projects/774681656050/locations/global/workloadIdentityPools/github-actions/providers/github`
- `RESULTS_AUTOMATION_ENABLED`: crear con valor `true` solo después de verificar una ejecución de prueba. Ausente o `false` desactiva la ejecución programada.

El proveedor OIDC debe restringirse al repositorio `ronaldosr17/Tiempos-San-Miguel`
y a `refs/heads/main`. La cuenta de servicio requiere `roles/datastore.user` y
el principal del repositorio debe poder asumirla con `roles/iam.workloadIdentityUser`.
No generar ni subir claves JSON. Si Google solicita habilitar las APIs de Security
Token Service, IAM Service Account Credentials o Firestore, habilitarlas en el
proyecto indicado. No se necesita cambiar del plan Spark para este proceso externo;
las lecturas y escrituras siguen sujetas a las cuotas de Firestore.

## Primera prueba

1. Actions → Resultados automáticos → Run workflow, rama `main`.
2. Dejar **Guardar resultados y premios...** desmarcado y ejecutar.
3. Revisar autenticación, resultados extraídos y estado existente en Firestore.
   Esta modalidad no calcula premios ni consulta tiquetes: solo extrae y compara
   resultados. Una prueba verde no valida todavía los permisos de escritura.
4. Ejecutar con la casilla marcada para importar resultados nuevos del día.
5. Comprobar resultados y premios en la aplicación; después activar
   `RESULTS_AUTOMATION_ENABLED=true`.

Para pausar: cambiar esa variable a `false`. También se puede deshabilitar el
workflow desde Actions. El ingreso manual de resultados permanece disponible.

## Comportamiento y límites

- Solo importa la fecha actual en Costa Rica después del cierre + dos minutos.
- Coincidencia exacta de nombres normalizando espacios; excluye Tripleta y Monazo.
- Conserva dos dígitos y exige BB/BR en Tica. Nica y La Primera usan `N/A`.
- Nica 6 PM solo fines de semana, como indica el catálogo de la aplicación.
- Nica 9 PM no apareció al inspeccionar el origen. Solo se importará si aparece
  una tarjeta exacta `NICA 9 PM`; mientras tanto debe ingresarse manualmente.
- No inventa resultados ausentes ni reemplaza resultados existentes. Los resultados
  existentes iguales se omiten; los distintos hacen fallar la ejecución y se reportan.
- Cada sorteo nuevo se confirma en una transacción: resultado + cierre que la app
  reconoce + premios de todos sus tiquetes. No crea movimientos ni paga premios.
- Hasta 400 tiquetes por sorteo. Un volumen mayor o tiquetes inválidos, pagados o
  sin estado `registrada` bloquean ese sorteo sin escrituras. Otros sorteos pueden
  haberse confirmado; el registro muestra cuáles. Revisar manualmente estos casos.
- No procesa días anteriores ni recalcula resultados ya existentes. No repara
  inconsistencias preexistentes de la aplicación. Las correcciones posteriores
  y tiquetes sincronizados tarde requieren revisión del administrador.
- Sin resultados válidos de hoy se informa un error; no se usan datos antiguos.

## Desarrollo local

```sh
python -m venv .venv
.venv/bin/pip install -r scripts/requirements.txt
.venv/bin/python -m unittest discover -s tests -v
# Extraer una captura HTML sin conectarse a Firebase:
.venv/bin/python scripts/import_results.py --html /ruta/captura.html
```

Para consultar Firebase localmente se requiere Application Default Credentials.
En GitHub las obtiene `google-github-actions/auth` con identidad temporal.
