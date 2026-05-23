"""
Phase 2 : génère automatiquement des overrides dans
verb_canonical_overrides.json à partir des divergences détectées par
diff_studyquran.py (sans craser les overrides manuels existants).

Stratégie :
- Pour chaque verbe scrapé sur studyquran qui matche notre canonical
- Pour chaque champ où studyquran a une valeur ET le squelette diffère
- On ajoute la valeur studyquran comme override (en supprimant le tanwin)
- Les overrides manuels existants sont préservés (priorité au manuel)

Usage :
    python generate_overrides_from_studyquran.py
"""
import os, sys, json, subprocess, re
from collections import defaultdict

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')

DIR = os.path.dirname(__file__)
TRUTH_FILE = os.path.join(DIR, 'studyquran_truth.json')
OVERRIDES_FILE = os.path.join(DIR, 'verb_canonical_overrides.json')

DIACRITICS = set('ًٌٍَُِّْٰـ')
HARAKAT_NS = set('ًٌٍَُِْٰـ')

def _norm(s):
    if not s: return ''
    return (s.replace('ٱ', 'ا').replace('ٰ', '')
             .replace('آ', 'ا').replace('أ', 'ا').replace('إ', 'ا')
             .replace('ؤ', 'و').replace('ئ', 'ي'))

def devoc(s):
    if not s: return ''
    s = _norm(s)
    s = ''.join(c for c in s if c not in DIACRITICS)
    return s.replace('ءا', 'ا').replace('ء', '')

def skel(s):
    if not s: return ''
    s = _norm(s)
    s = ''.join(c for c in s if c not in HARAKAT_NS)
    return s.replace('ءا', 'ا').replace('ء', '')


def strip_trailing_tanwin(s):
    """Retire ًٌ en fin (mais garde ٍ qui est marqueur de défectif)."""
    if not s: return s
    while s and s[-1] in 'ًٌ':
        s = s[:-1]
    return s


# Mots-type à filtrer (vocabulaire grammatical, pas des verbes/participes)
TYPE_WORDS = {'الأجوف', 'السالم', 'المهموز', 'المضعف', 'الناقص', 'المثال', 'اللفيف',
              'الفعل', 'الماضي', 'المضارع', 'فعل', 'الأمر'}

def value_passes_filters(field, ours, theirs):
    """Filtres stricts pour rejeter les valeurs studyquran clairement mauvaises.
    Cause principale : notre parser studyquran capture parfois la mauvaise
    cellule du tableau (présent à la place du passé, mot-type à la place du
    participe, etc.)."""
    if not theirs: return False
    theirs_dev = devoc(theirs)

    # Rejette les mots du vocabulaire grammatical
    if theirs_dev in TYPE_WORDS: return False
    if theirs.startswith('ال'): return False  # définite article = forcément un terme générique

    # past_3ms : ne doit PAS commencer par les préfixes verbaux du présent (ي/ت/ن)
    if field == 'past_3ms':
        if re.match(r'^[يتن]', theirs_dev): return False

    # present_3ms : DOIT commencer par ي/ت/ن
    if field == 'present_3ms':
        if not re.match(r'^[يتن]', theirs_dev): return False

    # imperative_2ms : ne doit PAS commencer par ي/ت/ن
    if field == 'imperative_2ms':
        if re.match(r'^[يتن]', theirs_dev): return False

    # participes : pas finir par ة (= forme féminine, alors qu'on veut masculin).
    # On dévocalise et strip tanwin pour catcher مُقِيْمَةٌ aussi.
    theirs_stripped = strip_trailing_tanwin(theirs)
    if 'participle' in field:
        if theirs_stripped.endswith('ة'): return False
        # Heuristique : longueur dévocalisée ≥ 3
        if len(theirs_dev) < 3: return False

    # masdar : longueur min, rejette les valeurs trop courtes (truncations parser)
    if field == 'masdar':
        if len(theirs_dev) < 4: return False
        # Rejette les hamza isolées au milieu (broken patterns comme اِأْمَان, مُنْبَؤ)
        if 'ءا' not in theirs and re.search(r'[ا-ي]ء[ا-ي]', theirs_dev):
            # Pattern letter+hamza+letter : souvent broken
            return False

    # past_3ms / imperative_2ms : rejette les broken hamza au milieu
    if field in ('past_3ms', 'imperative_2ms'):
        if len(theirs_dev) < 3: return False

    # Tout doit avoir au moins 2 caractères
    if len(theirs_dev) < 2: return False

    return True


def load_canonical():
    out = subprocess.run(
        ['C:/MAMP/bin/mysql/bin/mysql.exe', '-u', 'root', '-proot',
         'quran_wasla', '--default-character-set=utf8mb4', '-B', '-N', '-e',
         'SELECT root_ar,verb_form,voice,past_3ms,present_3ms,imperative_2ms,'
         'masdar,active_participle,passive_participle,source '
         'FROM quran_verb_canonical WHERE voice=\'active\''],
        capture_output=True, text=True, encoding='utf-8'
    )
    rows = []
    for line in out.stdout.splitlines():
        c = line.split('\t')
        if len(c) < 10: continue
        rows.append({
            'root_ar': c[0], 'verb_form': int(c[1]), 'voice': c[2],
            'past_3ms': None if c[3]=='NULL' else c[3],
            'present_3ms': None if c[4]=='NULL' else c[4],
            'imperative_2ms': None if c[5]=='NULL' else c[5],
            'masdar': None if c[6]=='NULL' else c[6],
            'active_participle': None if c[7]=='NULL' else c[7],
            'passive_participle': None if c[8]=='NULL' else c[8],
            'source': c[9],
        })
    return rows


def find_match(sq, canonical):
    sq_past_skel = skel(sq.get('past_3ms'))
    sq_pres_skel = skel(sq.get('present_3ms'))
    sq_root = sq.get('root_ar')
    sq_form = sq.get('form_num')
    if sq_past_skel:
        # priorité aux matches avec form_num qui colle (si dispo)
        if sq_form:
            for r in canonical:
                if (skel(r['past_3ms']) == sq_past_skel
                    and r['verb_form'] == sq_form):
                    return r
        for r in canonical:
            if skel(r['past_3ms']) == sq_past_skel:
                return r
    if sq_pres_skel:
        for r in canonical:
            if skel(r['present_3ms']) == sq_pres_skel:
                return r
    if sq_root and sq_form:
        for r in canonical:
            if r['root_ar'] == sq_root and r['verb_form'] == sq_form:
                return r
    return None


def main():
    print('[1/4] Lecture canonical...')
    canonical = load_canonical()
    print(f'      {len(canonical)} lignes active')

    print('[2/4] Lecture studyquran_truth.json...')
    with open(TRUTH_FILE, 'r', encoding='utf-8') as f:
        truth = json.load(f)
    print(f'      {len(truth)} verbes scrapés')

    print('[3/4] Lecture overrides existants...')
    with open(OVERRIDES_FILE, 'r', encoding='utf-8') as f:
        existing = json.load(f)
    n_existing = sum(1 for k in existing if not k.startswith('_'))
    print(f'      {n_existing} overrides manuels existants')

    print('[4/4] Génération des nouveaux overrides...')
    fields = ['past_3ms', 'present_3ms', 'imperative_2ms', 'masdar',
              'active_participle', 'passive_participle']
    proposals = {}            # key → { field: theirs }
    field_change_count = defaultdict(int)
    n_verbs_affected = 0

    for past, sq in truth.items():
        match = find_match(sq, canonical)
        if not match: continue
        key = f"{match['root_ar']}:{match['verb_form']}:{match['voice']}"
        # Skip si key déjà dans overrides manuels (priorité aux manuels)
        if key in existing and not key.startswith('_'):
            existing_fields = set(existing[key].keys()) - {'comment'}
        else:
            existing_fields = set()

        overrides_for_verb = {}
        for f in fields:
            if f in existing_fields:
                continue                  # déjà géré manuellement, on ne touche pas
            ours = match.get(f)
            theirs = sq.get(f)
            if not theirs: continue       # pas de valeur de référence
            if ours is None: continue     # on ne crée pas un champ NULL→valeur
            if skel(ours) == skel(theirs): continue   # squelette identique
            # Filtres stricts pour rejeter les valeurs studyquran douteuses
            if not value_passes_filters(f, ours, theirs):
                continue
            # Override
            theirs_clean = strip_trailing_tanwin(theirs)
            overrides_for_verb[f] = theirs_clean
            field_change_count[f] += 1

        if overrides_for_verb:
            proposals[key] = overrides_for_verb
            n_verbs_affected += 1

    # Merge avec existing
    merged = dict(existing)
    for key, fields_dict in proposals.items():
        if key in merged:
            # add only missing fields
            for f, v in fields_dict.items():
                merged[key][f] = v
            # Ajoute note auto
            note = ' (+ auto-studyquran)'
            if 'comment' in merged[key] and note not in merged[key]['comment']:
                merged[key]['comment'] += note
        else:
            merged[key] = {**fields_dict, 'comment': 'Auto-généré depuis studyquranarabic.com (Phase 2)'}

    print(f'\n      Verbes affectés : {n_verbs_affected}')
    print(f'      Détail par champ :')
    for f, n in field_change_count.most_common() if hasattr(field_change_count,'most_common') else sorted(field_change_count.items(), key=lambda x:-x[1]):
        print(f'        {f:<22} : {n}')

    # Write
    with open(OVERRIDES_FILE, 'w', encoding='utf-8') as f:
        json.dump(merged, f, ensure_ascii=False, indent=2)
    n_total = sum(1 for k in merged if not k.startswith('_'))
    print(f'\n  → {OVERRIDES_FILE}')
    print(f'  → Total overrides dans le fichier : {n_total} ({n_total - n_existing} nouveaux)')


if __name__ == '__main__':
    main()
