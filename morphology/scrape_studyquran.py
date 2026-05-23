"""
Scraper studyquranarabic.com via l'API WordPress REST.

Phase A : récupère toutes les pages via /wp-json/wp/v2/pages?per_page=100&page=N
Phase B : parse chaque page verbe et extrait les conjugaisons

Sortie :
  morphology/studyquran_raw.json    — toutes les pages (cache brut)
  morphology/studyquran_truth.json  — données extraites par verbe
  morphology/studyquran_pages_cache/ — cache des batches REST API

Usage :
    python scrape_studyquran.py fetch       # Phase A : fetch toutes les pages
    python scrape_studyquran.py parse       # Phase B : parse les verbes
"""

import os, sys, re, json, time, subprocess, urllib.parse

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')
    sys.stderr.reconfigure(encoding='utf-8')

DIR = os.path.dirname(__file__)
RAW_FILE    = os.path.join(DIR, 'studyquran_raw.json')
TRUTH_FILE  = os.path.join(DIR, 'studyquran_truth.json')
CACHE_DIR   = os.path.join(DIR, 'studyquran_pages_cache')

BASE_URL = 'https://studyquranarabic.com/wp-json/wp/v2/pages'
UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")
DELAY = 2.0          # entre 2 requêtes
PER_PAGE = 100
MAX_PAGES_GUARD = 50  # safety

# ─────────────────────────────────────────────────────────────────────
# Phase A : fetch toutes les pages
# ─────────────────────────────────────────────────────────────────────
def fetch_batch(page_num):
    """Fetch un batch de PER_PAGE pages. Renvoie (liste, total_pages)."""
    cache_path = os.path.join(CACHE_DIR, f'batch_{page_num:03d}.json')
    if os.path.exists(cache_path):
        with open(cache_path, 'r', encoding='utf-8') as f:
            return json.load(f), None
    os.makedirs(CACHE_DIR, exist_ok=True)
    url = f'{BASE_URL}?per_page={PER_PAGE}&page={page_num}'
    try:
        result = subprocess.run(
            ['curl', '-s', '-L', '--max-time', '60',
             '-w', '\n__HTTP_CODE__%{http_code}',
             '-D', '-',                     # include response headers
             '-H', f'User-Agent: {UA}',
             url],
            capture_output=True, timeout=70
        )
    except subprocess.TimeoutExpired:
        return None, None
    if result.returncode != 0:
        return None, None
    raw = result.stdout.decode('utf-8', errors='replace')
    # Sépare HTTP code
    sep = '\n__HTTP_CODE__'
    if sep in raw:
        body, code = raw.rsplit(sep, 1)
        try: status = int(code.strip())
        except: status = 0
    else:
        body, status = raw, 200
    if status != 200:
        print(f'  HTTP {status} sur batch {page_num}')
        return None, None
    # Sépare headers du body (curl avec -D - met headers AVANT body)
    # On cherche la double newline qui sépare
    parts = body.split('\r\n\r\n', 1) if '\r\n\r\n' in body else body.split('\n\n', 1)
    if len(parts) == 2:
        headers_text, body = parts
    else:
        headers_text = ''
    total_pages = None
    for line in headers_text.splitlines():
        if line.lower().startswith('x-wp-totalpages:'):
            try: total_pages = int(line.split(':',1)[1].strip())
            except: pass
    body = body.strip()
    try:
        data = json.loads(body)
    except Exception as e:
        print(f'  JSON parse error batch {page_num}: {e}')
        return None, None
    with open(cache_path, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False)
    return data, total_pages


def fetch_all_pages():
    """Phase A : fetch tous les batches et concatène."""
    print('[A] Fetch des pages via WordPress REST API...')
    all_pages = []
    total_batches = None
    page_num = 1
    while True:
        if total_batches is not None and page_num > total_batches:
            break
        if page_num > MAX_PAGES_GUARD:
            print(f'  ⚠ atteint MAX_PAGES_GUARD={MAX_PAGES_GUARD}, stop')
            break
        cache_path = os.path.join(CACHE_DIR, f'batch_{page_num:03d}.json')
        was_cached = os.path.exists(cache_path)
        if page_num > 1 and not was_cached:
            time.sleep(DELAY)
        data, tp = fetch_batch(page_num)
        if data is None:
            print(f'  batch {page_num} : ÉCHEC')
            break
        if tp and not total_batches:
            total_batches = tp
            print(f'  Total batches annoncé : {tp}')
        n_verbs = sum(1 for p in data
                      if '%d9%81%d8%b9%d9%84-verb/' in p.get('link','')
                      and '/root/' not in p.get('link',''))
        print(f'  batch {page_num:>2}/{total_batches or "?"} : {len(data)} pages, dont {n_verbs} verbes  {"(cache)" if was_cached else ""}')
        all_pages.extend(data)
        if len(data) < PER_PAGE:
            break
        page_num += 1
    with open(RAW_FILE, 'w', encoding='utf-8') as f:
        json.dump(all_pages, f, ensure_ascii=False)
    print(f'\n  → {len(all_pages)} pages totales écrites dans {os.path.basename(RAW_FILE)}')
    return all_pages


# ─────────────────────────────────────────────────────────────────────
# Phase B : parse verbe par verbe
# ─────────────────────────────────────────────────────────────────────
DIACRITICS = set('ًٌٍَُِّْٰـ')
def devoc(s):
    if not s: return ''
    return ''.join(c for c in s if c not in DIACRITICS)

ROMAN_TO_INT = {
    'I': 1, 'II': 2, 'III': 3, 'IV': 4, 'V': 5,
    'VI': 6, 'VII': 7, 'VIII': 8, 'IX': 9, 'X': 10,
}

def _clean_cell(cell_html):
    """Nettoie une cellule HTML : strip tags + entités → texte arabe pur."""
    text = re.sub(r'<[^>]+>', ' ', cell_html)
    text = re.sub(r'&nbsp;|&#\d+;|&[a-z]+;', ' ', text)
    text = re.sub(r'\s+', ' ', text).strip()
    return text


def parse_verb_page(page):
    """Extrait les champs d'une page verbe en exploitant la structure
    du tableau Divi (6 colonnes RTL, ordre LTR en HTML).

    Structure (rows numérotées à partir de 1) :
    - Row 1 cells (LTR):
        1=Subject pronoun, 2=passive part header, 3=active part header,
        4=ROOT, 5=PAST+PRESENT (séparés par espace), 6=form descriptor
    - Row 2 : English labels (skip)
    - Row 3 cells:
        1=empty, 2=PASSIVE_PARTICIPLE, 3=ACTIVE_PARTICIPLE,
        4="فِعْلٌ" label, 5=transitivity, 6=MASDAR
    - Row 5 : column headers (imperative/present/past, skip)
    - Row 7 (1ère conjugaison 3MS): cell 6=PAST_3MS, cell 4=PRESENT_3MS
    - Row 15 (1ère "You" 2MS): cell 2=IMPERATIVE_2MS

    Le form_num vient du label "Form IV" dans row 2 cell 5.
    """
    title = page.get('title', {}).get('rendered', '').strip()
    if not title:
        return None
    content_html = page.get('content', {}).get('rendered', '')
    # Strip Divi shortcodes
    content_html = re.sub(r'\[/?et_pb[^\]]*\]', '', content_html)

    out = {
        'past_3ms': title,        # fallback : le titre
        'present_3ms': None,
        'imperative_2ms': None,
        'masdar': None,
        'active_participle': None,
        'passive_participle': None,
        'root_ar': None,
        'form_num': None,
        'verb_in_title': title,
    }

    table_match = re.search(r'<table>.*?</table>', content_html, re.DOTALL)
    if not table_match:
        return out
    table_html = table_match.group(0)
    rows_html = re.findall(r'<tr>(.*?)</tr>', table_html, re.DOTALL)

    # Helper : retourne la cellule i (1-indexé) de la row r, ou None
    def cell(r_idx, c_idx):
        if r_idx < 1 or r_idx > len(rows_html): return None
        cells = re.findall(r'<td[^>]*>(.*?)</td>', rows_html[r_idx-1], re.DOTALL)
        if c_idx < 1 or c_idx > len(cells): return None
        v = _clean_cell(cells[c_idx-1])
        return v if v else None

    # Row 1 cell 4 : racine (3 lettres séparées par espaces) ─ ex: "خ ر ج"
    r1c4 = cell(1, 4)
    if r1c4 and re.match(r'^[ء-ي]\s+[ء-ي]\s+[ء-ي]$', r1c4):
        out['root_ar'] = r1c4

    # Row 1 cell 5 : "PAST PRESENT" ─ ex: "أَخْرَجَ يُخْرِجُ"
    r1c5 = cell(1, 5)
    if r1c5:
        parts = r1c5.split()
        if len(parts) >= 2:
            # 1er token = passé, 2e token = présent (généralement)
            out['past_3ms'] = parts[0]
            out['present_3ms'] = parts[1]

    # Row 2 cell 5 : "Form IV" / "Form X"
    r2c5 = cell(2, 5)
    if r2c5:
        m = re.search(r'Form\s+(I{1,3}V?|IV|V|VI{1,3}|IX|X)\b', r2c5)
        if m: out['form_num'] = ROMAN_TO_INT.get(m.group(1))

    # Row 3 cell 2 : participe passif
    r3c2 = cell(3, 2)
    if r3c2 and re.match(r'^[ء-يً-ْ]+$', r3c2):
        out['passive_participle'] = r3c2

    # Row 3 cell 3 : participe actif
    r3c3 = cell(3, 3)
    if r3c3 and re.match(r'^[ء-يً-ْ]+$', r3c3):
        out['active_participle'] = r3c3

    # Row 3 cell 6 : masdar
    r3c6 = cell(3, 6)
    if r3c6 and re.match(r'^[ء-يً-ْ]+$', r3c6):
        out['masdar'] = r3c6

    # Row 7 (1re conj 3MS) cell 6 = past, cell 4 = present (raffine row 1)
    r7c6 = cell(7, 6)
    if r7c6 and re.match(r'^[ء-يً-ْ]+$', r7c6):
        out['past_3ms'] = r7c6
    r7c4 = cell(7, 4)
    if r7c4 and re.match(r'^[ء-يً-ْ]+$', r7c4):
        out['present_3ms'] = r7c4

    # Row 15 (1re conj 2MS "You") cell 2 = impératif
    r15c2 = cell(15, 2)
    if r15c2 and re.match(r'^[ء-يً-ْ]+$', r15c2):
        out['imperative_2ms'] = r15c2

    return out


def parse_all():
    """Phase B : parse toutes les pages verbe."""
    print('[B] Parse des pages verbe...')
    with open(RAW_FILE, 'r', encoding='utf-8') as f:
        all_pages = json.load(f)
    verbs = [p for p in all_pages
             if '%d9%81%d8%b9%d9%84-verb/' in p.get('link','')
             and '/root/' not in p.get('link','')]
    print(f'  {len(verbs)} pages verbe identifiées')

    results = {}     # past_3ms → dict
    n_ok = n_fail = 0
    for i, p in enumerate(verbs, 1):
        parsed = parse_verb_page(p)
        if parsed is None or not parsed.get('past_3ms'):
            n_fail += 1
            continue
        n_ok += 1
        key = parsed['past_3ms']
        # Dédoublonne par past_3ms (titre) — garde la première occurrence
        if key not in results:
            results[key] = parsed
        if i % 50 == 0:
            print(f'  {i}/{len(verbs)}... ({n_ok} OK)')

    with open(TRUTH_FILE, 'w', encoding='utf-8') as f:
        json.dump(results, f, ensure_ascii=False, indent=2)
    print(f'  → {len(results)} verbes uniques écrits dans {os.path.basename(TRUTH_FILE)}')
    print(f'  → OK={n_ok}, Fail={n_fail}')

    # Sample
    print('\nÉchantillon :')
    for i, (past, d) in enumerate(list(results.items())[:5]):
        print(f'  {past}: pres={d["present_3ms"]}  imp={d["imperative_2ms"]}  '
              f'mas={d["masdar"]}  actp={d["active_participle"]}  '
              f'passp={d["passive_participle"]}  form={d["form_num"]}  root={d["root_ar"]}')


# ─────────────────────────────────────────────────────────────────────
# Main
# ─────────────────────────────────────────────────────────────────────
def main():
    cmd = sys.argv[1] if len(sys.argv) > 1 else 'fetch'
    if cmd == 'fetch':
        fetch_all_pages()
    elif cmd == 'parse':
        parse_all()
    elif cmd == 'all':
        fetch_all_pages()
        parse_all()
    else:
        print(f'Usage: python {os.path.basename(__file__)} [fetch|parse|all]')


if __name__ == '__main__':
    main()
