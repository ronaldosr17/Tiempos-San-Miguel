from datetime import datetime
from pathlib import Path
import sys
import unittest
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'scripts'))
from import_results import TZ, existing_status, parse_results, prize, result_id


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

    def test_no_import_before_close_and_margin(self):
        now = datetime(2026, 11, 10, 12, 56, tzinfo=TZ)
        self.assertEqual(parse_results(card(), now)[0], [])

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

    def run_import(self, db, apply=True):
        from unittest.mock import patch
        from import_results import import_one
        result = parse_results(card(), ResultsTests.now)[0][0]
        with patch('google.cloud.firestore.transactional', lambda f: f):
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

    def test_creates_result_closure_and_award_in_same_transaction(self):
        from unittest.mock import MagicMock
        ticket = MagicMock()
        ticket.to_dict.return_value = {'paid': False, 'status': 'registrada', 'lines': [{'num': '05', 'amt': 100, 'rev': 50}]}
        db = self.fake_db(tickets=[ticket])
        self.run_import(db)
        tx = db.transaction.return_value
        self.assertEqual(tx.create.call_count, 1)
        self.assertEqual(tx.set.call_count, 1)
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
