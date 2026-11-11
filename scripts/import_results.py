"""Importa resultados públicos. Sin --apply solo lee y valida; nunca escribe."""
import argparse
from datetime import datetime
import json
import os
from pathlib import Path
import re
import sys
from urllib.request import Request, urlopen
from zoneinfo import ZoneInfo

from bs4 import BeautifulSoup

SOURCE = 'https://loteriascostarica.com/'
TZ = ZoneInfo('America/Costa_Rica')
# Nombres exactos del origen y del catálogo actual de la aplicación.
DRAWS = {
    'TICA DIA REVENTADOS': ('Tica Día (12:55 PM)', 12, 55, True, False),
    'TICA REVENTADOS 4:30': ('Tica Tarde (4:30 PM)', 16, 30, True, False),
    'TICA NOCHE REVENTADOS': ('Tica Noche (7:30 PM)', 19, 30, True, False),
    'NICA 11 AM': ('Nica Mañana (11:00 AM)', 11, 0, False, False),
    'NICA 3 PM': ('Nica Tarde (3:00 PM)', 15, 0, False, False),
    'NICA 6 PM': ('Nica Vespertina (6:00 PM)', 18, 0, False, True),
    'NICA 9 PM': ('Nica Noche (9:00 PM)', 21, 0, False, False),
    'LA PRIMERA 10 AM': ('La Primera (10:00 AM)', 10, 0, False, False),
    'LA PRIMERA 6 PM': ('La Primera (6:00 PM)', 18, 0, False, False),
}


def normalize(value):
    return ' '.join(value.split()).upper()


def parse_results(html, now):
    """No usa las horas ambiguas del sitio; usa cierre y zona horaria del catálogo."""
    soup = BeautifulSoup(html, 'html.parser')
    cards = soup.select('.result-card')
    if not cards:
        # Una página de resultados reconocible puede estar vacía al iniciar el día.
        # No confundirla con páginas de bloqueo, acceso o una estructura desconocida.
        heading = soup.select_one('.results-filter h1')
        date_input = soup.select_one('.results-filter input#datepicker[type="date"]')
        if (heading and normalize(heading.get_text()) == 'RESULTADOS DE LOTERIAS'
                and date_input and date_input.get('value') == now.date().isoformat()):
            return [], ['Página válida de hoy, todavía sin resultados publicados']
        raise ValueError('No se encontraron tarjetas ni una página vacía válida; revisar respuesta del sitio.')
    results, notes, seen = [], [], set()
    for card in cards:
        title = card.select_one('.card-header span')
        source_name = normalize(title.get_text(' ', strip=True)) if title else ''
        if source_name not in DRAWS:
            continue
        draw, hour, minute, reventado, weekend = DRAWS[source_name]
        footer = card.select_one('.card-footer')
        dates = re.findall(r'\b\d{4}-\d{2}-\d{2}\b', footer.get_text() if footer else '')
        if len(dates) != 1:
            raise ValueError(f'Fecha ausente o ambigua: {source_name}')
        date = dates[0]
        if date != now.date().isoformat():
            notes.append(f'{source_name}: fecha distinta de hoy; omitido')
            continue
        if weekend and now.weekday() < 5:
            notes.append(f'{source_name}: solo fines de semana según catálogo; omitido')
            continue
        # Margen de dos minutos: nunca importar antes del cierre de ventas.
        if now.hour * 60 + now.minute < hour * 60 + minute + 2:
            notes.append(f'{source_name}: todavía no pasó el cierre; omitido')
            continue
        if source_name in seen:
            raise ValueError(f'Tarjeta duplicada: {source_name}')
        seen.add(source_name)
        values = [normalize(b.get_text()) for b in card.select('.card-body button')]
        expected = 2 if reventado else 1
        if len(values) != expected or not re.fullmatch(r'\d{2}', values[0]):
            raise ValueError(f'Número o estructura no válidos: {source_name}')
        if reventado and values[1] not in ('BB', 'BR'):
            raise ValueError(f'Falta BB/BR válido: {source_name}')
        results.append({
            'draw': draw, 'crDate': date, 'numero': values[0],
            'numeroReventadoType': values[1].lower() if reventado else 'N/A',
        })
    found = {normalize(t.get_text()) for t in soup.select('.result-card .card-header span')}
    for name in DRAWS.keys() - found:
        notes.append(f'{name}: no publicado; no se inventa resultado')
    return results, notes


def result_id(result):
    return result['crDate'] + '_' + re.sub(r'\s+', '', result['draw'])


def prize(ticket, result):
    total = 0
    for line in ticket['lines']:
        if not re.fullmatch(r'\d{2}', line['num']):
            raise ValueError('Tiquete con número inválido; requiere revisión manual')
        amount, rev = line['amt'], line['rev']
        if any(isinstance(v, bool) or not isinstance(v, (int, float)) or v < 0 or v % 50 for v in (amount, rev)) or amount < 50 or rev > amount:
            raise ValueError('Tiquete con montos inválidos; requiere revisión manual')
        if line['num'] == result['numero']:
            total += amount * 85
            if result['numeroReventadoType'] == 'br':
                total += rev * 200
    return total


def existing_status(existing, result):
    if existing is None:
        return 'nuevo'
    if any(existing.get(k) != v for k, v in result.items()):
        raise ValueError(f'Conflicto con resultado existente {result_id(result)}; revisar manualmente')
    return 'ya existe; sin cambios'


def import_one(db, result, apply):
    from google.cloud import firestore
    from google.cloud.firestore_v1.base_query import FieldFilter

    ref = db.collection('resultados').document(result_id(result))
    if not apply:
        snap = ref.get()
        return existing_status(snap.to_dict() if snap.exists else None, result)

    @firestore.transactional
    def save(transaction):
        snap = ref.get(transaction=transaction)
        status = existing_status(snap.to_dict() if snap.exists else None, result)
        if snap.exists:
            return status
        query = db.collection('tiquetes').where(filter=FieldFilter('draw', '==', result['draw'])).where(filter=FieldFilter('crDate', '==', result['crDate'])).limit(401)
        tickets = list(query.stream(transaction=transaction))
        if len(tickets) > 400:
            raise ValueError('Más de 400 tiquetes: requiere procesamiento manual; no se escribió nada')
        updates = []
        for ticket in tickets:
            data = ticket.to_dict()
            if data.get('paid') or data.get('status') != 'registrada':
                raise ValueError('Tiquete pagado o no registrado sin resultado: revisar manualmente')
            amount = prize(data, result)
            updates.append((ticket.reference, {'premio': amount, 'premiado': amount > 0}))
        # Resultado, cierre reconocido por la app y premios se confirman juntos.
        transaction.create(ref, {**result, 'origen': SOURCE, 'registradoPor': 'github-actions', 'importadoEn': firestore.SERVER_TIMESTAMP})
        closure = db.collection('configuracion').document('auto_' + result_id(result))
        transaction.set(closure, {
            'tipo': 'cierre_manual', 'estado': 'cerrado', 'draw': result['draw'],
            'crDate': result['crDate'], 'motivo': 'Resultado publicado e importado automáticamente',
            'cerradoPor': 'github-actions', 'cerradoAutomaticamente': True,
            'ts': firestore.SERVER_TIMESTAMP,
        })
        for ticket_ref, changes in updates:
            transaction.update(ticket_ref, changes)
        return f'importado; {len(updates)} tiquetes calculados'

    return save(db.transaction())


def scheduled_outside_window(now, event):
    return event == 'schedule' and not (10 <= now.hour < 22)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--apply', action='store_true')
    parser.add_argument('--html', type=Path, help='HTML local, solo para validación sin escrituras')
    args = parser.parse_args()
    if args.html and args.apply:
        parser.error('--html no puede combinarse con --apply')
    now = datetime.now(TZ)
    print('MODO:', 'APLICAR' if args.apply else 'SIMULACIÓN (sin escrituras)')
    print('Fecha/hora Costa Rica:', now.isoformat())
    if scheduled_outside_window(now, os.environ.get('GITHUB_EVENT_NAME')):
        print('OMITIDO: ejecución programada fuera de 10:00–22:00 Costa Rica; sin consultas ni escrituras.')
        return
    if args.html:
        html = args.html.read_text(encoding='utf-8')
    else:
        request = Request(SOURCE, headers={'User-Agent': 'TiemposSanMiguel-Results/1.0'})
        with urlopen(request, timeout=30) as response:
            if 'text/html' not in response.headers.get('Content-Type', ''):
                raise ValueError('Respuesta no es HTML')
            html = response.read(2_000_001)
            if len(html) > 2_000_000:
                raise ValueError('Respuesta demasiado grande')
    results, notes = parse_results(html, now)
    for note in notes:
        print('AVISO:', note)
    if not results:
        print('PENDIENTE: ningún resultado elegible de hoy; sin escrituras. Se revisará en la próxima ejecución.')
        return
    db = None
    if not args.html:
        from google.cloud import firestore
        project = os.environ.get('GCP_PROJECT_ID')
        if project != 'tiempos-san-miguel':
            raise ValueError('GCP_PROJECT_ID debe ser tiempos-san-miguel')
        db = firestore.Client(project=project)
    failed = False
    for result in results:
        try:
            status = import_one(db, result, args.apply) if db else 'extraído (sin conexión a Firebase)'
            print(json.dumps(result, ensure_ascii=False), status)
        except Exception as exc:
            failed = True
            print(f'ERROR {result_id(result)}: {exc}', file=sys.stderr)
    if failed:
        raise RuntimeError('Uno o más sorteos requieren revisión; consultar registro anterior')


if __name__ == '__main__':
    main()
