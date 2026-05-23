"""Scraper cooljugator.com pour les verbes du canonical.

Cooljugator a une structure HTML très propre :
- data-stressed="..." sur chaque cellule donne la forme vocalisée
- id="past3m"/"present3m"/"imperative2m"/"active_participle"/"passive_participle"/"verbal_noun"
  identifie précisément le champ

URL : https://cooljugator.com/ar/<root_dévocalisé>

Usage :
    python scrape_cooljugator.py [--limit N]
"""
import os, sys, re, json, time, subprocess, urllib.parse

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')

DIR = os.path.dirname(__file__)
TRUTH_FILE = os.path.join(DIR, 'cooljugator_truth.json')
CACHE_DIR  = os.path.join(DIR, 'cooljugator_cache')

UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")
DELAY = 1.5    # cooljugator semble plus permissif


def load_canonical():
    """Charge tous les verbes canonical (active)."""
    out = subprocess.run(
        ['C:/MAMP/bin/mysql/bin/mysql.exe', '-u', 'root', '-proot',
         'quran_wasla', '--default-character-set=utf8mb4', '-B', '-N', '-e',
         "SELECT root_ar, verb_form, past_3ms FROM quran_verb_canonical "
         "WHERE voice='active' AND past_3ms IS NOT NULL"],
        capture_output=True, text=True, encoding='utf-8'
    )
    rows = []
    for line in out.stdout.splitlines():
        c = line.split('\t')
        if len(c) < 3: continue
        rows.append({'root_ar': c[0], 'verb_form': int(c[1]), 'past_3ms': c[2]})
    return rows


def devoc(s):
    """Retire diacritiques pour le slug URL."""
    return ''.join(c for c in s if c not in 'ًٌٍَُِّْٰـ').replace('ٱ', 'ا')


def fetch_verb_page(past_3ms_devoc):
    """Fetch + cache."""
    os.makedirs(CACHE_DIR, exist_ok=True)
    safe = re.sub(r'[^\w؀-ۿ]+', '_', past_3ms_devoc)
    cache_path = os.path.join(CACHE_DIR, f'{safe}.html')
    if os.path.exists(cache_path):
        with open(cache_path, 'r', encoding='utf-8') as f:
            return f.read(), True
    url = f'https://cooljugator.com/ar/{urllib.parse.quote(past_3ms_devoc, safe="")}'
    try:
        result = subprocess.run(
            ['curl', '-s', '-L', '--max-time', '30',
             '-w', '\n__HTTP_CODE__%{http_code}',
             '-H', f'User-Agent: {UA}',
             url],
            capture_output=True, timeout=40
        )
    except subprocess.TimeoutExpired:
        return None, False
    if result.returncode != 0:
        return None, False
    raw = result.stdout.decode('utf-8', errors='replace')
    sep = '\n__HTTP_CODE__'
    if sep in raw:
        body, code = raw.rsplit(sep, 1)
        try: status = int(code.strip())
        except: status = 0
    else:
        body, status = raw, 200
    if status != 200 or len(body) < 5000:
        return None, False
    # Sanity check : doit avoir une cellule past3m ou similaire
    if 'data-stressed=' not in body:
        return None, False
    with open(cache_path, 'w', encoding='utf-8') as f:
        f.write(body)
    return body, False


def parse_cooljugator(html):
    """Extrait les 6 champs via id+data-stressed."""
    out = {'past_3ms': None, 'present_3ms': None, 'imperative_2ms': None,
           'masdar': None, 'active_participle': None, 'passive_participle': None}
    id_to_field = {
        'past3m': 'past_3ms',
        'present3m': 'present_3ms',
        'imperative2m': 'imperative_2ms',
        'active_participle': 'active_participle',
        'passive_participle': 'passive_participle',
        'verbal_noun': 'masdar',
    }
    for sid, field in id_to_field.items():
        m = re.search(rf'data-stressed="([^"]+)"[^>]*id="{re.escape(sid)}"', html)
        if not m:
            m = re.search(rf'id="{re.escape(sid)}"[^>]*data-stressed="([^"]+)"', html)
        if m:
            out[field] = m.group(1)
    return out


def main():
    limit = None
    if '--limit' in sys.argv:
        i = sys.argv.index('--limit')
        limit = int(sys.argv[i+1])

    print('[1/3] Lecture canonical...')
    canonical = load_canonical()
    if limit: canonical = canonical[:limit]
    print(f'      {len(canonical)} verbes à scraper')

    print('[2/3] Scraping cooljugator...')
    results = []
    n_ok = n_fail = 0
    for i, v in enumerate(canonical, 1):
        past_devoc = devoc(v['past_3ms'])
        safe = re.sub(r'[^\w؀-ۿ]+', '_', past_devoc)
        cache_path = os.path.join(CACHE_DIR, f'{safe}.html')
        was_cached = os.path.exists(cache_path)
        if i > 1 and not was_cached:
            time.sleep(DELAY)
        html, from_cache = fetch_verb_page(past_devoc)
        if html is None:
            n_fail += 1
            results.append({**v, 'cj': {'status': 'fail'}})
            continue
        parsed = parse_cooljugator(html)
        results.append({**v, 'cj': {'status': 'ok', **parsed, 'from_cache': from_cache}})
        n_ok += 1
        if i % 50 == 0:
            print(f'  {i}/{len(canonical)} (ok={n_ok}, fail={n_fail})')

    with open(TRUTH_FILE, 'w', encoding='utf-8') as f:
        json.dump(results, f, ensure_ascii=False, indent=2)
    print(f'\n  → {TRUTH_FILE}')
    print(f'  OK : {n_ok}/{len(canonical)}')
    print(f'  Fail : {n_fail}')


if __name__ == '__main__':
    main()
