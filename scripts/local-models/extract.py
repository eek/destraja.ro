"""Textul articolului dintr-o pagină HTML, cu trafilatura (extractorul folosit pentru FineWeb pe Common Crawl).

Primește JSONL pe stdin, câte o pagină pe linie: {"id": ..., "html": "..."}; scrie pe stdout {"id": ..., "text": "..."}.
Pagina e conținut nesigur: o citim doar ca text, fără să rulăm nimic din ea. Rulează cu `python -I`.
"""

import json
import sys

import trafilatura

for line in sys.stdin:
    if not line.strip():
        continue
    row = json.loads(line)
    try:
        text = trafilatura.extract(row["html"], include_comments=False, include_tables=False) or ""
    except Exception:  # o pagină stricată nu oprește lotul
        text = ""
    sys.stdout.write(json.dumps({"id": row["id"], "text": text}, ensure_ascii=False) + "\n")
