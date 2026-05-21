"""
Parse le Quranic Arabic Corpus (morphology v0.4) et génère un fichier SQL
prêt à importer en MySQL avec la table `quran_morphology_verbs`.

V1 — verbes uniquement. Champs stockés :
  - localisation : sura, aya, word_position, segment
  - racine en arabe (séparée par espaces, ex: "ع ب د")
  - racine en Buckwalter (debug + recherche)
  - forme verbale I à X (1-10), NULL si non spécifiée (= Form I implicite)
  - lemme en arabe (vocalisé) + en Buckwalter
  - forme vocalisée du mot tel qu'il apparaît dans le verset
  - features : tense (PERF/IMPF/IMPV) + voix (PASS) + personne (3MS, 1P...)

Usage :
    python import_verbs.py
    → produit quran_morphology_verbs.sql à côté
"""

import os
import re

INPUT_FILE  = os.path.join(os.path.dirname(__file__), 'quranic-corpus-morphology-0.4.txt')
OUTPUT_FILE = os.path.join(os.path.dirname(__file__), 'quran_morphology_verbs.sql')

# ─────────────────────────────────────────────────────────────────────────
# Buckwalter → Unicode arabe
# ─────────────────────────────────────────────────────────────────────────
BUCK_TO_AR = {
    # Hamzas et alif
    "'": "ء", "|": "آ", ">": "أ", "&": "ؤ", "<": "إ", "}": "ئ",
    # Consonnes
    "A": "ا", "b": "ب", "p": "ة", "t": "ت", "v": "ث", "j": "ج",
    "H": "ح", "x": "خ", "d": "د", "*": "ذ", "r": "ر", "z": "ز",
    "s": "س", "$": "ش", "S": "ص", "D": "ض", "T": "ط", "Z": "ظ",
    "E": "ع", "g": "غ",
    "f": "ف", "q": "ق", "k": "ك", "l": "ل", "m": "م", "n": "ن",
    "h": "ه", "w": "و", "Y": "ى", "y": "ي",
    # Diacritiques
    "F": "ً", "N": "ٌ", "K": "ٍ",
    "a": "َ", "u": "ُ", "i": "ِ",
    "~": "ّ", "o": "ْ",
    # Extensions Quraniques
    "`": "ٰ",   # superscript alif (dagger alif)
    "{": "ٱ",   # alif wasla
    "^": "ٓ",   # maddah au-dessus
    "_": "ـ",   # tatweel
}

def buck_to_ar(s):
    return ''.join(BUCK_TO_AR.get(c, c) for c in s)

ROMAN_TO_INT = {
    'I': 1, 'II': 2, 'III': 3, 'IV': 4, 'V': 5,
    'VI': 6, 'VII': 7, 'VIII': 8, 'IX': 9, 'X': 10,
}
FORM_RX = re.compile(r'\((I|II|III|IV|V|VI|VII|VIII|IX|X)\)')

LOC_RX = re.compile(r'^\((\d+):(\d+):(\d+):(\d+)\)$')

# Tags morphologiques à conserver dans le champ "features" (pour V3 affichage).
USEFUL_TAGS = {
    'PERF', 'IMPF', 'IMPV', 'PASS', 'ACT',
    '1S','1P','2MS','2MP','2FS','2FP','3MS','3MP','3FS','3FP','2D','3D',
    'MOOD:IND','MOOD:SUBJ','MOOD:JUS',
}

def sql_escape(s):
    if s is None:
        return 'NULL'
    return "'" + s.replace("\\","\\\\").replace("'", "''") + "'"

def parse_features(features_str):
    """Renvoie un dict avec ROOT, LEM, FORM, et un résumé features."""
    parts = features_str.split('|')
    out = {'root': None, 'lemma': None, 'form_num': None, 'tags': []}
    for p in parts:
        if p.startswith('ROOT:'):
            out['root'] = p[5:]
        elif p.startswith('LEM:'):
            out['lemma'] = p[4:]
        elif p in USEFUL_TAGS:
            out['tags'].append(p)
        else:
            # Forme verbale : (II) à (X). (I) n'est pas indiqué dans le corpus.
            m = FORM_RX.match(p)
            if m:
                out['form_num'] = ROMAN_TO_INT[m.group(1)]
    return out

def root_to_spaced(buck_root):
    """ROOT='Ebd' → 'ع ب د'. Pas de vocalisation pour la racine."""
    if not buck_root:
        return None
    return ' '.join(buck_to_ar(c) for c in buck_root)

def main():
    rows = []
    skipped_no_root = 0
    with open(INPUT_FILE, 'r', encoding='utf-8') as f:
        for line in f:
            if line.startswith('#') or line.startswith('LOCATION') or not line.strip():
                continue
            parts = line.rstrip('\n').split('\t')
            if len(parts) != 4:
                continue
            loc, form_buck, tag, features = parts
            if tag != 'V':
                continue
            m = LOC_RX.match(loc)
            if not m:
                continue
            sura, aya, word, seg = (int(x) for x in m.groups())
            f_info = parse_features(features)
            if not f_info['root']:
                skipped_no_root += 1
                continue
            rows.append({
                'sura': sura, 'aya': aya, 'word': word, 'seg': seg,
                'form_buck': form_buck,
                'form_ar':   buck_to_ar(form_buck),
                'root_buck': f_info['root'],
                'root_ar':   root_to_spaced(f_info['root']),
                'verb_form': f_info['form_num'],   # NULL si Form I (implicite)
                'lemma_buck': f_info['lemma'],
                'lemma_ar':   buck_to_ar(f_info['lemma']) if f_info['lemma'] else None,
                'features':   '|'.join(f_info['tags']) if f_info['tags'] else None,
            })

    print(f'Verbes parsés : {len(rows)}  (sans racine: {skipped_no_root})')

    # Statistiques rapides
    forms_count = {}
    for r in rows:
        k = r['verb_form'] if r['verb_form'] else 1
        forms_count[k] = forms_count.get(k, 0) + 1
    print('Répartition par forme verbale (I à X) :')
    for k in sorted(forms_count):
        print(f'  Form {k:2d} : {forms_count[k]:5d}')

    # Génération du SQL
    with open(OUTPUT_FILE, 'w', encoding='utf-8') as out:
        out.write('-- Généré par morphology/import_verbs.py\n')
        out.write('-- Source : Quranic Arabic Corpus v0.4 (corpus.quran.com) — GPL\n')
        out.write('-- V1 : verbes uniquement\n\n')
        out.write('SET NAMES utf8mb4;\n\n')
        out.write('DROP TABLE IF EXISTS quran_morphology_verbs;\n')
        out.write('''CREATE TABLE quran_morphology_verbs (
  sura          SMALLINT  UNSIGNED NOT NULL,
  aya           SMALLINT  UNSIGNED NOT NULL,
  word_position SMALLINT  UNSIGNED NOT NULL,
  segment       TINYINT   UNSIGNED NOT NULL,
  form_buck     VARCHAR(64)  NULL  COMMENT 'Mot tel quel en Buckwalter',
  form_ar       VARCHAR(64)  NULL  COMMENT 'Mot tel quel en arabe vocalise',
  root_buck     VARCHAR(8)   NOT NULL  COMMENT 'Racine en Buckwalter (3-4 lettres)',
  root_ar       VARCHAR(16)  NOT NULL  COMMENT 'Racine en arabe, espaces entre lettres',
  verb_form     TINYINT   UNSIGNED NULL COMMENT 'Forme I a X (NULL = Form I implicite)',
  lemma_buck    VARCHAR(32)  NULL,
  lemma_ar      VARCHAR(64)  NULL  COMMENT 'Lemme (forme canonique) en arabe vocalise',
  features      VARCHAR(64)  NULL  COMMENT 'Tags PERF/IMPF/IMPV/PASS, personne (3MS, 1P...)',
  PRIMARY KEY (sura, aya, word_position, segment),
  INDEX idx_root_ar (root_ar)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
\n''')

        # INSERTs par lots de 500 pour rester lisible et rapide à l'import
        BATCH = 500
        for i in range(0, len(rows), BATCH):
            chunk = rows[i:i+BATCH]
            out.write('INSERT INTO quran_morphology_verbs '
                      '(sura,aya,word_position,segment,form_buck,form_ar,'
                      'root_buck,root_ar,verb_form,lemma_buck,lemma_ar,features) VALUES\n')
            values = []
            for r in chunk:
                values.append(
                    '(' + ','.join([
                        str(r['sura']), str(r['aya']), str(r['word']), str(r['seg']),
                        sql_escape(r['form_buck']),
                        sql_escape(r['form_ar']),
                        sql_escape(r['root_buck']),
                        sql_escape(r['root_ar']),
                        str(r['verb_form']) if r['verb_form'] is not None else 'NULL',
                        sql_escape(r['lemma_buck']),
                        sql_escape(r['lemma_ar']),
                        sql_escape(r['features']),
                    ]) + ')'
                )
            out.write(',\n'.join(values) + ';\n\n')

    size = os.path.getsize(OUTPUT_FILE)
    print(f'\nGénéré : {OUTPUT_FILE}  ({size/1024/1024:.2f} Mo)')

if __name__ == '__main__':
    main()
