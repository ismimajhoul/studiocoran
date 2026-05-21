"""
Enrichit la table quran_verb_canonical avec :
  • Conjugaisons (passé, présent, impératif) — calculées par Qutrub
  • Masdar — calculé par template pour Forms II-X, NULL pour Form I
    (Qutrub ne fournit pas le masdar — c'est purement un conjugateur.
     Form I a un masdar irrégulier par verbe, dictionnaire externe nécessaire.)

PRÉ-REQUIS :
    git clone https://github.com/linuxscout/qutrub.git  c:/MAMP/htdocs/qutrub
    pip install pyarabic

LANCE :
    python enrich_with_qutrub.py
"""

import os, re, sys
sys.stdout.reconfigure(encoding='utf-8')

QUTRUB_PATH = r'c:\MAMP\htdocs\qutrub'
HERE = os.path.dirname(__file__)
INPUT_CORPUS = os.path.join(HERE, 'quranic-corpus-morphology-0.4.txt')
SCHEMA_FILE  = os.path.join(HERE, 'schema_canonical.sql')
OUTPUT_FILE  = os.path.join(HERE, 'quran_verb_canonical.sql')

if not os.path.isdir(QUTRUB_PATH):
    print(f"ERREUR : QUTRUB_PATH n'existe pas → {QUTRUB_PATH}")
    sys.exit(1)
sys.path.insert(0, QUTRUB_PATH)

from libqutrub.conjugator import conjugate as qutrub_conjugate

# ─────────────────────────────────────────────────────────────────────
# Constantes Qutrub
# ─────────────────────────────────────────────────────────────────────
FATHA, DAMMA, KASRA = 'َ', 'ُ', 'ِ'
KEY_PAST_ACTIVE  = 'الماضي المعلوم'
KEY_PRES_ACTIVE  = 'المضارع المعلوم'
KEY_PAST_PASSIVE = 'الماضي المجهول'
KEY_PRES_PASSIVE = 'المضارع المجهول'
KEY_IMPERATIVE   = 'الأمر'
PRON_3MS = 'هو'
PRON_2MS = 'أنت'

# ─────────────────────────────────────────────────────────────────────
# Buckwalter → Unicode
# ─────────────────────────────────────────────────────────────────────
BUCK_TO_AR = {
    "'": "ء", "|": "آ", ">": "أ", "&": "ؤ", "<": "إ", "}": "ئ",
    "A": "ا", "b": "ب", "p": "ة", "t": "ت", "v": "ث", "j": "ج",
    "H": "ح", "x": "خ", "d": "د", "*": "ذ", "r": "ر", "z": "ز",
    "s": "س", "$": "ش", "S": "ص", "D": "ض", "T": "ط", "Z": "ظ",
    "E": "ع", "g": "غ",
    "f": "ف", "q": "ق", "k": "ك", "l": "ل", "m": "م", "n": "ن",
    "h": "ه", "w": "و", "Y": "ى", "y": "ي",
    "F": "ً", "N": "ٌ", "K": "ٍ",
    "a": "َ", "u": "ُ", "i": "ِ",
    "~": "ّ", "o": "ْ",
    "`": "ٰ", "{": "ٱ", "^": "ٓ", "_": "ـ",
}
def buck_to_ar(s):
    return ''.join(BUCK_TO_AR.get(c, c) for c in s) if s else None
def root_to_spaced(buck_root):
    return ' '.join(buck_to_ar(c) for c in buck_root) if buck_root else None

# ─────────────────────────────────────────────────────────────────────
# Parsing du corpus
# ─────────────────────────────────────────────────────────────────────
ROMAN_TO_INT = {'I':1,'II':2,'III':3,'IV':4,'V':5,'VI':6,'VII':7,'VIII':8,'IX':9,'X':10}
FORM_RX = re.compile(r'^\((I|II|III|IV|V|VI|VII|VIII|IX|X)\)$')

def extract_unique_verbs(path):
    """Renvoie {(root_ar, verb_form, voice): lemma_buckwalter}."""
    seen = {}
    with open(path, 'r', encoding='utf-8') as f:
        for line in f:
            if line.startswith('#') or line.startswith('LOCATION') or not line.strip():
                continue
            parts = line.rstrip('\n').split('\t')
            if len(parts) != 4 or parts[2] != 'V':
                continue
            root, lemma, form_num, voice = None, None, 1, 'active'
            for p in parts[3].split('|'):
                if   p.startswith('ROOT:'): root  = p[5:]
                elif p.startswith('LEM:'):  lemma = p[4:]
                elif p == 'PASS':           voice = 'passive'
                else:
                    m = FORM_RX.match(p)
                    if m: form_num = ROMAN_TO_INT[m.group(1)]
            if not root: continue
            key = (root_to_spaced(root), form_num, voice)
            if key not in seen:
                seen[key] = lemma
    return seen

# ─────────────────────────────────────────────────────────────────────
# Détection future_type — basée sur les données réelles du corpus.
#
# Pour Form I sain (ex: فعل, كتب, ضرب), la voyelle de R2 au présent
# (qui détermine le wazn يَفْعُلُ / يَفْعِلُ / يَفْعَلُ) est LEXICALE — pas
# de règle générale. Plutôt que de deviner, on l'EXTRAIT directement
# d'une occurrence IMPF du verbe dans le Coran.
#
# Si la racine n'apparaît jamais au présent dans le Coran → on retombe
# sur l'heuristique (damma par défaut).
# ─────────────────────────────────────────────────────────────────────
HARAKA_BY_VOWEL = {'a': FATHA, 'u': DAMMA, 'i': KASRA}

def build_root_vowel_map(corpus_path):
    """Pour chaque racine Form I, détecte la voyelle de R2 au présent à
    partir d'une occurrence IMPF dans le corpus. Renvoie {root_ar: 'a'|'u'|'i'}.
    Ignore les racines creuses (R2 faible) où la détection ne s'applique pas."""
    vowel_map = {}
    with open(corpus_path, 'r', encoding='utf-8') as f:
        for line in f:
            if line.startswith('#') or line.startswith('LOCATION') or not line.strip():
                continue
            parts = line.rstrip('\n').split('\t')
            if len(parts) != 4 or parts[2] != 'V':
                continue
            _loc, form_buck, _tag, features = parts
            tags = features.split('|')
            if 'IMPF' not in tags: continue
            # Ignore les formes passives : R2 porte systématiquement fatha au passif
            # (يُؤْخَذُ → 'a'), ce qui fausse la détection pour des racines comme أخذ
            # dont la 1re occurrence IMPF dans le corpus est passive.
            if 'PASS' in tags: continue
            # Form I uniquement (pas de (II), (III), etc.)
            form_num = 1
            for t in tags:
                m = FORM_RX.match(t)
                if m: form_num = ROMAN_TO_INT[m.group(1)]; break
            if form_num != 1: continue
            # Récupère ROOT
            root_buck = None
            for t in tags:
                if t.startswith('ROOT:'): root_buck = t[5:]; break
            if not root_buck or len(root_buck) < 3: continue
            # Racines avec R2 faible (w/y/A) : pas concernées par cette détection
            r2_buck = root_buck[1]
            if r2_buck in 'wyA': continue
            # Détection : trouver R2 dans la forme, voyelle juste après
            idx = form_buck.find(r2_buck, 1)
            if idx < 0 or idx + 1 >= len(form_buck): continue
            next_c = form_buck[idx + 1]
            if next_c not in 'aui': continue
            root_ar = root_to_spaced(root_buck)
            # Ne pas écraser une détection précédente (1re occurrence gagne)
            if root_ar not in vowel_map:
                vowel_map[root_ar] = next_c
    return vowel_map

# Map construite au premier appel (ne dépend que du corpus)
_ROOT_VOWEL_MAP = None
def _get_vowel_map():
    global _ROOT_VOWEL_MAP
    if _ROOT_VOWEL_MAP is None:
        _ROOT_VOWEL_MAP = build_root_vowel_map(INPUT_CORPUS)
    return _ROOT_VOWEL_MAP

def guess_future_type(root_letters, root_ar=None):
    """Choix de la haraka du ع du مضارع pour Form I.
    Priorité : (1) donnée corpus si disponible, (2) heuristique sur weak letters."""
    # 1. Donnée corpus — pour Form I sain principalement
    if root_ar:
        vm = _get_vowel_map()
        if root_ar in vm:
            return HARAKA_BY_VOWEL[vm[root_ar]]
    # 2. Heuristique pour creux/défectueux (R2 ou R3 faible)
    if len(root_letters) >= 2:
        r2 = root_letters[1]
        if r2 == 'و': return DAMMA   # creux و → يَفُولُ
        if r2 == 'ي': return KASRA   # creux ي → يَفِيلُ
    if len(root_letters) >= 3:
        r3 = root_letters[2]
        if r3 == 'ي': return KASRA   # défectueux ي → يَرْمِي
    return DAMMA  # défaut le plus commun

# ─────────────────────────────────────────────────────────────────────
# Normalisation racine — le corpus encode les hamza initiales/finales
# avec ا (alif), mais Qutrub a besoin du caractère hamza réel (أ).
#   ا م ر  → أ م ر     (root أمر "ordonner")
#   ق ر ا  → ق ر أ     (root قرأ "lire")
# ─────────────────────────────────────────────────────────────────────
def normalize_root_for_qutrub(root_letters):
    fixed = list(root_letters)
    # R1=ا → أ : hamza initiale (ر-أ-ي codé "ا ر ي")
    if len(fixed) >= 1 and fixed[0] == 'ا': fixed[0] = 'أ'
    # R2=ا → ء : hamza médiane (ر-ء-ي codé "ر ا ي", س-ء-ل codé "س ا ل")
    if len(fixed) >= 2 and fixed[1] == 'ا': fixed[1] = 'ء'
    # R3=ا → أ : hamza finale (rare)
    if len(fixed) >= 3 and fixed[2] == 'ا': fixed[2] = 'أ'
    return fixed

# ─────────────────────────────────────────────────────────────────────
# Construction de la forme passée pour Form I (input à Qutrub)
# Ordre des cas (du plus spécifique au plus général) :
#   1. Géminé (R2=R3) : دَلَّ, شَدَّ, حَيَّ → shadda sur R2
#   2. Lafif (R2 ET R3 faibles) : شَوَى, نَوَى → R2 reste, R3 → ا/ى
#   3. Creux (R2 faible) : قَالَ, كَادَ → R2 disparaît, remplacé par ا
#   4. Défectueux (R3 faible) : بَلَا, رَمَى → R3 → ا/ى
#   5. Sain : كَتَبَ → pattern standard
# ─────────────────────────────────────────────────────────────────────
def build_form1_past(root_letters):
    if len(root_letters) < 3: return None
    rl = normalize_root_for_qutrub(root_letters)
    r1, r2, r3 = rl[:3]
    r2_weak = r2 in ('و', 'ي')
    r3_weak = r3 in ('و', 'ي')
    # 1. Géminé : R2 = R3 → shadda
    if r2 == r3:
        return f'{r1}َ{r2}َّ'                          # دَلَّ, حَيَّ
    # 2. Lafif : R2 et R3 tous deux faibles, R2 reste comme voyelle longue
    if r2_weak and r3_weak:
        last = 'ى' if r3 == 'ي' else 'ا'
        return f'{r1}َ{r2}َ{last}'                     # شَوَى, نَوَى, رَوَى
    # 3. Creux : R2 disparaît, remplacé par ا
    if r2_weak:
        return f'{r1}َا{r3}َ'                          # قَالَ, كَادَ
    # 4. Défectueux : R3 final transformé
    if r3 == 'و':
        return f'{r1}َ{r2}َا'                          # بَلَا
    if r3 == 'ي':
        return f'{r1}َ{r2}َى'                          # رَمَى, نَأَى
    # 5. Sain
    return f'{r1}َ{r2}َ{r3}َ'                          # كَتَبَ

# ─────────────────────────────────────────────────────────────────────
# Normalisation du lemme pour Qutrub (Forms II-X)
# Le corpus encode parfois l'alif madda comme >aA (= أَا), il faut le
# remettre en آ (alif madda standard) pour que Qutrub reconnaisse.
# ─────────────────────────────────────────────────────────────────────
def normalize_lemma_for_qutrub(arabic_lemma):
    if not arabic_lemma: return arabic_lemma
    return arabic_lemma.replace('أَا', 'آ').replace('اَا', 'آ')

# ─────────────────────────────────────────────────────────────────────
# Templates de construction du passé 3MS pour les Forms II-X.
# Gère 3 cas : sain (par défaut), creux (R2 = و/ي), défectueux (R3 = و/ي).
#
# RÈGLES :
#   • Creux (أجوف) — Forms IV, VII, VIII, X uniquement :
#       la radicale faible R2 disparaît, remplacée par ا.
#       ex: ق-و-م F4 : أَنْزَلَ → أَقَامَ  ;  ع-و-ن F10 : → اِسْتَعَانَ
#       (Forms II, V : shadda sur R2, hollow ne s'applique pas)
#       (Forms III, VI : alif déjà après R1, hollow ne s'applique pas)
#   • Défectueux — toutes Forms II-X :
#       R3=و avec fatha finale → ا  ;  R3=ي avec fatha finale → ى
#       ex: ر-م-ي F2 : رَمَّى ; ع-ط-و F4 : أَعْطَى
# ─────────────────────────────────────────────────────────────────────
FORM_PAST_TEMPLATE_SAIN = {
    2:  '{R1}َ{R2}َّ{R3}َ',          # فَعَّلَ
    3:  '{R1}َا{R2}َ{R3}َ',          # فَاعَلَ
    4:  'أَ{R1}ْ{R2}َ{R3}َ',         # أَفْعَلَ
    5:  'تَ{R1}َ{R2}َّ{R3}َ',         # تَفَعَّلَ
    6:  'تَ{R1}َا{R2}َ{R3}َ',         # تَفَاعَلَ
    7:  'اِنْ{R1}َ{R2}َ{R3}َ',        # اِنْفَعَلَ
    8:  'اِ{R1}ْتَ{R2}َ{R3}َ',        # اِفْتَعَلَ
    9:  'اِ{R1}ْ{R2}َ{R3}َّ',         # اِفْعَلَّ
    10: 'اِسْتَ{R1}ْ{R2}َ{R3}َ',      # اِسْتَفْعَلَ
}
# Templates spécifiques pour les verbes CREUX (R2 = و/ي) — R2 disparaît,
# remplacé par ا. Seules les Forms IV, VII, VIII, X subissent ce changement.
FORM_PAST_TEMPLATE_HOLLOW = {
    4:  'أَ{R1}َا{R3}َ',              # أَقَامَ
    7:  'اِنْ{R1}َا{R3}َ',             # اِنْقَادَ
    8:  'اِ{R1}ْتَا{R3}َ',             # اِخْتَارَ
    10: 'اِسْتَ{R1}َا{R3}َ',           # اِسْتَعَانَ
}

def _apply(tpl, r1, r2, r3):
    return tpl.replace('{R1}', r1).replace('{R2}', r2).replace('{R3}', r3)

def _fix_defective_last(past_form, r3):
    """R3=و/ي avec fatha/sukun finale → ى pour les Forms II-X.
    Note: utilisé seulement pour Forms II-X. Form I est gérée directement
    dans build_form1_past avec la règle و→ا, ي→ى (différente).
    Pour Forms II-X la convention orthographique est: toujours ى final
    quelle que soit la radicale faible (نَادَى de ن-د-و, لَاقَى de ل-ق-ي)."""
    if r3 == 'و':
        if past_form.endswith('وَ'): return past_form[:-2] + 'ى'
        if past_form.endswith('وْ'): return past_form[:-2] + 'ى'
    if r3 == 'ي':
        if past_form.endswith('يَ'): return past_form[:-2] + 'ى'
        if past_form.endswith('يْ'): return past_form[:-2] + 'ى'
    return past_form

# ─────────────────────────────────────────────────────────────────────
# Form VIII (اِفْتَعَلَ) — assimilation phonétique du ت du pattern selon R1
#   R1 ∈ {د, ذ}    : ت → د avec shadda          → اِدَّكَرَ (root ذكر)
#   R1 = ز          : ت → د                      → اِزْدَجَرَ
#   R1 ∈ {ص, ض}    : ت → ط emphatique           → اِصْطَبَرَ, اِضْطَرَّ
#   R1 = ط          : ت → ط avec shadda         → اِطَّلَعَ
#   R1 = ظ          : ت → ط                      → اِظْطَ-
#   R1 ∈ {ت, و, ي}  : ت → ت avec shadda         → اِتَّبَعَ, اِتَّقَى
#   autres          : pattern standard اِ{R1}ْتَ
# ─────────────────────────────────────────────────────────────────────
def _form8_prefix(r1):
    if r1 in ('د', 'ذ'):     return 'اِدَّ'
    if r1 == 'ز':             return 'اِزْدَ'
    if r1 in ('ص', 'ض'):     return f'اِ{r1}ْطَ'
    if r1 == 'ط':             return 'اِطَّ'
    if r1 == 'ظ':             return 'اِظْطَ'
    if r1 in ('ت', 'و', 'ي'): return 'اِتَّ'
    return f'اِ{r1}ْتَ'

def build_form8_past(r1, r2, r3):
    prefix = _form8_prefix(r1)
    r2_weak    = r2 in ('و', 'ي')
    r3_weak    = r3 in ('و', 'ي')
    is_geminate = (r2 == r3)
    is_lafif    = r2_weak and r3_weak
    # Géminé prioritaire : اِضْطَرَّ
    if is_geminate:
        past = f'{prefix}{r2}َّ'
    # Lafif : R2 reste comme voyelle longue, R3 → ى
    elif is_lafif:
        past = f'{prefix}{r2}َى'      # اِسْتَوَى (mais Form X — adapter pour F8)
        # Pour F8 Lafif comme س-و-ي : اِسْتَوَى — déjà bon
    # Creux : R2 disparaît → ا
    elif r2_weak:
        past = f'{prefix}ا{r3}َ'      # اِصْطَادَ
    else:
        past = f'{prefix}{r2}َ{r3}َ'  # اِصْطَنَعَ, اِدَّكَرَ
    return _fix_defective_last(past, r3) if not is_geminate else past

def build_form_n_past(verb_form, root_letters):
    if len(root_letters) < 3: return None
    rl = normalize_root_for_qutrub(root_letters)
    r1, r2, r3 = rl[:3]
    r2_weak    = r2 in ('و', 'ي')
    r3_weak    = r3 in ('و', 'ي')
    is_hollow  = r2_weak
    is_lafif   = r2_weak and r3_weak
    is_geminate = (r2 == r3)

    # Form VIII : assimilation phonétique → handler dédié
    if verb_form == 8:
        return build_form8_past(r1, r2, r3)

    # 1. Lafif (R2 et R3 faibles) AVANT géminé : pour Forms II-X, la règle
    # Lafif prime même si R2=R3. Ex: ح-ي-ي F10 → اِسْتَحْيَى (pas اِسْتَحَيَّ).
    if is_lafif:
        tpl = FORM_PAST_TEMPLATE_SAIN.get(verb_form)
        if not tpl: return None
        past = _apply(tpl, r1, r2, r3)
        return _fix_defective_last(past, r3)

    # 2. Géminé (R2=R3 consonnes fortes) pour Forms IV, VII, X
    if is_geminate and verb_form in (4, 7, 10):
        prefix_map = {4: f'أَ{r1}َ', 7: f'اِنْ{r1}َ', 10: f'اِسْتَ{r1}َ'}
        return f'{prefix_map[verb_form]}{r2}َّ'        # أَشَدَّ, اِسْتَدَلَّ

    # 3. Creux (R2 faible uniquement)
    if is_hollow and verb_form in FORM_PAST_TEMPLATE_HOLLOW:
        past = _apply(FORM_PAST_TEMPLATE_HOLLOW[verb_form], r1, r2, r3)
    else:
        tpl = FORM_PAST_TEMPLATE_SAIN.get(verb_form)
        if not tpl: return None
        past = _apply(tpl, r1, r2, r3)
    return _fix_defective_last(past, r3)

# ─────────────────────────────────────────────────────────────────────
# Correction orthographique : hamza médiane (ء) entre deux fathas s'écrit
# sur alif → أ. Ex: نَءَى (généré) → نَأَى (correct).
# Appliqué après construction du verbe avant de passer à Qutrub.
# ─────────────────────────────────────────────────────────────────────
import re
_HAMZA_FATHA_RX = re.compile(r'(.)َء(.)')
def fix_hamza_orthography(s):
    if not s: return s
    return _HAMZA_FATHA_RX.sub(r'\1َأ\2', s)

# ─────────────────────────────────────────────────────────────────────
# Templates masdar pour Forms II-X — variantes sain / creux
# ─────────────────────────────────────────────────────────────────────
MASDAR_TEMPLATE_SAIN = {
    1:  None,                          # Form I masdar = irrégulier (dictionnaire)
    2:  'تَ{R1}ْ{R2}ِي{R3}',           # تَنْزِيل
    3:  'مُ{R1}َا{R2}َ{R3}َة',          # مُحَاوَلَة
    4:  'إِ{R1}ْ{R2}َا{R3}',            # إِنْزَال
    5:  'تَ{R1}َ{R2}ُّ{R3}',           # تَكَبُّر
    6:  'تَ{R1}َا{R2}ُ{R3}',           # تَنَافُس
    7:  'اِنْ{R1}ِ{R2}َا{R3}',          # اِنْكِسَار
    8:  'اِ{R1}ْتِ{R2}َا{R3}',          # اِجْتِمَاع
    9:  'اِ{R1}ْ{R2}ِ{R3}َا{R3}',       # اِحْمِرَار
    10: 'اِسْتِ{R1}ْ{R2}َا{R3}',        # اِسْتِخْرَاج
}
# Pour les creux, R2 disparaît et est remplacé par ا (ou rien selon le pattern)
MASDAR_TEMPLATE_HOLLOW = {
    4:  'إِ{R1}َا{R3}َة',               # إِقَامَة, إِجَابَة
    10: 'اِسْتِ{R1}َا{R3}َة',           # اِسْتِقَامَة, اِسْتِعَانَة
    # Form 7 hollow : اِنْقِيَاد (ي surgit), 8 hollow : اِخْتِيَار — moins fréquents
}
# Lexique des masdars Form I sain (constuit par build_form1_masdars.py
# à partir d'Arramooz + fallback corpus). Chargé au démarrage du script.
import json as _json
_FORM1_MASDAR_LEXICON = None
def _get_form1_lexicon():
    global _FORM1_MASDAR_LEXICON
    if _FORM1_MASDAR_LEXICON is None:
        lex_path = os.path.join(HERE, 'form1_sain_masdars.json')
        if os.path.exists(lex_path):
            with open(lex_path, 'r', encoding='utf-8') as f:
                _FORM1_MASDAR_LEXICON = _json.load(f)
        else:
            _FORM1_MASDAR_LEXICON = {}
    return _FORM1_MASDAR_LEXICON

def compute_masdar(root_letters, verb_form, root_ar=None):
    if len(root_letters) < 3: return None
    rl = normalize_root_for_qutrub(root_letters)
    r1, r2, r3 = rl[:3]
    is_hollow = r2 in ('و', 'ي')
    is_defective = r3 in ('و', 'ي')
    # Form I :
    #   - Sain      : lexique Arramooz/corpus (form1_sain_masdars.json) en
    #                 priorité ; sinon NULL (irrégulier sans dictionnaire).
    #   - Creux     : template فَعْل (كَيْد, قَوْل, بَيْع)
    #   - Défectueux: template فَعْل approximatif (رَمْي, جَرْي, دَعْو)
    if verb_form == 1:
        if not is_hollow and not is_defective:
            # Form I sain — chercher dans le lexique
            lex = _get_form1_lexicon()
            if root_ar and root_ar in lex:
                return lex[root_ar]
            return None
        # Creux ou défectueux : template
        return f'{r1}َ{r2}ْ{r3}'
    if is_hollow and verb_form in MASDAR_TEMPLATE_HOLLOW:
        tpl = MASDAR_TEMPLATE_HOLLOW[verb_form]
    else:
        tpl = MASDAR_TEMPLATE_SAIN.get(verb_form)
    if not tpl: return None
    return _fix_defective_nominal(_apply(tpl, r1, r2, r3), r3, 'masdar')

# ─────────────────────────────────────────────────────────────────────
# Participes — اسم الفاعل (actif) et اسم المفعول (passif)
# Templates standards (sain). Pour les racines weak, on accepte une
# légère imperfection en V1.
# ─────────────────────────────────────────────────────────────────────
ACTIVE_PARTICIPLE_TEMPLATE = {
    1:  '{R1}َا{R2}ِ{R3}',         # كَاتِب
    2:  'مُ{R1}َ{R2}ِّ{R3}',        # مُعَلِّم
    3:  'مُ{R1}َا{R2}ِ{R3}',        # مُجَاهِد
    4:  'مُ{R1}ْ{R2}ِ{R3}',         # مُسْلِم
    5:  'مُتَ{R1}َ{R2}ِّ{R3}',      # مُتَعَلِّم
    6:  'مُتَ{R1}َا{R2}ِ{R3}',      # مُتَعَاوِن
    7:  'مُنْ{R1}َ{R2}ِ{R3}',       # مُنْكَسِر
    8:  'مُ{R1}ْتَ{R2}ِ{R3}',       # مُجْتَهِد
    9:  'مُ{R1}ْ{R2}َ{R3}ّ',        # مُحْمَرّ
    10: 'مُسْتَ{R1}ْ{R2}ِ{R3}',     # مُسْتَخْرِج
}
PASSIVE_PARTICIPLE_TEMPLATE = {
    1:  'مَ{R1}ْ{R2}ُو{R3}',        # مَكْتُوب
    2:  'مُ{R1}َ{R2}َّ{R3}',         # مُعَلَّم
    3:  'مُ{R1}َا{R2}َ{R3}',         # مُجَاهَد
    4:  'مُ{R1}ْ{R2}َ{R3}',          # مُسْلَم
    5:  'مُتَ{R1}َ{R2}َّ{R3}',       # مُتَعَلَّم
    6:  'مُتَ{R1}َا{R2}َ{R3}',       # مُتَعَاوَن
    7:  'مُنْ{R1}َ{R2}َ{R3}',        # مُنْكَسَر
    8:  'مُ{R1}ْتَ{R2}َ{R3}',        # مُجْتَهَد
    9:  None,                        # rare
    10: 'مُسْتَ{R1}ْ{R2}َ{R3}',      # مُسْتَخْرَج
}
# Variantes pour racines CREUSES (R2 = و/ي)
ACTIVE_PARTICIPLE_TEMPLATE_HOLLOW = {
    1:  '{R1}َائِ{R3}',              # قَائِل (R2=و), كَائِد (R2=ي)
    4:  'مُ{R1}ِي{R3}',              # مُقِيم (root q-w-m F4)
    10: 'مُسْتَ{R1}ِي{R3}',          # مُسْتَعِين
}
PASSIVE_PARTICIPLE_TEMPLATE_HOLLOW = {
    # Form I hollow : dépend de R2, géré séparément ci-dessous
    4:  'مُ{R1}َا{R3}',              # مُقَام
    10: 'مُسْتَ{R1}َا{R3}',          # مُسْتَعَان
}
# Corrections morphologiques pour les noms (masdar + participes) avec R3
# faible (و/ي). Les templates produisent une substitution littérale qu'il
# faut ajuster :
#   • Masdar avec taa marbuta : ...وَة / ...يَة → ...اة
#     (Form III : مُنَادَوَة → مُنَادَاة ; Form X : اِسْتِدْعَوَة → اِسْتِدْعَاء/اِسْتِدْعَة)
#   • Participe actif : ...ِو / ...ِي en fin → ...ٍ  (tanwin kasra, R3 absorbé)
#     (مُنَادِو → مُنَادٍ ; هَادِي → هَادٍ)
#   • Participe passif : ...َو / ...َي en fin → ...ًى (tanwin fatha + alif maksura)
#     (مُنَادَو → مُنَادًى ; مَهْدِي → مَهْدِيّ — Form I a sa propre règle)
def _fix_defective_nominal(form, r3, kind):
    """kind ∈ {'masdar', 'active', 'passive'}"""
    if not form or r3 not in ('و', 'ي'):
        return form
    if kind == 'masdar':
        # Form III : ...وَة / ...يَة → ...اة (مُنَادَاة, مُلَاقَاة)
        if form.endswith('وَة'): return form[:-3] + 'اة'
        if form.endswith('يَة'): return form[:-3] + 'اة'
        # Forms IV/VII/VIII/X défectueux : weak letter après long alif → hamza
        # ...او / ...اي → ...اء (إِعْطَاء, اِسْتِعْفَاء, اِنْحِنَاء)
        if form.endswith('او'): return form[:-1] + 'ء'
        if form.endswith('اي'): return form[:-1] + 'ء'
    elif kind == 'active':
        if form.endswith('ِو'): return form[:-2] + 'ٍ'
        if form.endswith('ِي'): return form[:-2] + 'ٍ'
    elif kind == 'passive':
        if form.endswith('َو'): return form[:-2] + 'ًى'
        if form.endswith('َي'): return form[:-2] + 'ًى'
    return form

def compute_active_participle(root_letters, verb_form):
    if len(root_letters) < 3: return None
    rl = normalize_root_for_qutrub(root_letters)
    r1, r2, r3 = rl[:3]
    is_hollow = r2 in ('و', 'ي')
    if is_hollow and verb_form in ACTIVE_PARTICIPLE_TEMPLATE_HOLLOW:
        tpl = ACTIVE_PARTICIPLE_TEMPLATE_HOLLOW[verb_form]
        return _fix_defective_nominal(_apply(tpl, r1, r2, r3), r3, 'active')
    tpl = ACTIVE_PARTICIPLE_TEMPLATE.get(verb_form)
    if not tpl: return None
    return _fix_defective_nominal(_apply(tpl, r1, r2, r3), r3, 'active')

def compute_passive_participle(root_letters, verb_form):
    if len(root_letters) < 3: return None
    rl = normalize_root_for_qutrub(root_letters)
    r1, r2, r3 = rl[:3]
    is_hollow = r2 in ('و', 'ي')
    # Form I creux : R2=و → مَ{R1}ُو{R3} (مَقُول) ; R2=ي → مَ{R1}ِي{R3} (مَبِيع)
    if verb_form == 1 and is_hollow:
        if r2 == 'و': return f'مَ{r1}ُو{r3}'
        if r2 == 'ي': return f'مَ{r1}ِي{r3}'
    # Form I défectueux : R3=و → مَفْعُوّ (مَدْعُوّ) ; R3=ي → مَفْعِيّ (مَرْمِيّ)
    # Règle du "double weak" : le ُو de la voix passive se contracte avec
    # le R3 faible, et on ajoute une shadda.
    if verb_form == 1 and r3 in ('و', 'ي'):
        if r3 == 'و': return f'مَ{r1}ْ{r2}ُوّ'
        if r3 == 'ي': return f'مَ{r1}ْ{r2}ِيّ'
    if is_hollow and verb_form in PASSIVE_PARTICIPLE_TEMPLATE_HOLLOW:
        tpl = PASSIVE_PARTICIPLE_TEMPLATE_HOLLOW[verb_form]
        if tpl: return _fix_defective_nominal(_apply(tpl, r1, r2, r3), r3, 'passive')
    tpl = PASSIVE_PARTICIPLE_TEMPLATE.get(verb_form)
    if not tpl: return None
    return _fix_defective_nominal(_apply(tpl, r1, r2, r3), r3, 'passive')

# ─────────────────────────────────────────────────────────────────────
# Handler spécial : Form IV avec hamza initiale (R1=أ/ا)
# Qutrub ne sait pas conjuguer ces verbes (آتَى, آثَرَ, آذَى, ...) car
# la double hamza أَأْ se contracte en alif madda آ. On calcule manuellement
# via les patrons standards bien connus.
# ─────────────────────────────────────────────────────────────────────
def compute_form4_hamza_initial(root_letters, voice):
    if len(root_letters) < 3: return None
    rl = normalize_root_for_qutrub(root_letters)
    r1, r2, r3 = rl[:3]
    if r1 != 'أ': return None
    if voice == 'active':
        if r3 == 'ي':
            past, pres, impv, masdar = f'آ{r2}َى', f'يُؤْ{r2}ِي', f'آ{r2}ِ',  f'إِي{r2}َاء'
        elif r3 == 'و':
            past, pres, impv, masdar = f'آ{r2}َا', f'يُؤْ{r2}ُو', f'آ{r2}ُ',  f'إِي{r2}َاء'
        else:
            past, pres, impv, masdar = f'آ{r2}َ{r3}َ', f'يُؤْ{r2}ِ{r3}ُ', f'آ{r2}ِ{r3}ْ', f'إِي{r2}َا{r3}'
    else:  # passive
        if r3 in ('ي', 'و'):
            past, pres = f'أُو{r2}ِيَ', f'يُؤْ{r2}َى'
        else:
            past, pres = f'أُو{r2}ِ{r3}َ', f'يُؤْ{r2}َ{r3}ُ'
        impv, masdar = None, None
    # Participes Form IV (hamza initiale) : مُؤْتٍ, مُؤْذٍ pour défectueux,
    # مُؤْثِر pour sain ; passifs : مُؤْتَى, مُؤْذَى, مُؤْثَر
    if r3 in ('ي', 'و'):
        act_part  = f'مُؤْ{r2}ٍ'      # مُؤْتٍ
        pass_part = f'مُؤْ{r2}َى'     # مُؤْتَى
    else:
        act_part  = f'مُؤْ{r2}ِ{r3}'  # مُؤْثِر
        pass_part = f'مُؤْ{r2}َ{r3}'  # مُؤْثَر
    return {
        'past_3ms': past, 'present_3ms': pres,
        'imperative_2ms': impv, 'masdar': masdar,
        'active_participle':  act_part  if voice == 'active' else None,
        'passive_participle': pass_part if voice == 'active' else None,
    }

# ─────────────────────────────────────────────────────────────────────
# Handler spécial : Form IV avec R2=ء (hamza médiane) ET R3 faible.
# Cas spécifique : root ر-ء-ي (codé "rAy" dans le corpus). La hamza R2 est
# absorbée dans la fatha de R1 (الإبدال), et R3 défectueux suit les règles
# normales. Le résultat ressemble fortement à un Form I mais c'est bien IV.
#   أَرَى ("il a montré"), يُرِي ("il montre"), أَرِ ("montre !")
#   إِرَاءَة (masdar), مُرٍ (actif), مُرًى (passif)
# ─────────────────────────────────────────────────────────────────────
def compute_form4_r2hamza_r3weak(root_letters, voice):
    if len(root_letters) < 3: return None
    rl = normalize_root_for_qutrub(root_letters)
    r1, r2, r3 = rl[:3]
    if r2 != 'ء': return None             # R2 doit être hamza
    if r3 not in ('و', 'ي'): return None  # R3 doit être faible
    if voice == 'active':
        if r3 == 'ي':
            past, pres, impv = f'أَ{r1}َى', f'يُ{r1}ِي', f'أَ{r1}ِ'
        else:  # و
            past, pres, impv = f'أَ{r1}َا', f'يُ{r1}ُو', f'أَ{r1}ُ'
        masdar    = f'إِ{r1}َاءَة'           # إِرَاءَة
        act_part  = f'مُ{r1}ٍ'              # مُرٍ
        pass_part = f'مُ{r1}ًى'             # مُرًى
    else:  # passive
        past, pres = f'أُ{r1}ِيَ', f'يُ{r1}َى'
        impv, masdar = None, f'إِ{r1}َاءَة'
        act_part = pass_part = None
    return {
        'past_3ms': past, 'present_3ms': pres,
        'imperative_2ms': impv, 'masdar': masdar,
        'active_participle':  act_part  if voice == 'active' else None,
        'passive_participle': pass_part if voice == 'active' else None,
    }

# ─────────────────────────────────────────────────────────────────────
# Conjugaison via Qutrub
# ─────────────────────────────────────────────────────────────────────
def conjugate_with_qutrub(root_ar, verb_form, voice, lemma_buck):
    """Renvoie un dict des 6 champs canoniques pour ce (root, form, voice)."""
    out = {'past_3ms': None, 'present_3ms': None, 'imperative_2ms': None,
           'masdar': None, 'active_participle': None, 'passive_participle': None,
           '_error': None}

    root_letters = root_ar.split()
    if len(root_letters) < 3:
        out['_error'] = 'racine non-trilitère, ignorée en V1'
        return out

    # ─── CAS SPÉCIAL : Form IV avec R1=hamza (آتَى, آثَرَ, آذَى...) ───
    # Qutrub a une limite documentée sur ces verbes : la double hamza أَأْ
    # devient alif madda آ et Qutrub renvoie None. On bypass via un
    # handler manuel avec les patrons standards.
    rl_norm = normalize_root_for_qutrub(root_letters)
    if verb_form == 4 and len(rl_norm) >= 1 and rl_norm[0] == 'أ':
        special = compute_form4_hamza_initial(root_letters, voice)
        if special:
            return {**out, **special, '_error': None}
    # Form IV avec R2=ء (hamza médiane) ET R3 faible (root ر-ء-ي etc.)
    if verb_form == 4 and len(rl_norm) >= 3 and rl_norm[1] == 'ء' and rl_norm[2] in ('و', 'ي'):
        special = compute_form4_r2hamza_r3weak(root_letters, voice)
        if special:
            return {**out, **special, '_error': None}

    # Verbe à passer à Qutrub.
    if verb_form == 1:
        verb_in = build_form1_past(root_letters)
    else:
        verb_in = build_form_n_past(verb_form, root_letters)
    if not verb_in:
        verb_in = normalize_lemma_for_qutrub(buck_to_ar(lemma_buck))
    if not verb_in:
        out['_error'] = 'impossible de construire le verbe'
        return out
    # Correction orthographique de la hamza médiane (ء → أ entre fathas)
    verb_in = fix_hamza_orthography(verb_in)

    future_type = guess_future_type(root_letters, root_ar)

    def try_qutrub(v):
        if not v or '#' in v or '_' in v: return None
        candidates = [v]
        if 'آ' in v:   candidates.append(v.replace('آ', 'أَا'))
        if 'أَا' in v: candidates.append(v.replace('أَا', 'آ'))
        for cand in candidates:
            try:
                res = qutrub_conjugate(cand, future_type, alltense=True,
                                       transitive=True, display_format='DICT')
                if isinstance(res, dict): return res
            except Exception:
                continue
        return None

    r = try_qutrub(verb_in)
    # Si le template a échoué, essaie le LEM du corpus comme dernier recours
    if not r:
        lemma_ar = normalize_lemma_for_qutrub(buck_to_ar(lemma_buck))
        if lemma_ar and lemma_ar != verb_in:
            r = try_qutrub(lemma_ar)

    if not r:
        out['_error'] = f'qutrub None pour {verb_in!r}'
        return out

    if voice == 'active':
        out['past_3ms']       = r.get(KEY_PAST_ACTIVE,  {}).get(PRON_3MS)
        out['present_3ms']    = r.get(KEY_PRES_ACTIVE,  {}).get(PRON_3MS)
        out['imperative_2ms'] = r.get(KEY_IMPERATIVE,   {}).get(PRON_2MS)
    else:  # passive
        out['past_3ms']       = r.get(KEY_PAST_PASSIVE, {}).get(PRON_3MS)
        out['present_3ms']    = r.get(KEY_PRES_PASSIVE, {}).get(PRON_3MS)
        # Pas d'impératif pour le passif (linguistiquement)

    out['masdar']             = compute_masdar(root_letters, verb_form, root_ar)
    # Participes : calculés via templates (active/passive). Indépendants de
    # la voix du verbe — les deux participes existent pour tout verbe actif.
    if voice == 'active':
        out['active_participle']  = compute_active_participle(root_letters, verb_form)
        out['passive_participle'] = compute_passive_participle(root_letters, verb_form)
    return out

# ─────────────────────────────────────────────────────────────────────
# SQL output
# ─────────────────────────────────────────────────────────────────────
def sql_escape(s):
    if s is None: return 'NULL'
    return "'" + str(s).replace("\\","\\\\").replace("'", "''") + "'"

def main():
    print(f"[1/3] Extraction des verbes uniques...")
    seen = extract_unique_verbs(INPUT_CORPUS)
    print(f"      → {len(seen)} couples (racine, forme, voix)")

    print(f"\n[2/3] Conjugaison via Qutrub...")
    rows = []
    ok, ko = 0, 0
    sample_errors = []
    for i, ((root_ar, vform, voice), lemma_buck) in enumerate(sorted(seen.items())):
        conj = conjugate_with_qutrub(root_ar, vform, voice, lemma_buck)
        if conj['_error']:
            ko += 1
            if len(sample_errors) < 5:
                sample_errors.append((root_ar, vform, voice, conj['_error']))
        else:
            ok += 1
        rows.append({'root_ar': root_ar, 'verb_form': vform, 'voice': voice, **conj})
        if (i + 1) % 200 == 0:
            print(f"      {i+1}/{len(seen)}...")
    print(f"      → {ok} OK, {ko} erreurs")
    # Dump COMPLET des erreurs dans un fichier pour analyse
    err_file = os.path.join(HERE, 'enrich_errors.txt')
    with open(err_file, 'w', encoding='utf-8') as f:
        for r in rows:
            if r.get('_error'):
                f.write(f"{r['root_ar']:10s}  F{r['verb_form']:<2}  {r['voice']:<7}  → {r['_error']}\n")
    print(f"      Liste complète des erreurs : {err_file}")
    for re_ in sample_errors:
        print(f"      ⚠ {re_[0]} F{re_[1]} {re_[2]} : {re_[3]}")

    print(f"\n[3/3] Génération du SQL...")
    with open(SCHEMA_FILE, 'r', encoding='utf-8') as f:
        schema_sql = f.read()
    with open(OUTPUT_FILE, 'w', encoding='utf-8') as out:
        out.write('-- Généré par morphology/enrich_with_qutrub.py\n')
        out.write('-- Source : Quranic Arabic Corpus + Qutrub\n\n')
        out.write(schema_sql)
        out.write('\n\n')
        BATCH = 500
        for i in range(0, len(rows), BATCH):
            chunk = rows[i:i+BATCH]
            out.write('INSERT INTO quran_verb_canonical '
                      '(root_ar, verb_form, voice, past_3ms, present_3ms, '
                      'imperative_2ms, masdar, active_participle, '
                      'passive_participle, source) VALUES\n')
            values = []
            for r in chunk:
                values.append('(' + ','.join([
                    sql_escape(r['root_ar']),
                    str(r['verb_form']),
                    sql_escape(r['voice']),
                    sql_escape(r['past_3ms']),
                    sql_escape(r['present_3ms']),
                    sql_escape(r['imperative_2ms']),
                    sql_escape(r['masdar']),
                    sql_escape(r['active_participle']),
                    sql_escape(r['passive_participle']),
                    "'qutrub'",
                ]) + ')')
            out.write(',\n'.join(values) + ';\n\n')

    size = os.path.getsize(OUTPUT_FILE)
    print(f"      → {size/1024:.0f} Ko écrits dans {OUTPUT_FILE}")

if __name__ == '__main__':
    main()
