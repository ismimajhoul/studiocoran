"""
Phase 1.3 — Scraper Almaany pour récupérer la vérité terrain sur les conjugaisons.

Source : معجم اللغة العربية المعاصر (Ahmad Mukhtar Omar) via almaany.com
Format extrait : <b>PASSÉ</b> ... <b>يَPRÉSENT</b> ، <b>MASDAR(s)</b> ، فهو <b>P_ACTIF</b> ، والمفعول <b>P_PASSIF</b>

Entrée : morphology/test_set.json
Sortie : morphology/almaany_truth.json
        morphology/almaany_cache/<lemme>.html  (cache des HTML bruts)

Politesse : 1.5s entre 2 requêtes, User-Agent navigateur, cache disque.

Usage :
    python scrape_almaany.py [--limit N]  # N pour test rapide
"""

import json
import os
import re
import sys
import time
import subprocess
import urllib.parse

# Force UTF-8 sur stdout/stderr (Windows console = cp1252 par défaut)
if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')
    sys.stderr.reconfigure(encoding='utf-8')

DIR        = os.path.dirname(__file__)
TEST_SET   = os.path.join(DIR, 'test_set.json')
OUTPUT     = os.path.join(DIR, 'almaany_truth.json')
CACHE_DIR  = os.path.join(DIR, 'almaany_cache')

UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")
# Dictionnaires acceptés comme source de vérité, par ordre de préférence.
# 'عربي عامة' est la source par défaut d'Almaany avec le format morpho complet
# (passé + يَ-présent + masdars + فهو + والمفعول). Mukhtar Omar (المعاصر) en backup.
TARGET_DICOS = [
    "عربي عامة",
    "اللغة العربية المعاصر",  # Mukhtar Omar
    "المعجم الوسيط",          # Wasit
]
DELAY = 3.0
BACKOFF_429_SECONDS = [30, 60, 120]  # attentes successives en cas de rate-limit

# Diacritiques arabes
DIACRITICS = set('ًٌٍَُِّْٰـ')      # tout (y compris shadda)
HARAKAT_NO_SHADDA = set('ًٌٍَُِْٰـ') # tout sauf shadda
HARAKAT = set('ًٌٍَُِْ')             # fatha damma kasra sukun (+tanwin)
FATHA, DAMMA, KASRA, SUKUN, SHADDA = 'َ', 'ُ', 'ِ', 'ْ', 'ّ'

def _normalize_pre(s):
    """Pré-norm avant retrait diacritiques : ٱ→ا, ٰ→∅."""
    if not s: return s
    return s.replace('ٱ', 'ا').replace('ٰ', '')

def _normalize_post(s):
    """Post-norm après retrait diacritiques : ءا/آ/أ/إ → ا (équivalences hamza-alif).
    Applique aussi ى final → ا (alif maksura → alif) pour matcher défectueux."""
    if not s: return s
    s = s.replace('ءا', 'ا').replace('آ', 'ا').replace('أ', 'ا').replace('إ', 'ا')
    if s.endswith('ى'):
        s = s[:-1] + 'ا'
    return s

def devocalize(s):
    """Squelette consonnes nues (matching laxiste, hamza ≡ alif)."""
    if not s: return s
    s = _normalize_pre(s)
    s = ''.join(c for c in s if c not in DIACRITICS)
    s = _normalize_post(s)
    return s

def skeleton(s):
    """Squelette consonnes + shadda (distingue Form I/II : كذب vs كذّب). Normalise lettres."""
    if not s: return s
    s = _normalize_pre(s)
    s = ''.join(c for c in s if c not in HARAKAT_NO_SHADDA)
    s = _normalize_post(s)
    return s

def normalize_for_search(s):
    """Devocalise sans transformer les lettres (sauf ٱ→ا, ٰ→∅) — pour l'URL de recherche.
    Almaany attend la forme orthographique standard (ى, آ, ؤ, etc. acceptés).
    """
    if not s: return s
    s = _normalize_pre(s)
    s = ''.join(c for c in s if c not in DIACRITICS)
    return s

def search_variants(lemma_ar):
    """Pour un lemme donné, retourne plusieurs variantes à essayer.
    Almaany accepte parfois 'آمن', parfois 'امن' selon les cas."""
    base = normalize_for_search(lemma_ar)
    variants = [base]
    # ءا en début → آ (e.g., ءامن → آمن)
    if base.startswith('ءا'):
        variants.append('آ' + base[2:])
    if base.startswith('ء'):
        variants.append('ا' + base[1:])
    # آ → ا (fallback)
    if 'آ' in base:
        variants.append(base.replace('آ', 'ا'))
    # ى → ا (final alif maksura → alif)
    if base.endswith('ى'):
        variants.append(base[:-1] + 'ا')
    return variants

def extract_r2_vowel(past_3ms):
    """Pour un passé Form I (3 lettres : R1 R2 R3 + harakat), retourne
    la voyelle de R2 (fatha/damma/kasra). Retourne None si non identifiable."""
    if not past_3ms: return None
    # Décompose : on ignore les caractères non-arabes
    chars = list(past_3ms)
    # Parcourt en collectant (consonne, harakat suivante)
    pairs = []
    i = 0
    while i < len(chars):
        c = chars[i]
        if c in DIACRITICS:
            i += 1; continue
        # consonne
        h = chars[i+1] if i+1 < len(chars) and chars[i+1] in HARAKAT else None
        # ignore shadda + récupère la haraka après shadda si présente
        if i+1 < len(chars) and chars[i+1] == 'ّ':
            h = chars[i+2] if i+2 < len(chars) and chars[i+2] in HARAKAT else None
        pairs.append((c, h))
        i += 1
    # Form I sain : 3 consonnes → R2 est pairs[1]
    if len(pairs) >= 3:
        return pairs[1][1]
    return None

# Extrait toutes les entrées (more + dico) du HTML
ENTRY_RX = re.compile(
    r'<li class="more">(.*?)</li>.*?<b>\s*المعجم\s*:?(?:&nbsp;|\s)*</b>\s*([^<]+)',
    re.DOTALL
)

B_RX = re.compile(r'<b>([^<]+)</b>')


def _looks_like_real_page(html):
    """Détecte si le HTML est une vraie page de résultat (pas erreur / rate-limit / vide)."""
    if not html or len(html) < 5000:
        return False
    if '<li class="more">' not in html:
        return False  # pas de bloc de définition → page d'erreur ou vide
    return True


def fetch(word_devoc):
    """Récupère HTML via curl. Cache uniquement les vraies pages de résultats.
    Renvoie (html, from_cache). html=None si fetch raté ou rate-limit (HTTP 429)."""
    os.makedirs(CACHE_DIR, exist_ok=True)
    safe = re.sub(r'[^\w؀-ۿ]+', '_', word_devoc)
    cache_path = os.path.join(CACHE_DIR, f'{safe}.html')
    if os.path.exists(cache_path):
        with open(cache_path, 'r', encoding='utf-8') as f:
            cached = f.read()
        if _looks_like_real_page(cached):
            return cached, True
        # Cache invalide (page rate-limit) → on le retire et on re-fetch
        os.remove(cache_path)
    url_enc = urllib.parse.quote(word_devoc, safe='')
    url = f'https://www.almaany.com/ar/dict/ar-ar/{url_enc}/'

    def do_curl():
        try:
            result = subprocess.run(
                ['curl', '-s', '-L', '--max-time', '30',
                 '-w', '\n__HTTP_CODE__%{http_code}',
                 '-H', f'User-Agent: {UA}',
                 '-H', 'Accept-Language: ar,en;q=0.9',
                 url],
                capture_output=True, timeout=40
            )
        except subprocess.TimeoutExpired:
            return None, 0
        if result.returncode != 0:
            return None, 0
        raw = result.stdout.decode('utf-8', errors='replace')
        sep = '\n__HTTP_CODE__'
        if sep in raw:
            html, code_str = raw.rsplit(sep, 1)
            try: status = int(code_str.strip())
            except: status = 0
        else:
            html, status = raw, 200
        return html, status

    html, status = do_curl()
    # Backoff sur 429
    for wait in BACKOFF_429_SECONDS:
        if status != 429: break
        print(f'  [rate-limit] backoff {wait}s...')
        time.sleep(wait)
        html, status = do_curl()

    if status == 429 or html is None:
        return None, False
    if not _looks_like_real_page(html):
        return None, False
    with open(cache_path, 'w', encoding='utf-8') as f:
        f.write(html)
    return html, False


def parse_mukhtar_entry(more_html):
    """Parse une entrée Mukhtar Omar. Approche text-based (Almaany met
    parfois le présent en clair, parfois en <b>)."""
    head = more_html.split(':-', 1)[0] if ':-' in more_html else more_html
    bolds = [b.strip() for b in B_RX.findall(head)]
    if not bolds:
        return None

    # Texte plein (sans HTML)
    text = re.sub(r'<[^>]+>', ' ', head)
    text = re.sub(r'\s+', ' ', text).strip()

    out = {
        'past_3ms_almaany': bolds[0],
        'present_3ms_almaany': None,
        'masdars_almaany': [],
        'active_participle_almaany': None,
        'passive_participle_almaany': None,
        'raw_head': text,
    }

    # Localise le passé dans le texte plein pour partir après lui
    past = bolds[0]
    if past in text:
        after_past = text.split(past, 1)[1]
    else:
        after_past = text

    # Présent : premier mot dans `after_past` qui commence par ي / ت / ن
    # Tokenize sur espaces et ponctuation arabe / latine
    tokens = re.findall(r'[؀-ۿ]+', after_past)
    pres_token = None
    for tk in tokens:
        if re.match(r'^[يتن]', devocalize(tk)):
            pres_token = tk
            break
    out['present_3ms_almaany'] = pres_token

    # فهو → participe actif
    m = re.search(r'فهو\s+([؀-ۿ]+)', text)
    if m: out['active_participle_almaany'] = m.group(1)

    # والمفعول → participe passif (peut être suivi de ":-" puis du masdar passif sur une autre ligne)
    m = re.search(r'والمفعول\s+([؀-ۿ]+)', text)
    if m:
        cand = m.group(1)
        # Si la première lettre est ":" ou vide, on cherche la suite
        if cand and cand not in ('مَفْعول', 'مفعول'):
            out['passive_participle_almaany'] = cand
        else:
            out['passive_participle_almaany'] = cand
    # Cas particulier : "والمفعول :- مَفْعول ..." (le passif est après ":-")
    if out['passive_participle_almaany'] is None or out['passive_participle_almaany'] == '':
        m = re.search(r'والمفعول\s*:[\-\s]*([؀-ۿ]+)', text)
        if m: out['passive_participle_almaany'] = m.group(1)

    # Masdars : tous les <b> non-verbes entre past et فهو
    # Filtres : ne pas inclure past / present / actpart / passpar / impératifs
    actpart = out['active_participle_almaany']
    passpar = out['passive_participle_almaany']
    pres = out['present_3ms_almaany']
    forbidden_devoc = set()
    for f in (past, pres, actpart, passpar):
        if f: forbidden_devoc.add(devocalize(f))
    masdar_zone = bolds[1:]
    for b in masdar_zone:
        if b == actpart: break
        b_clean = b.lstrip('و')
        if not b_clean: continue
        b_devoc = devocalize(b_clean)
        # Skip verbes (يـ/تـ/نـ initial)
        if re.match(r'^[يتن]', b_devoc): continue
        # Skip impératifs : commencent par ا/ائـ et finissent par sukun ou kasra terminale
        # (heuristique simple : ائـ ou اـ + 3 consonnes courtes)
        if b_devoc.startswith('ا') and len(b_devoc) <= 4 and not b_clean.endswith('ً'):
            continue
        # Skip si égal à past/pres/actpart/passpar (dévocalisé)
        if b_devoc in forbidden_devoc:
            continue
        # Skip si trop court (<= 2 lettres dévocalisé)
        if len(b_devoc) < 3: continue
        out['masdars_almaany'].append(b_clean)

    return out


def parse_all_mukhtar_entries(html):
    """Retourne la liste des entrées des dictionnaires cibles (ordre TARGET_DICOS).
    Chaque entrée est tagguée avec son dico source."""
    entries = []
    # Indexe les entrées par dico
    by_dico = {d: [] for d in TARGET_DICOS}
    for m in ENTRY_RX.finditer(html):
        more, dico = m.group(1), m.group(2).strip()
        # Match permissif (le dico target peut être un préfixe)
        for target in TARGET_DICOS:
            if target == dico or target in dico:
                parsed = parse_mukhtar_entry(more)
                if parsed:
                    parsed['source_dico'] = dico
                    by_dico[target].append(parsed)
                break
    # Concatène dans l'ordre de préférence
    for target in TARGET_DICOS:
        entries.extend(by_dico[target])
    return entries


def select_best_entry(entries, expected_lemma):
    """Sélection en cascade :
    1. Match du squelette (consonnes + shadda) → distingue Form I/II/III/...
    2. Match du squelette dévocalisé (sans shadda) + match R2 vowel → distingue homographes
    3. Match squelette dévocalisé seul
    4. Première entrée par défaut
    """
    if not entries:
        return None
    exp_skel = skeleton(expected_lemma)
    exp_devoc = devocalize(expected_lemma)
    exp_r2 = extract_r2_vowel(expected_lemma)

    # Niveau 1 : squelette exact (consonnes + shadda)
    for e in entries:
        if skeleton(e['past_3ms_almaany']) == exp_skel:
            return e

    # Niveau 2 : squelette dévocalisé + R2 vowel match
    if exp_r2:
        for e in entries:
            if devocalize(e['past_3ms_almaany']) == exp_devoc and extract_r2_vowel(e['past_3ms_almaany']) == exp_r2:
                return e

    # Niveau 3 : squelette dévocalisé seul
    for e in entries:
        if devocalize(e['past_3ms_almaany']) == exp_devoc:
            return e

    # Aucun match propre → fallback sur la 1re entrée, mais flag le warning
    fallback = dict(entries[0])
    fallback['match_quality'] = 'fallback_first_entry'
    fallback['match_warning'] = f'no skeleton match for expected {expected_lemma!r}'
    return fallback


def scrape_word(lemma_ar):
    """Essaie plusieurs variantes de la recherche jusqu'à trouver une entrée Mukhtar Omar."""
    variants = search_variants(lemma_ar)
    last_word = variants[0]
    any_cache = False
    for word in variants:
        html, from_cache = fetch(word)
        any_cache = any_cache or from_cache
        last_word = word
        if html is None:
            continue
        entries = parse_all_mukhtar_entries(html)
        if not entries:
            continue
        best = select_best_entry(entries, lemma_ar)
        best['status'] = 'ok'
        best['word_searched'] = word
        best['variants_tried'] = variants
        best['from_cache'] = from_cache
        best['dico'] = best.get('source_dico', '?')
        best['n_entries_found'] = len(entries)
        return best
    return {
        'status': 'not_found',
        'word_searched': last_word,
        'variants_tried': variants,
        'from_cache': any_cache,
    }


def main():
    limit = None
    input_file = TEST_SET
    if '--limit' in sys.argv:
        i = sys.argv.index('--limit')
        limit = int(sys.argv[i+1])
    if '--input' in sys.argv:
        i = sys.argv.index('--input')
        input_file = os.path.join(DIR, sys.argv[i+1])

    with open(input_file, 'r', encoding='utf-8') as f:
        test_set = json.load(f)

    if limit:
        test_set = test_set[:limit]

    results = []
    n_ok = n_notfound = n_err = 0
    for i, row in enumerate(test_set, 1):
        lemma = row['lemma_ar']
        if not lemma:
            results.append({**row, 'almaany': {'status': 'no_lemma'}})
            continue
        # Si TOUTES les variantes sont en cache, pas de delay
        variants = search_variants(lemma)
        was_cached = all(
            os.path.exists(os.path.join(CACHE_DIR, re.sub(r'[^\w؀-ۿ]+', '_', v) + '.html'))
            for v in variants
        )

        if i > 1 and not was_cached:
            time.sleep(DELAY)

        try:
            res = scrape_word(lemma)
        except Exception as e:
            res = {'status': 'exception', 'error': str(e)}

        status = res.get('status')
        if status == 'ok': n_ok += 1
        elif status == 'not_found': n_notfound += 1
        else: n_err += 1

        results.append({**row, 'almaany': res})
        marker = '✓' if status == 'ok' else ('✗' if status == 'not_found' else '!')
        cache_tag = '(cache)' if res.get('from_cache') else ''
        print(f'[{i:>3}/{len(test_set)}] {marker} {lemma:<20} {status:<12} {cache_tag}')

    with open(OUTPUT, 'w', encoding='utf-8') as f:
        json.dump(results, f, ensure_ascii=False, indent=2)

    print(f'\nGénéré : {OUTPUT}')
    print(f'  OK         : {n_ok}')
    print(f'  Non trouvé : {n_notfound}')
    print(f'  Erreurs    : {n_err}')


if __name__ == '__main__':
    main()
