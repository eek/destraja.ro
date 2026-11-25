#!/usr/bin/env python3
"""Actele de dinainte de 1990 citate de actele de după → data/mo/pre1990-citari.json.

Rulat de mână, nu zilnic: citește textele actelor din setul scriptogre/romanian-law-data
(~/work/monitorul-oficial/third-party/scriptogre/documents.parquet, ~4,4 GB de text) și tabelul
nas-exports/acts.ndjson. Nu cere nimic din rețea și nu folosește niciun model: doar expresii regulate.

Pentru fiecare act de dinainte de 1990 (după data Monitorului / Buletinului, altfel data actului) care e lege,
decret, decret-lege sau hotărâre cu număr, numără câte acte distincte (fără formele consolidate și fără actul
însuși) îl citează după „<Tip> nr. N/AAAA” sau „<Tip> nr. N din <zi> <lună> AAAA”. Cheile (tip, număr, an)
purtate de mai multe acte vechi se sar: nu se poate spune pe care îl citează textul.

Scrie doar ce folosește pagina /monitorul-oficial/inainte-de-1990, ca fișierul să rămână mic: titlurile și
numărul de citări ale celor mai citate acte, plus titlurile actelor vechi (de dinainte de 1920) și ale codurilor
și constituțiilor. scripts/straja-mo-pre1990.mjs le îmbină zilnic cu tabelul.

    python3 -I scripts/mo-pre1990-citari.py            # MO_DIR=~/work/monitorul-oficial
"""
import json
import os
import re
import sys
from datetime import datetime, timezone

import pyarrow.parquet as pq

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MO_DIR = os.environ.get('MO_DIR') or os.path.expanduser('~/work/monitorul-oficial')
ACTS = os.path.join(MO_DIR, 'nas-exports', 'acts.ndjson')
DOCS = os.path.join(MO_DIR, 'third-party', 'scriptogre', 'documents.parquet')
OUT = os.path.join(ROOT, 'data', 'mo', 'pre1990-citari.json')
TOP = 80
OLD_BEFORE = '1920'

KIND = {'LEGE': 'lege', 'DECRET': 'decret', 'DECRET-LEGE': 'decret-lege', 'HOTARARE': 'hotarare', 'HOTĂRÂRE': 'hotarare'}
NUM_IN_TITLE = re.compile(r'\bnr\.\s*([\d.]+)', re.I)


def pre1990_date(a):
    """Data după care actul intră pe pagină: a Monitorului sau Buletinului, altfel a actului; None dacă e din 1990 încoace."""
    mo = a.get('mo') or {}
    d = mo.get('date') or a.get('actDate')
    # Un act datat înainte de 1990, dar publicat abia după (mai ales tratate ratificate mai târziu), are data Monitorului
    # din 1990 încoace: nu e un act de atunci. Aceeași regulă ca pre1990Date din scripts/lib/mo-pre1990.mjs.
    return d if d and d < '1990' else None


CONNECTOR = r'(?:privind|pentru|cu privire la|privit(?:or|oare) la|asupra|referitoare? la|relativ[ăa]? la)'
SUBJECT_AFTER = re.compile(
    r'(?:\s*\((?:r\d|\*+[^)]{0,30})\))?(?:\s*,?\s*(?:republicat[ăa]?|modificat[ăa]?|cu modificările(?: și completările)? ulterioare))*\s*,?\s*'
    r'(' + CONNECTOR + r'\s[^,;()\n\r]{4,160}?)(?=\s*(?:,|;|\(|\.\s|\.$|\n|\r| cu modific| republicat| și a | aprobat|$))')
NOMINATIVE = {'Legea', 'Decretul', 'Hotărârea', 'Hotărîrea', 'Decretul-lege'}
INSTITUTION = re.compile(r'(?:a\s|al\s)?(?:Consiliului|Marii|Prezidiului|Guvernului|Comitetului|Ministerului|Parlamentului|din|nr|Republicii|R\.)', re.I)


def num(s):
    s = (s or '').replace('.', '').strip()
    return int(s) if s.isdigit() else None


def main():
    if not os.path.exists(ACTS) or not os.path.exists(DOCS):
        sys.exit(f'lipsește {ACTS} sau {DOCS}')
    old = {}
    skip_ids = set()
    with open(ACTS, encoding='utf8') as fh:
        for line in fh:
            a = json.loads(line)
            if '_meta' in a:
                continue
            if a.get('consolidationOf') or a.get('suspectConsolidation'):
                skip_ids.add(a['portalId'])
                continue
            d = pre1990_date(a)
            if d:
                old[a['portalId']] = {**a, '_date': d}

    # Titlurile, din setul scriptogre (portalId din legătura spre DetaliiDocument).
    t = pq.read_table(DOCS, columns=['title', 'link']).to_pydict()
    titles = {}
    for title, link in zip(t['title'], t['link']):
        m = re.search(r'DetaliiDocument/(\d+)', link or '')
        if m and int(m.group(1)) in old and title:
            titles[int(m.group(1))] = ' '.join(title.split())
    del t

    keys = {}
    for pid, a in old.items():
        k = KIND.get((a.get('type') or '').upper())
        if not k:
            continue
        n = a.get('number')
        if n is None:
            m = NUM_IN_TITLE.search(titles.get(pid, ''))
            n = num(m.group(1)) if m else None
        y = int((a.get('actDate') or a['_date'])[:4])
        if n is None:
            continue
        keys.setdefault((k, n, y), []).append(pid)
    ambiguous = {k for k, v in keys.items() if len(v) > 1}
    key_to_pid = {k: v[0] for k, v in keys.items() if len(v) == 1}
    print(f'[pre1990] acte vechi: {len(old)}; cu titlu: {len(titles)}; chei citabile: {len(key_to_pid)}; ambigue (sărite): {len(ambiguous)}')

    word = {
        'lege': r'Leg(?:ea|ii|ile)',
        'decret-lege': r'Decret(?:ul|ului)?[- ]lege',
        'decret': r'Decret(?:ul|ului|ele|elor)?',
        'hotarare': r'Hot[ăa]r[âîa]r(?:ea|ii|ile)',
    }
    months = 'ianuarie|februarie|martie|aprilie|mai|iunie|iulie|august|septembrie|octombrie|noiembrie|decembrie'
    rx = re.compile(
        r'\b(?P<w>' + '|'.join(f'(?P<{k.replace("-", "_")}>{v})' for k, v in word.items()) + r')\b'
        # „Hotărârea Consiliului de Miniștri nr.”, „Decretul Consiliului de Stat nr.”: câteva cuvinte între tip și număr.
        r'(?P<mid>(?:\s+[A-ZȘȚĂÎÂa-zșțăîâ.\-]+){0,5}?)\s+nr\.\s*(?P<n>\d[\d.]*)\s*'
        r'(?:/\s*(?P<y1>1[89]\d\d)\b|din\s+\d{1,2}\s+(?:' + months + r')\s+(?P<y2>1[89]\d\d)\b)'
    )
    # Actele vechi fără titlu (sau cu un titlu care e de fapt primul rând al textului): obiectul lor se ia din textele care
    # le citează, „Legea nr. 3/1977 privind pensiile…”, cea mai des întâlnită continuare.
    # Pentru toate actele citabile: pagina alege titlul când are obiect și abia altfel continuarea din citări.
    need = set(key_to_pid.values())
    phrases = {}
    cited = {}
    f = pq.ParquetFile(DOCS)
    docs = 0
    for b in f.iter_batches(columns=['link', 'title', 'content'], batch_size=4000):
        d = b.to_pydict()
        for link, title, content in zip(d['link'], d['title'], d['content']):
            if not content:
                continue
            m = re.search(r'DetaliiDocument/(\d+)', link or '')
            src = int(m.group(1)) if m else None
            if src in skip_ids or '(*actualizat' in (title or ''):
                continue
            docs += 1
            hits = set()
            for h in rx.finditer(content):
                kind = next(k for k in word if h.group(k.replace('-', '_')))
                y = int(h.group('y1') or h.group('y2'))
                pid = key_to_pid.get((kind, num(h.group('n')), y))
                if pid and pid != src:
                    hits.add(pid)
                    if pid in need:
                        sm = SUBJECT_AFTER.match(content, h.end(), h.end() + 220)
                        mid = ' '.join(h.group('mid').split())
                        ph = None
                        if sm:
                            ph = ' '.join(sm.group(1).split()).rstrip(' .')
                        # „Legea sanitară veterinară nr. 60/1974”: numele stă între tip și număr (doar la nominativ).
                        elif mid and h.group('w') in NOMINATIVE and not INSTITUTION.match(mid) and mid[0].islower():
                            ph = f"{h.group('w')} {mid}"
                        if ph:
                            c = phrases.setdefault(pid, {})
                            c[ph] = c.get(ph, 0) + 1
            for pid in hits:
                cited[pid] = cited.get(pid, 0) + 1
    print(f'[pre1990] texte citite: {docs}; acte vechi citate măcar o dată: {len(cited)}')

    top = sorted(cited.items(), key=lambda x: (-x[1], x[0]))[:TOP]
    keep = {pid for pid, _ in top}
    for pid, a in old.items():
        typ = (a.get('type') or '').upper()
        if a['_date'] < OLD_BEFORE or typ.startswith('COD') or typ.startswith('CONSTITU'):
            keep.add(pid)
    out = {
        'generatedAt': datetime.now(timezone.utc).isoformat(timespec='seconds'),
        'source': 'Texte: setul scriptogre/romanian-law-data (copia Portalului Legislativ, 2026-11-23); citări numărate cu expresii regulate, fără model.',
        'method': 'Acte distincte (fără forme consolidate) al căror text numește actul vechi după tip, număr și an.',
        'docsScanned': docs,
        'citedAtLeastOnce': len(cited),
        'cited': [[pid, n] for pid, n in top],
        'titles': {str(pid): titles[pid] for pid in sorted(keep) if pid in titles},
        # Obiectul luat din textele care citează actul: doar cel mai des întâlnit, și doar dacă apare de cel puțin 3 ori.
        'subjects': {},
    }
    for pid in sorted(keep):
        c = phrases.get(pid)
        if c:
            ph, n = max(c.items(), key=lambda x: (x[1], -len(x[0])))
            if n >= 3:
                out['subjects'][str(pid)] = ph
    with open(OUT + '.tmp', 'w', encoding='utf8') as fh:
        json.dump(out, fh, ensure_ascii=False, separators=(',', ':'))
        fh.write('\n')
    os.replace(OUT + '.tmp', OUT)
    print(f'[pre1990] scris {os.path.relpath(OUT, ROOT)}: {len(top)} citate, {len(out["titles"])} titluri')
    for pid, n in top[:40]:
        print(f'  {n:6d}  {pid:7d}  {titles.get(pid, "")[:90]} | {out["subjects"].get(str(pid), "")[:80]}')


if __name__ == '__main__':
    main()
