"""
Construit un lexique de masdars pour les verbes Form I sain du Coran,
en croisant les noms du corpus avec la base Arramooz (masdar.csv).

Sources :
  1) Arramooz (linuxscout) — base masdar de référence (7347 entrées MSA)
  2) Corpus du Coran — noms partageant une racine avec un verbe Form I

Stratégie :
  Pour chaque verbe Form I sain du Coran, on cherche en priorité dans
  Arramooz un masdar dont la racine correspond ET dont le verbe d'origine
  est Form I (3 lettres radicales sans préfixe).
  Si rien trouvé → repli sur le scan du corpus (patterns standards).
  Sinon → racine non couverte, laissée NULL.

Sortie :
  - form1_sain_masdars.json (mapping root_ar → masdar_ar)
  - form1_sain_uncovered.txt (racines sans candidat)
"""

import csv, json, os, re, sys
sys.stdout.reconfigure(encoding='utf-8')

HERE = os.path.dirname(__file__)
CORPUS         = os.path.join(HERE, 'quranic-corpus-morphology-0.4.txt')
ARRAMOOZ_CSV   = os.path.join(HERE, 'arramooz_masdar.csv')
OUT_JSON       = os.path.join(HERE, 'form1_sain_masdars.json')
OUT_UNCOVERED  = os.path.join(HERE, 'form1_sain_uncovered.txt')

BUCK = {
    "'": "ء", "|": "آ", ">": "أ", "&": "ؤ", "<": "إ", "}": "ئ",
    "A": "ا", "b": "ب", "p": "ة", "t": "ت", "v": "ث", "j": "ج",
    "H": "ح", "x": "خ", "d": "د", "*": "ذ", "r": "ر", "z": "ز",
    "s": "س", "$": "ش", "S": "ص", "D": "ض", "T": "ط", "Z": "ظ",
    "E": "ع", "g": "غ", "f": "ف", "q": "ق", "k": "ك", "l": "ل",
    "m": "م", "n": "ن", "h": "ه", "w": "و", "Y": "ى", "y": "ي",
    "F": "ً", "N": "ٌ", "K": "ٍ", "a": "َ", "u": "ُ", "i": "ِ",
    "~": "ّ", "o": "ْ", "`": "ٰ", "{": "ٱ", "^": "ٓ", "_": "ـ",
}
def b2a(s): return ''.join(BUCK.get(c, c) for c in s) if s else ''
def root_to_spaced(rb): return ' '.join(b2a(c) for c in rb)

# Pour matcher entre racines de sources différentes, on normalise les hamzas
HAMZA_CLASS = set('ءأإآا')
def normalize_root_for_match(letters_or_str):
    """Renvoie une string clé pour comparer 2 racines (insensible aux variantes hamza).
    Accepte une liste de lettres OU une string 'ا ب ج' OU 'ابج'."""
    if isinstance(letters_or_str, str):
        letters = letters_or_str.replace(' ', '')
    else:
        letters = ''.join(letters_or_str)
    out = []
    for c in letters:
        if c in HAMZA_CLASS: out.append('ء')
        else: out.append(c)
    return ''.join(out)

# ─────────────────────────────────────────────────────────────────────
# 1) Extraction des racines Form I sain depuis le corpus
# ─────────────────────────────────────────────────────────────────────
ROMAN_TO_INT = {'I':1,'II':2,'III':3,'IV':4,'V':5,'VI':6,'VII':7,'VIII':8,'IX':9,'X':10}
FORM_RX = re.compile(r'^\((I|II|III|IV|V|VI|VII|VIII|IX|X)\)$')

def scan_corpus_form1_sain():
    roots = set()
    with open(CORPUS, 'r', encoding='utf-8') as f:
        for line in f:
            if line.startswith('#') or line.startswith('LOCATION') or not line.strip():
                continue
            parts = line.rstrip('\n').split('\t')
            if len(parts) != 4 or parts[2] != 'V': continue
            tags = parts[3].split('|')
            if 'PASS' in tags: continue
            root = None
            form_num = 1
            for t in tags:
                if t.startswith('ROOT:'): root = t[5:]
                else:
                    m = FORM_RX.match(t)
                    if m: form_num = ROMAN_TO_INT[m.group(1)]
            if not root or form_num != 1 or len(root) < 3: continue
            r1, r2, r3 = root[0], root[1], root[2]
            if r2 in 'wyA' or r3 in 'wyA' or r2 == r3: continue
            roots.add(root)
    return roots

# ─────────────────────────────────────────────────────────────────────
# 2) Lecture Arramooz masdar.csv → map root → liste de masdars Form I
# ─────────────────────────────────────────────────────────────────────
def looks_like_form1_origin(verb_arabic):
    """Filtre Form I via le verbe d'origine : doit avoir 3 consonnes
    sans préfixe Form II-X (ت, اِسْت, اِنْ, etc.) ni shadda (qui
    marque Form II)."""
    if not verb_arabic: return False
    # Pas de shadda → exclut Form II (فَعَّلَ) et Form V (تَفَعَّلَ)
    if 'ّ' in verb_arabic: return False
    # 3 consonnes exactement
    consonants = re.sub(r'[ً-ٰٟـ]', '', verb_arabic)
    if len(consonants) != 3: return False
    # Pas de préfixe ت (Form II/V/VI) ou ا/اِسْت/اِنْ (VII/VIII/X)
    # Form I peut commencer par أ/ا quand R1=hamza (أَمَرَ, أَكَلَ...)
    first = consonants[0]
    if first == 'ت': return False
    return True

# Patrons Form I masdars : la forme citationnelle doit commencer par R1
# (pas par ت, مُ, إِ, اِ — qui marquent les Forms II-X). On rejette aussi
# مَ/مِ qui sont typiques des noms de lieu (مَجْلِس) ou pluriels brisés
# (مَفَاعِل) plutôt que des masdars Form I.
FORM_NON1_MASDAR_PREFIXES = ('تَ', 'مُ', 'إِ', 'اِ', 'مَ', 'مِ')

def is_form1_masdar_pattern(masdar_ar):
    """Vrai si le masdar correspond à un patron Form I (rejette les masdars
    de Forms II-X qui ont des préfixes morphologiques distinctifs)."""
    if not masdar_ar: return False
    # On enlève le tanwin damma final si présent (ٌ)
    base = masdar_ar.rstrip('ٌ').rstrip()
    for prefix in FORM_NON1_MASDAR_PREFIXES:
        if base.startswith(prefix):
            return False
    return True

def load_arramooz_masdars():
    """Renvoie un dict normalized_root (str) → liste de (masdar_ar, origin_verb).
    Double filtre : (1) le verbe d'origine ressemble à Form I, (2) le masdar
    lui-même ne commence pas par un préfixe morphologique de Form II-X."""
    by_root = {}
    with open(ARRAMOOZ_CSV, 'r', encoding='utf-8') as f:
        reader = csv.reader(f, delimiter='\t')
        for i, row in enumerate(reader):
            if i == 0 or len(row) < 7: continue
            masdar = row[1].strip()
            root   = row[3].strip()
            type_  = row[5].strip() if len(row) > 5 else ''
            origin = row[6].strip() if len(row) > 6 else ''
            if 'مصدر' not in type_: continue
            if not looks_like_form1_origin(origin): continue
            if not is_form1_masdar_pattern(masdar): continue   # filtre patron
            key = normalize_root_for_match(root)
            by_root.setdefault(key, []).append((masdar, origin))
    return by_root

# ─────────────────────────────────────────────────────────────────────
# 3) Construction du lexique final
# ─────────────────────────────────────────────────────────────────────
def scan_corpus_nouns():
    """Renvoie dict root_buck → dict(lemma_buck → count) pour tous les noms du Coran."""
    by_root = {}
    with open(CORPUS, 'r', encoding='utf-8') as f:
        for line in f:
            if line.startswith('#') or line.startswith('LOCATION') or not line.strip():
                continue
            parts = line.rstrip('\n').split('\t')
            if len(parts) != 4 or parts[2] != 'N': continue
            tags = parts[3].split('|')
            root = lemma = None
            for t in tags:
                if t.startswith('ROOT:'): root = t[5:]
                elif t.startswith('LEM:'): lemma = t[4:]
            if not root or not lemma: continue
            by_root.setdefault(root, {})
            by_root[root][lemma] = by_root[root].get(lemma, 0) + 1
    return by_root

# Patrons stricts de masdar Form I (Buckwalter) — pour le fallback corpus
MASDAR_PATTERNS_BUCK = [
    '{R1}a{R2}o{R3}',    '{R1}a{R2}o{R3}ap',         # فَعْل, فَعْلَة
    '{R1}i{R2}o{R3}',    '{R1}i{R2}o{R3}ap',         # فِعْل
    '{R1}u{R2}o{R3}',    '{R1}u{R2}o{R3}ap',         # فُعْل
    '{R1}a{R2}a{R3}',    '{R1}a{R2}a{R3}ap',         # فَعَل
    '{R1}u{R2}uw{R3}',   '{R1}u{R2}uw{R3}ap',        # فُعُول
    '{R1}i{R2}aA{R3}',   '{R1}i{R2}aA{R3}ap',        # فِعَال
    '{R1}a{R2}aA{R3}ap',                              # فَعَالَة
    '{R1}u{R2}aA{R3}',   '{R1}u{R2}aA{R3}ap',        # فُعَال
]
def fallback_corpus_masdar(root_buck, nouns_by_root):
    """Cherche un nom du corpus dont le patron correspond à un masdar Form I."""
    if len(root_buck) < 3: return None
    nouns = nouns_by_root.get(root_buck, {})
    if not nouns: return None
    r1, r2, r3 = root_buck[0], root_buck[1], root_buck[2]
    expected = set(p.replace('{R1}', r1).replace('{R2}', r2).replace('{R3}', r3)
                   for p in MASDAR_PATTERNS_BUCK)
    def norm(s): return (s.replace('`', 'aA').replace('at', 'ap')
                         if s.endswith('at') else s.replace('`', 'aA'))
    best = None; best_count = -1
    for lemma_buck, count in nouns.items():
        if norm(lemma_buck) in expected and count > best_count:
            best = lemma_buck; best_count = count
    return b2a(best) + 'ٌ' if best else None  # ajoute tanwin damma

def main():
    print('[1/4] Scan du corpus du Coran (verbes Form I)...')
    quran_roots = scan_corpus_form1_sain()
    print(f'      {len(quran_roots)} racines Form I active sain')

    print('\n[2/4] Lecture Arramooz...')
    arramooz_by_root = load_arramooz_masdars()
    print(f'      {len(arramooz_by_root)} racines Form I avec masdar dans Arramooz')

    print('\n[3/4] Scan du corpus du Coran (noms, pour fallback)...')
    nouns_by_root = scan_corpus_nouns()
    print(f'      {len(nouns_by_root)} racines avec noms dans le Coran')

    print('\n[4/4] Croisement et écriture...')
    found = {}
    found_source = {}
    uncovered = []
    for root_buck in sorted(quran_roots):
        root_ar = root_to_spaced(root_buck)
        key = normalize_root_for_match([b2a(c) for c in root_buck])
        # Priorité 1 : Arramooz
        candidates = arramooz_by_root.get(key, [])
        if candidates:
            found[root_ar] = candidates[0][0]
            found_source[root_ar] = 'arramooz'
            continue
        # Priorité 2 : nom du Coran matchant un patron Form I
        fb = fallback_corpus_masdar(root_buck, nouns_by_root)
        if fb:
            found[root_ar] = fb
            found_source[root_ar] = 'corpus'
            continue
        uncovered.append(root_ar)
    n_arr = sum(1 for v in found_source.values() if v == 'arramooz')
    n_cor = sum(1 for v in found_source.values() if v == 'corpus')
    print(f'      Masdars trouvés : {len(found)} / {len(quran_roots)} '
          f'({100*len(found)/len(quran_roots):.0f}%)')
    print(f'        - depuis Arramooz : {n_arr}')
    print(f'        - depuis corpus   : {n_cor}')
    print(f'      Non couvertes : {len(uncovered)}')

    with open(OUT_JSON, 'w', encoding='utf-8') as f:
        json.dump(found, f, ensure_ascii=False, indent=2, sort_keys=True)
    with open(OUT_UNCOVERED, 'w', encoding='utf-8') as f:
        for r in uncovered: f.write(r + '\n')
    print(f'      ✓ {OUT_JSON}')
    print(f'      ✓ {OUT_UNCOVERED}')

    print('\nAperçu des 15 premiers masdars trouvés :')
    for k in list(found.keys())[:15]:
        print(f'  {k:<10} → {found[k]}')

    if uncovered:
        print('\nAperçu des 15 premières racines non couvertes :')
        for r in uncovered[:15]:
            print(f'  {r}')

if __name__ == '__main__':
    main()
