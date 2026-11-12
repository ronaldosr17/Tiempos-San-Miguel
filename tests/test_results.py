from datetime import datetime
from pathlib import Path
import sys
import unittest
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'scripts'))
from import_results import TZ, existing_status, parse_results, prize, result_id, should_close_early


def card(name='TICA DIA REVENTADOS', number='05', ball='BR', date='2026-11-10'):
    buttons = f'<button>{number}</button>' + (f'<button>{ball}</button>' if ball is not None else '')
    return f'<div class="result-card"><div class="card-header"><span>{name}</span></div><div class="card-body">{buttons}</div><div class="card-footer">{date} 12:54</div></div>'


class ResultsTests(unittest.TestCase):
    now = datetime(2026, 11, 10, 20, 0, tzinfo=TZ)

    def parse(self, html):
        return parse_results(html, self.now)[0]

    def test_preserves_leading_zero_and_ball(self):
        result = self.parse(card())[0]
        self.assertEqual((result['numero'], result['numeroReventadoType']), ('05', 'br'))
        self.assertEqual(result_id(result), '2026-11-10_TicaDía(12:55PM)')

    def test_old_date_not_imported(self):
        self.assertEqual(self.parse(card(date='2026-11-09')), [])

    def test_future_date_not_imported(self):
        self.assertEqual(self.parse(card(date='2026-11-11')), [])

    def test_published_result_can_be_detected_before_close(self):
        now = datetime(2026, 11, 10, 12, 54, tzinfo=TZ)
        self.assertEqual(parse_results(card(), now)[0][0]['numero'], '05')

    def test_missing_and_invalid_ball_rejected(self):
        for ball in (None, 'XX'):
            with self.assertRaises(ValueError):
                self.parse(card(ball=ball))

    def test_invalid_numbers_rejected(self):
        for number in ('', '5', '100', 'xx'):
            with self.assertRaises(ValueError):
                self.parse(card(number=number))

    def test_duplicate_rejected(self):
        with self.assertRaises(ValueError):
            self.parse(card() + card())

    def test_structure_change_rejected(self):
        with self.assertRaises(ValueError):
            self.parse('<html>Sin resultados</html>')

    def test_does_not_confuse_tripleta(self):
        self.assertEqual(self.parse(card(name='TRIPLETA NICA 11 AM', ball=None)), [])

    def test_primera_whitespace_and_no_reventado(self):
        result = self.parse(card(name='LA PRIMERA  6 PM', ball=None))[0]
        self.assertEqual(result['numeroReventadoType'], 'N/A')

    def test_nica_vespertina_weekend_only(self):
        self.assertEqual(self.parse(card(name='NICA 6 PM', ball=None)), [])
        saturday = datetime(2026, 11, 14, 20, 0, tzinfo=TZ)
        self.assertEqual(len(parse_results(card(name='NICA 6 PM', ball=None, date='2026-11-14'), saturday)[0]), 1)

    def test_premios(self):
        ticket = {'lines': [{'num': '05', 'amt': 100, 'rev': 50}, {'num': '06', 'amt': 1000, 'rev': 0}]}
        for ball, expected in [('br', 18500), ('bb', 8500), ('N/A', 8500)]:
            self.assertEqual(prize(ticket, {'numero': '05', 'numeroReventadoType': ball}), expected)

    def test_invalid_ticket_blocks_import(self):
        with self.assertRaises(ValueError):
            prize({'lines': [{'num': '05', 'amt': 100, 'rev': -50}]}, {'numero': '05', 'numeroReventadoType': 'br'})

    def test_existing_manual_result_not_overwritten(self):
        result = self.parse(card())[0]
        self.assertIn('sin cambios', existing_status({**result, 'otro': 'manual'}, result))
        with self.assertRaises(ValueError):
            existing_status({**result, 'numero': '99'}, result)
        self.assertEqual(existing_status(None, result), 'nuevo')


if __name__ == '__main__':
    unittest.main()


class TransactionTests(unittest.TestCase):
    def fake_db(self, result=None, tickets=()):
        from unittest.mock import MagicMock
        db = MagicMock()
        collection = db.collection.return_value
        ref = collection.document.return_value
        ref.get.return_value.exists = result is not None
        ref.get.return_value.to_dict.return_value = result
        collection.where.return_value.where.return_value.limit.return_value.stream.return_value = tickets
        return db

    def run_import(self, db, apply=True, now=None):
        from unittest.mock import patch
        from import_results import import_one
        result = parse_results(card(), ResultsTests.now)[0][0]
        with patch('google.cloud.firestore.transactional', lambda f: f), patch('import_results.datetime') as clock:
            clock.now.return_value = now or ResultsTests.now
            return import_one(db, result, apply)

    def test_dry_run_never_writes(self):
        db = self.fake_db()
        self.assertEqual(self.run_import(db, False), 'nuevo')
        db.transaction.assert_not_called()

    def test_existing_never_writes(self):
        result = parse_results(card(), ResultsTests.now)[0][0]
        db = self.fake_db(result)
        self.run_import(db)
        db.transaction.return_value.create.assert_not_called()
        db.transaction.return_value.update.assert_not_called()

    def test_after_close_creates_result_and_award_without_extra_closure(self):
        from unittest.mock import MagicMock
        ticket = MagicMock()
        ticket.to_dict.return_value = {'paid': False, 'status': 'registrada', 'lines': [{'num': '05', 'amt': 100, 'rev': 50}]}
        db = self.fake_db(tickets=[ticket])
        self.run_import(db)
        tx = db.transaction.return_value
        self.assertEqual(tx.create.call_count, 1)
        self.assertEqual(tx.set.call_count, 0)
        tx.update.assert_called_once_with(ticket.reference, {'premio': 18500, 'premiado': True})

    def test_paid_ticket_aborts_before_writes(self):
        from unittest.mock import MagicMock
        ticket = MagicMock()
        ticket.to_dict.return_value = {'paid': True}
        db = self.fake_db(tickets=[ticket])
        with self.assertRaises(ValueError):
            self.run_import(db)
        db.transaction.return_value.create.assert_not_called()

    def test_oversized_draw_aborts_before_writes(self):
        db = self.fake_db(tickets=[None] * 401)
        with self.assertRaises(ValueError):
            self.run_import(db)
        db.transaction.return_value.create.assert_not_called()


class PendingResultsTests(unittest.TestCase):
    def test_recognizable_empty_page_is_pending(self):
        html = '<div class="results-filter"><h1>Resultados de loterias</h1><input id="datepicker" type="date" value="2026-11-10"></div>'
        results, notes = parse_results(html, ResultsTests.now)
        self.assertEqual(results, [])
        self.assertIn('todavía sin resultados', notes[0])

    def test_empty_page_wrong_date_is_error(self):
        html = '<div class="results-filter"><h1>Resultados de loterias</h1><input id="datepicker" type="date" value="2026-11-09"></div>'
        with self.assertRaises(ValueError):
            parse_results(html, ResultsTests.now)

    def test_unknown_page_still_errors(self):
        for html in ('<h1>Access denied</h1>', '<input id="datepicker" type="date" value="2026-11-10">'):
            with self.assertRaises(ValueError):
                parse_results(html, ResultsTests.now)

    def test_schedule_window(self):
        from import_results import scheduled_outside_window
        for hour, expected in [(5, True), (9, True), (10, False), (21, False), (22, True)]:
            now = ResultsTests.now.replace(hour=hour)
            self.assertEqual(scheduled_outside_window(now, 'schedule'), expected)
            self.assertFalse(scheduled_outside_window(now, 'workflow_dispatch'))

    def test_scheduled_early_execution_does_not_fetch_or_connect(self):
        from unittest.mock import patch
        import import_results as module
        with patch.object(module.sys, 'argv', ['import_results.py', '--apply']), patch.object(module, 'datetime') as dt, patch.dict(module.os.environ, {'GITHUB_EVENT_NAME': 'schedule'}), patch.object(module, 'urlopen') as fetch, patch('google.cloud.firestore.Client') as client:
            dt.now.return_value = ResultsTests.now.replace(hour=5)
            module.main()
            fetch.assert_not_called()
            client.assert_not_called()

    def test_pending_results_do_not_connect_to_firebase(self):
        from unittest.mock import patch, MagicMock
        import import_results as module
        response = MagicMock()
        response.headers = {'Content-Type': 'text/html'}
        response.read.return_value = card(date='2026-11-09').encode()
        with patch.object(module.sys, 'argv', ['import_results.py', '--apply']), patch.dict(module.os.environ, {'GITHUB_EVENT_NAME': 'schedule'}), patch.object(module, 'datetime') as dt, patch.object(module, 'urlopen') as fetch, patch('google.cloud.firestore.Client') as client:
            dt.now.return_value = ResultsTests.now
            fetch.return_value.__enter__.return_value = response
            module.main()
            client.assert_not_called()


class EarlyClosureTests(unittest.TestCase):
    def test_tica_boundary(self):
        result = parse_results(card(), ResultsTests.now)[0][0]
        for h, m, expected in [(12, 54, True), (12, 55, False), (12, 56, False), (20, 0, False)]:
            with self.subTest(hour=h, minute=m):
                self.assertEqual(should_close_early(result, ResultsTests.now.replace(hour=h, minute=m)), expected)

    def test_other_dates_do_not_close_today(self):
        result = parse_results(card(), ResultsTests.now)[0][0]
        now = ResultsTests.now.replace(hour=8)
        for date in ['2026-11-09', '2026-11-11']:
            self.assertFalse(should_close_early({**result, 'crDate': date}, now))

    def test_primera_keeps_name_and_uses_17_hour_close(self):
        before = datetime(2026, 11, 10, 16, 59, tzinfo=TZ)
        result = parse_results(card(name='LA PRIMERA 6 PM', ball=None), before)[0][0]
        self.assertEqual(result['draw'], 'La Primera (6:00 PM)')
        self.assertTrue(should_close_early(result, before))
        self.assertFalse(should_close_early(result, before.replace(hour=17, minute=0)))

    def test_early_result_creates_closure_in_same_transaction(self):
        tests = TransactionTests()
        db = tests.fake_db()
        tests.run_import(db, now=ResultsTests.now.replace(hour=12, minute=54))
        tx = db.transaction.return_value
        self.assertEqual(tx.create.call_count, 1)
        self.assertEqual(tx.set.call_count, 1)
        self.assertTrue(tx.set.call_args.args[1]['cerradoAutomaticamente'])

    def test_at_exact_close_does_not_write_closure(self):
        tests = TransactionTests()
        db = tests.fake_db()
        tests.run_import(db, now=ResultsTests.now.replace(hour=12, minute=55))
        db.transaction.return_value.set.assert_not_called()
