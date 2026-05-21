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
# Heuristique future_type pour Form I
# ─────────────────────────────────────────────────────────────────────
def guess_future_type(root_letters):
    """Choix de la haraka du ع du مضارع pour Form I (lexical)."""
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
    if len(fixed) >= 1 and fixed[0] == 'ا': fixed[0] = 'أ'
    if len(fixed) >= 3 and fixed[2] == 'ا': fixed[2] = 'أ'
    return fixed

# ─────────────────────────────────────────────────────────────────────
# Construction de la forme passée pour Form I (input à Qutrub)
# ─────────────────────────────────────────────────────────────────────
def build_form1_past(root_letters):
    if len(root_letters) < 3: return None
    rl = normalize_root_for_qutrub(root_letters)
    r1, r2, r3 = rl[:3]
    if r2 in ('و', 'ي'): return f'{r1}َا{r3}َ'      # creux
    if r3 == 'و':        return f'{r1}َ{r2}َا'      # défectueux و
    if r3 == 'ي':        return f'{r1}َ{r2}َى'      # défectueux ي
    return f'{r1}َ{r2}َ{r3}َ'                       # sain

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
    """R3=و ou ي avec fatha finale → ا ou ى (défectueux)."""
    if r3 == 'و':
        if past_form.endswith('وَ'): return past_form[:-2] + 'ا'
        if past_form.endswith('وْ'): return past_form[:-2] + 'ا'
    if r3 == 'ي':
        if past_form.endswith('يَ'): return past_form[:-2] + 'ى'
        if past_form.endswith('يْ'): return past_form[:-2] + 'ى'
    return past_form

def build_form_n_past(verb_form, root_letters):
    if len(root_letters) < 3: return None
    rl = normalize_root_for_qutrub(root_letters)
    r1, r2, r3 = rl[:3]
    is_hollow = r2 in ('و', 'ي')

    if is_hollow and verb_form in FORM_PAST_TEMPLATE_HOLLOW:
        past = _apply(FORM_PAST_TEMPLATE_HOLLOW[verb_form], r1, r2, r3)
    else:
        tpl = FORM_PAST_TEMPLATE_SAIN.get(verb_form)
        if not tpl: return None
        past = _apply(tpl, r1, r2, r3)
    # Correction défectueux final (qui s'applique aussi aux hollow ci-dessus
    # si la 3e radicale est faible — cas combiné rare mais existant)
    return _fix_defective_last(past, r3)

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
def compute_masdar(root_letters, verb_form):
    if len(root_letters) < 3: return None
    rl = normalize_root_for_qutrub(root_letters)
    r1, r2, r3 = rl[:3]
    is_hollow = r2 in ('و', 'ي')
    if is_hollow and verb_form in MASDAR_TEMPLATE_HOLLOW:
        tpl = MASDAR_TEMPLATE_HOLLOW[verb_form]
    else:
        tpl = MASDAR_TEMPLATE_SAIN.get(verb_form)
    if not tpl: return None
    return _apply(tpl, r1, r2, r3)

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
    return {
        'past_3ms': past, 'present_3ms': pres,
        'imperative_2ms': impv, 'masdar': masdar,
        'active_participle': None, 'passive_participle': None,
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

    # Verbe à passer à Qutrub.
    # Form I : on construit depuis la racine (gère sain/creux/défectueux).
    # Forms II-X : on PRÉFÈRE le template (qui gère hollow/défectueux
    # proprement) au LEM du corpus — le LEM est parfois en présent ou
    # mal vocalisé pour les verbes faibles. Le LEM sert seulement en
    # fallback final si tout échoue.
    if verb_form == 1:
        verb_in = build_form1_past(root_letters)
    else:
        verb_in = build_form_n_past(verb_form, root_letters)
    if not verb_in:
        # Fallback ultime : tenter le LEM du corpus tel quel
        verb_in = normalize_lemma_for_qutrub(buck_to_ar(lemma_buck))
    if not verb_in:
        out['_error'] = 'impossible de construire le verbe'
        return out

    future_type = guess_future_type(root_letters)

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

    out['masdar'] = compute_masdar(root_letters, verb_form)
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
