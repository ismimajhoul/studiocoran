"""
Scraper conjugator.reverso.net pour cross-valider studyquran.

Pour chaque verbe de quran_verb_canonical (voice=active), interroge reverso
avec le past_3ms vocalisé en URL slug, parse les sections HTML
(Past / Present / Imperative / Participles / Verbal noun) et extrait :
  - past_3ms          (هو + Past)
  - present_3ms       (هو + Present, dans Active)
  - imperative_2ms    (أنت + Imperative)
  - active_participle (Participles > Active)
  - passive_participle(Participles > Passive)
  - masdar            (Verbal noun, 1re valeur si plusieurs)

Sortie :
  morphology/reverso_truth.json
  morphology/reverso_cache/<safe_name>.html

Usage :
    python scrape_reverso.py            # fetch all canonical verbs
    python scrape_reverso.py --limit N  # tester sur N verbes
"""
import os, sys, re, json, time, subprocess, urllib.parse
from collections import Counter

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')

DIR = os.path.dirname(__file__)
TRUTH_FILE = os.path.join(DIR, 'reverso_truth.json')
CACHE_DIR  = os.path.join(DIR, 'reverso_cache')

UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")
DELAY = 2.0


def load_canonical():
    """Charge les verbes canoniques (active). On garde aussi root_ar, verb_form
    pour pouvoir matcher après."""
    out = subprocess.run(
        ['C:/MAMP/bin/mysql/bin/mysql.exe', '-u', 'root', '-proot',
         'quran_wasla', '--default-character-set=utf8mb4', '-B', '-N', '-e',
         'SELECT root_ar,verb_form,voice,past_3ms FROM quran_verb_canonical '
         'WHERE voice=\'active\' AND past_3ms IS NOT NULL'],
        capture_output=True, text=True, encoding='utf-8'
    )
    rows = []
    for line in out.stdout.splitlines():
        c = line.split('\t')
        if len(c) < 4: continue
        rows.append({
            'root_ar': c[0], 'verb_form': int(c[1]), 'voice': c[2],
            'past_3ms': c[3],
        })
    return rows


def fetch_verb_page(past_3ms):
    """Fetch la page reverso pour ce past 3MS. Avec cache disque."""
    os.makedirs(CACHE_DIR, exist_ok=True)
    # Cache key : past_3ms dévocalisé (mais on requête avec vocalisation)
    safe = re.sub(r'[^\w؀-ۿ]+', '_', past_3ms)
    cache_path = os.path.join(CACHE_DIR, f'{safe}.html')
    if os.path.exists(cache_path):
        with open(cache_path, 'r', encoding='utf-8') as f:
            return f.read(), True
    url_enc = urllib.parse.quote(past_3ms, safe='')
    url = f'https://conjugator.reverso.net/conjugation-arabic-verb-{url_enc}.html'
    try:
        result = subprocess.run(
            ['curl', '-s', '-L', '--max-time', '30',
             '-w', '\n__HTTP_CODE__%{http_code}',
             '-H', f'User-Agent: {UA}',
             '-H', 'Accept-Language: en-US,en;q=0.9',
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
    # Sanity check : doit contenir des sections de conjugaison
    if '<h4>Active</h4>' not in body and '<h4>Verbal noun' not in body:
        return None, False
    with open(cache_path, 'w', encoding='utf-8') as f:
        f.write(body)
    return body, False


# ─────────────────────────────────────────────────────────────────────
# Parsing
# ─────────────────────────────────────────────────────────────────────
PRONOUNS = ['أَنَا', 'أَنْتَ', 'أَنْتِ', 'هُوَ', 'هِيَ',
            'أَنْتُمَا', 'هُمَا', 'نَحْنُ', 'أَنْتُمْ',
            'أَنْتُنَّ', 'هُمْ', 'هُنَّ']
PRONOUNS_DEVOC = {'انا':'1S','انت':'2MS_FS','هو':'3MS','هي':'3FS','نحن':'1P',
                  'انتما':'2D','هما':'3D','انتم':'2MP','انتن':'2FP','هم':'3MP','هن':'3FP'}

def _devoc(s):
    """Retire diacritiques + normalise أ/إ/آ → ا (pour matcher les pronoms)."""
    if not s: return ''
    s = ''.join(c for c in s if c not in 'ًٌٍَُِّْٰـ')
    return s.replace('أ', 'ا').replace('إ', 'ا').replace('آ', 'ا').replace('ٱ', 'ا')


def _section(html, h4_name):
    """Extrait le HTML entre <h4>NAME</h4> et le prochain <h4>."""
    m = re.search(rf'<h4[^>]*>{re.escape(h4_name)}\s*</h4>', html)
    if not m: return None
    start = m.end()
    nm = re.search(r'<h4[^>]*>', html[start:])
    end = start + nm.start() if nm else start + 10000
    return html[start:end]


def _tokens(section_html):
    """Tokenize le HTML en mots arabes (en gardant les pronoms et formes verbales)."""
    text = re.sub(r'<[^>]+>', ' ', section_html)
    text = re.sub(r'&nbsp;|&#\d+;', ' ', text)
    # Retire les translittérations latines (commencent par lowercase ou ʾ/ʿ/etc.)
    tokens = re.findall(r'[ء-يً-ْ]+', text)
    return tokens


def _value_after_pronoun(tokens, pronoun_devoc, after_label=None):
    """Trouve le token arabe suivant un pronom donné (après une éventuelle étiquette).
    Si after_label est fourni, on cherche d'abord cette étiquette dans la liste
    des labels intercalés (Past/Present/...) — mais ici on travaille au niveau
    de la section déjà délimitée."""
    for i, tk in enumerate(tokens[:-1]):
        if _devoc(tk) == pronoun_devoc:
            return tokens[i+1]
    return None


def parse_reverso(html):
    """Renvoie un dict avec past_3ms, present_3ms, imperative_2ms, masdar,
    active_participle, passive_participle (ou None si absent)."""
    out = {'past_3ms': None, 'present_3ms': None, 'imperative_2ms': None,
           'masdar': None, 'active_participle': None, 'passive_participle': None}

    # Section Active : contient Past, Present, Subjunctive, Jussive
    active = _section(html, 'Active')
    if active:
        # Cherche "Past" puis تَوَلَّى puis هُوَ + value
        # On split la section sur les sub-headers (Past, Present, etc.)
        # Les sub-headers sont en texte brut entre <strong> ou similaire
        # Stratégie : splitter sur regex de mots-clés
        parts = re.split(r'\b(Past|Present|Subjunctive|Jussive)\b', active)
        # parts[0] = avant, puis [1]=label, [2]=content, [3]=label, etc.
        for i in range(1, len(parts)-1, 2):
            label = parts[i]
            content = parts[i+1]
            tokens = _tokens(content)
            if label == 'Past':
                v = _value_after_pronoun(tokens, 'هو')
                if v: out['past_3ms'] = v
            elif label == 'Present':
                v = _value_after_pronoun(tokens, 'هو')
                if v: out['present_3ms'] = v

    # Section Imperative : أَنْتَ X
    imp = _section(html, 'Imperative')
    if imp:
        tokens = _tokens(imp)
        v = _value_after_pronoun(tokens, 'انت')
        if v: out['imperative_2ms'] = v

    # Section Participles : Active X Passive Y
    parts_sec = _section(html, 'Participles')
    if parts_sec:
        # tokens incluent les mots 'Active' et 'Passive' qui sont en latin → exclus
        # Donc on cherche dans le texte ces labels
        text = re.sub(r'<[^>]+>', ' ', parts_sec)
        text = re.sub(r'&nbsp;', ' ', text)
        m = re.search(r'Active\s+([ء-يً-ْ]+)', text)
        if m: out['active_participle'] = m.group(1)
        m = re.search(r'Passive\s+([ء-يً-ْ]+)', text)
        if m: out['passive_participle'] = m.group(1)

    # Section Verbal noun : prend la 1re valeur arabe (si plusieurs séparés par /)
    vn = _section(html, 'Verbal noun')
    if vn:
        text = re.sub(r'<[^>]+>', ' ', vn)
        text = re.sub(r'&nbsp;', ' ', text)
        m = re.search(r'([ء-يً-ْ/]+)', text)
        if m:
            full = m.group(1)
            # 1re valeur si plusieurs séparés par /
            first = full.split('/')[0].strip()
            if first:
                out['masdar'] = first

    return out


# ─────────────────────────────────────────────────────────────────────
# Main
# ─────────────────────────────────────────────────────────────────────
def main():
    limit = None
    if '--limit' in sys.argv:
        i = sys.argv.index('--limit')
        limit = int(sys.argv[i+1])

    print('[1/3] Lecture canonical...')
    canonical = load_canonical()
    if limit: canonical = canonical[:limit]
    print(f'      {len(canonical)} verbes à scraper')

    print('[2/3] Scraping reverso...')
    results = []
    n_ok = n_fail = 0
    for i, v in enumerate(canonical, 1):
        past = v['past_3ms']
        # Cache hit detection
        safe = re.sub(r'[^\w؀-ۿ]+', '_', past)
        cache_path = os.path.join(CACHE_DIR, f'{safe}.html')
        was_cached = os.path.exists(cache_path)
        if i > 1 and not was_cached:
            time.sleep(DELAY)

        html, from_cache = fetch_verb_page(past)
        if html is None:
            n_fail += 1
            results.append({**v, 'reverso': {'status': 'fetch_fail'}})
            continue
        parsed = parse_reverso(html)
        results.append({**v, 'reverso': {'status': 'ok', **parsed, 'from_cache': from_cache}})
        n_ok += 1
        if i % 50 == 0:
            print(f'  {i}/{len(canonical)} (ok={n_ok}, fail={n_fail})')

    print(f'\n[3/3] Sauvegarde...')
    with open(TRUTH_FILE, 'w', encoding='utf-8') as f:
        json.dump(results, f, ensure_ascii=False, indent=2)
    print(f'  → {TRUTH_FILE}')
    print(f'  OK : {n_ok}/{len(canonical)}')
    print(f'  Fail : {n_fail}')


if __name__ == '__main__':
    main()
