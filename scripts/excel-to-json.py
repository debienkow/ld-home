#!/usr/bin/env python3
"""Excel (Finanzenrechner) -> import-finanzen.json fuer den App-Import.
Aufruf: python3 scripts/excel-to-json.py <xlsx> <out.json>"""
import json, re, sys, datetime, warnings
import openpyxl

warnings.filterwarnings('ignore')
src, out = sys.argv[1], sys.argv[2]
wf = openpyxl.load_workbook(src, data_only=True)

SETTLE = re.compile(r'haushaltsausgleich|ausgleichszahlung|tilgung schulden|restschulden', re.I)
NOSPLIT = re.compile(r'\*\s?2|2\s?\*|\(x2\)|doppelt f|2x f.r preis|frS|R.ckerstattung Amazon R.cklichter', re.I)
CAT = {'Supermarkt': 'supermarkt', 'Drogerie': 'drogerie', 'Essen (extern)': 'essen', 'Event': 'event',
       'Gaming': 'gaming', 'Kleidung': 'kleidung', 'Urlaub': 'urlaub', 'Wohnung': 'wohnung', 'Sonstiges': 'sonstiges'}
FALLBACK = [(r'lidl|rewe|penny|edeka|einkauf|aldi', 'supermarkt'), (r'budni|rossmann|\bdm\b|apotheke', 'drogerie'),
            (r'h&m|zalando|adidas|aussiebum|schuhe|pulli|t-shirt', 'kleidung')]


def day(v):
    if isinstance(v, datetime.datetime):
        return v.strftime('%Y-%m-%d')
    m = re.match(r'(\d{1,2})\.(\d{1,2})\.(\d{4})', str(v or ''))
    return f'{m.group(3)}-{int(m.group(2)):02d}-{int(m.group(1)):02d}' if m else '2022-12-01'


def cents(v):
    return int(round(float(v) * 100))


def category(title, cat):
    if cat in CAT:
        return CAT[cat]
    for pat, cid in FALLBACK:
        if re.search(pat, title, re.I):
            return cid
    return 'sonstiges'


entries, skipped = [], []


def add(eid, date, title, c, payer, kind, cat, nosplit=False):
    entries.append({'id': eid, 'type': kind, 'date': date, 'time': '', 'title': title, 'cents': c,
                    'categoryId': cat, 'payer': payer, 'noSplit': nosplit, 'note': '', 'createdBy': 'import'})


ws = wf['Ausgaben']
for r in range(3, ws.max_row + 1):
    title = str(ws.cell(r, 3).value or '').strip()
    d, e = ws.cell(r, 4).value, ws.cell(r, 5).value
    if not title and d is None and e is None:
        continue
    vals = [(p, v) for p, v in (('logi', d), ('dudi', e)) if isinstance(v, (int, float))]
    if not vals:
        skipped.append({'row': r, 'title': title, 'info': str(ws.cell(r, 6).value or '')})
        continue
    for payer, v in vals:
        date = day(ws.cell(r, 1).value)
        eid = f'x{r:04d}' + ('' if len(vals) == 1 else payer[0])
        if SETTLE.search(title):
            add(eid, date, title, cents(v) // 2 if v >= 0 else -((-cents(v)) // 2), payer, 'settlement', 'ausgleich')
        elif NOSPLIT.search(title):
            add(eid, date, title, int(round(cents(v) / 2)), payer, 'expense', category(title, ws.cell(r, 7).value), True)
        else:
            add(eid, date, title, cents(v), payer, 'expense', category(title, ws.cell(r, 7).value))

wu = wf['Einmalige Kosten Umzug']
for r in range(3, wu.max_row + 1):
    title = str(wu.cell(r, 3).value or '').strip()
    d, e = wu.cell(r, 4).value, wu.cell(r, 5).value
    if not title:
        continue
    if 'nullung' in title.lower():
        add(f'u{r:03d}', '2022-07-11', title, cents(d), 'logi', 'settlement', 'ausgleich')
        continue
    for payer, v in (('logi', d), ('dudi', e)):
        if isinstance(v, (int, float)):
            add(f'u{r:03d}{payer[0]}', '2022-07-11', title, cents(v), payer, 'expense', 'umzug')

recurring = [
    ('Miete inkl. Betrieb & Heizkosten', 86590, 1, 'logi', {'mode': 'percent', 'logiPercent': 46.2231}),
    ('Strom', 18400, 1, 'logi', {'mode': 'equal'}),
    ('Internet', 4990, 1, 'logi', {'mode': 'equal'}),
    ('GEZ', 1836, 1, 'logi', {'mode': 'equal'}),
    ('Hausratversicherung', 721, 1, 'logi', {'mode': 'equal'}),
    ('Wasser', 4000, 1, 'logi', {'mode': 'equal'}),
    ('Prime', 8990, 12, 'dudi', {'mode': 'equal'}),
    ('Spotify Duo', 1499, 1, 'dudi', {'mode': 'equal'}),
]
rec = [{'id': f'r{i+1}', 'title': t, 'payer': p, 'intervalMonths': iv, 'weight': w, 'sort': i,
        'versions': [{'from': '2026-11', 'cents': c}]} for i, (t, c, iv, p, w) in enumerate(recurring)]

data = {'entries': entries, 'recurring': rec,
        'salaries': {'logi': 219373, 'dudi': 237298}, 'skipped': skipped}
json.dump(data, open(out, 'w'), ensure_ascii=False, indent=0)

# Kontrolle: Saldo (Logi schuldet Dudi) in Halb-Cent
tot2 = sum((1 if x['payer'] == 'dudi' else -1) * (2 * x['cents'] if (x['noSplit'] or x['type'] == 'settlement') else x['cents'])
           for x in entries)
print('Eintraege', len(entries), 'uebersprungen', len(skipped))
print('Saldo: Logi schuldet Dudi', tot2 / 2 / 100, '(Excel Ausgaben: Dudi schuldet Logi 11,2725 -> -11.27)')
by = {}
for x in entries:
    by[x['type']] = by.get(x['type'], 0) + 1
print(by, 'noSplit', sum(1 for x in entries if x['noSplit']))
