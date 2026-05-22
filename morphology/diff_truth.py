"""
Phase 1.5 — Compare notre génération canonique (quran_verb_canonical, Qutrub)
avec la vérité terrain Almaany (almaany_truth.json).

Pour chaque verbe du test_set, on diffère sur 5 champs :
  - past_3ms
  - present_3ms
  - masdar (le 1er trouvé suffit)
  - active_participle
  - passive_participle

Catégorise chaque divergence par CAUSE probable :
  - voyelle_r2_present : voyelle de R2 du présent (notre détection corpus)
  - hamza_normalisation : ءا vs آ, أ vs ا, etc.
  - défectueux : final ا/ى/ي/و mal géré
  - assimilation_form8 : Form VIII (ت+letter)
  - masdar_pattern : choix du wazn de masdar incorrect
  - participle_form : participe mal formé
  - shadda : gémination manquante/excédentaire
  - autre

Sortie : morphology/errors_report.md

Usage :
    python diff_truth.py
"""

import json
import os
import re
import subprocess
import sys
from collections import defaultdict, Counter

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')
    sys.stderr.reconfigure(encoding='utf-8')

DIR = os.path.dirname(__file__)
TRUTH_FILE  = os.path.join(DIR, 'almaany_truth.json')
REPORT_FILE = os.path.join(DIR, 'errors_report.md')

# ─────────────────────────────────────────────────────────────────────
# Normalisation pour comparaison
# ─────────────────────────────────────────────────────────────────────
DIACRITICS = set('ًٌٍَُِّْٰـ')
HARAKAT_NO_SHADDA = set('ًٌٍَُِْٰـ')
TANWIN = set('ًٌٍ')

def _norm_letters(s):
    if not s: return s
    return (s.replace('ٱ', 'ا').replace('ٰ', '')
             .replace('آ', 'ا').replace('أ', 'ا').replace('إ', 'ا')
             .replace('ؤ', 'و').replace('ئ', 'ي'))

def devoc(s):
    """Squelette consonnes (matching aggressif, hamza ≡ alif)."""
    if not s: return ''
    s = _norm_letters(s)
    s = ''.join(c for c in s if c not in DIACRITICS)
    # Hamza+alif → alif
    s = s.replace('ءا', 'ا').replace('ء', '')
    # Tanwin final déjà retiré par DIACRITICS
    return s

def skel(s):
    """Squelette consonnes + shadda (préserve la gémination)."""
    if not s: return ''
    s = _norm_letters(s)
    s = ''.join(c for c in s if c not in HARAKAT_NO_SHADDA)
    s = s.replace('ءا', 'ا').replace('ء', '')
    return s

def same_word(a, b, mode='skel'):
    """Compare 2 mots arabes. mode='skel' tolère les harakat. mode='strict' compare exact."""
    if a is None and b is None: return True
    if a is None or b is None: return False
    if mode == 'skel':
        return skel(a) == skel(b)
    return a == b


# ─────────────────────────────────────────────────────────────────────
# Lecture de la base canonique (quran_verb_canonical)
# ─────────────────────────────────────────────────────────────────────
def query_canonical():
    """Renvoie {(root_ar, verb_form, voice): {past_3ms, present_3ms, masdar, ...}}."""
    sql = (
        "SELECT root_ar, verb_form, voice, past_3ms, present_3ms, "
        "imperative_2ms, masdar, active_participle, passive_participle "
        "FROM quran_verb_canonical;"
    )
    out = subprocess.run(
        ['C:/MAMP/bin/mysql/bin/mysql.exe', '-u', 'root', '-proot',
         'quran_wasla', '--default-character-set=utf8mb4', '-B', '-N',
         '-e', sql],
        capture_output=True, text=True, encoding='utf-8'
    )
    canonical = {}
    for line in out.stdout.splitlines():
        cols = line.split('\t')
        if len(cols) < 9: continue
        root_ar, vf, voice, past, pres, imp, masdar, actp, passp = cols
        key = (root_ar, int(vf), voice)
        canonical[key] = {
            'past_3ms': None if past == 'NULL' else past,
            'present_3ms': None if pres == 'NULL' else pres,
            'imperative_2ms': None if imp == 'NULL' else imp,
            'masdar': None if masdar == 'NULL' else masdar,
            'active_participle': None if actp == 'NULL' else actp,
            'passive_participle': None if passp == 'NULL' else passp,
        }
    return canonical


# ─────────────────────────────────────────────────────────────────────
# Catégorisation d'erreur
# ─────────────────────────────────────────────────────────────────────
def classify_error(field, ours, theirs, canonical_row, almaany):
    """Devine la CAUSE probable d'une divergence (heuristiques)."""
    if ours is None and theirs is not None:
        return f'manque_{field}'
    if ours is not None and theirs is None:
        return f'almaany_no_{field}'
    o, t = ours or '', theirs or ''
    # Squelette identique → différence de voyelles uniquement
    if skel(o) == skel(t):
        return f'voyelle_{field}'
    # Squelette dévocalisé identique → diff shadda ou diacritique faible
    if devoc(o) == devoc(t):
        return f'shadda_{field}'
    # Présence de hamza différente
    if o.replace('ء','').replace('أ','').replace('إ','').replace('آ','') == \
       t.replace('ء','').replace('أ','').replace('إ','').replace('آ','') or \
       _norm_letters(o) == _norm_letters(t):
        return f'hamza_{field}'
    # Finale faible (ا/ى/ي/و/ة)
    if devoc(o)[:-1] == devoc(t)[:-1] and devoc(o) and devoc(t):
        return f'final_faible_{field}'
    return f'autre_{field}'


# ─────────────────────────────────────────────────────────────────────
# Diff principal
# ─────────────────────────────────────────────────────────────────────
def diff_verb(row, canonical):
    """row = test_set entry enrichi avec almaany. Retourne liste d'erreurs."""
    a = row.get('almaany', {})
    if a.get('status') != 'ok':
        return [{'kind': 'skipped', 'reason': a.get('status', 'unknown')}]

    key = (row['root_ar'], row['form'], row['voice'])
    can = canonical.get(key)
    if can is None:
        return [{'kind': 'missing_canonical', 'key': key}]

    errors = []

    # Comparaisons champ par champ
    pairs = [
        ('past_3ms',           can['past_3ms'],           a.get('past_3ms_almaany')),
        ('present_3ms',        can['present_3ms'],        a.get('present_3ms_almaany')),
        ('active_participle',  can['active_participle'],  a.get('active_participle_almaany')),
        ('passive_participle', can['passive_participle'], a.get('passive_participle_almaany')),
    ]
    for field, ours, theirs in pairs:
        if same_word(ours, theirs, mode='skel'):
            continue  # match propre (skel)
        errors.append({
            'kind': 'mismatch',
            'field': field,
            'ours': ours,
            'theirs': theirs,
            'cause': classify_error(field, ours, theirs, can, a),
        })

    # Masdar : on accepte si NOTRE masdar est dans LA LISTE Almaany
    our_masdar = can.get('masdar')
    almaany_masdars = a.get('masdars_almaany', []) or []
    if our_masdar and almaany_masdars:
        match = any(skel(our_masdar) == skel(m) for m in almaany_masdars)
        if not match:
            errors.append({
                'kind': 'mismatch',
                'field': 'masdar',
                'ours': our_masdar,
                'theirs': ' / '.join(almaany_masdars),
                'cause': 'masdar_pattern',
            })
    elif our_masdar is None and almaany_masdars:
        errors.append({
            'kind': 'mismatch',
            'field': 'masdar',
            'ours': None,
            'theirs': ' / '.join(almaany_masdars),
            'cause': 'manque_masdar',
        })

    return errors


def main():
    print('[1/3] Lecture base canonique...')
    canonical = query_canonical()
    print(f'      {len(canonical)} triplets (root, form, voice)')

    print('\n[2/3] Lecture almaany_truth.json...')
    with open(TRUTH_FILE, 'r', encoding='utf-8') as f:
        truth = json.load(f)
    print(f'      {len(truth)} verbes du test_set')

    print('\n[3/3] Diff...')
    all_errors = []          # liste plate de (row, error)
    per_category = defaultdict(lambda: defaultdict(int))  # category → cause → count
    per_cause = Counter()
    n_ok = n_skipped = n_with_errors = 0

    for row in truth:
        errs = diff_verb(row, canonical)
        if not errs:
            n_ok += 1
            continue
        if any(e['kind'] == 'skipped' for e in errs):
            n_skipped += 1
            continue
        n_with_errors += 1
        for e in errs:
            if e.get('kind') == 'mismatch':
                all_errors.append((row, e))
                per_category[row['category']][e['cause']] += 1
                per_cause[e['cause']] += 1

    print(f'      ✓ Match parfait : {n_ok}')
    print(f'      ✗ Avec erreurs  : {n_with_errors}')
    print(f'      ⊘ Skipped (pas de truth) : {n_skipped}')
    print(f'      Total erreurs : {len(all_errors)}')

    # ─── Génération du rapport ────────────────────────────────────────
    lines = []
    lines.append('# Rapport d\'erreurs — comparaison Qutrub vs Almaany (Phase 1)')
    lines.append('')
    lines.append(f'- **Verbes testés** : {len(truth)}')
    lines.append(f'- **Match parfait** : {n_ok}')
    lines.append(f'- **Avec erreurs** : {n_with_errors}')
    lines.append(f'- **Skipped (pas dans Almaany)** : {n_skipped}')
    lines.append(f'- **Total divergences** : {len(all_errors)}')
    lines.append('')

    # Top causes
    lines.append('## Top causes d\'erreur (toutes catégories confondues)')
    lines.append('')
    lines.append('| Cause | Count |')
    lines.append('|---|---|')
    for cause, n in per_cause.most_common():
        lines.append(f'| {cause} | {n} |')
    lines.append('')

    # Par catégorie morpho
    lines.append('## Par catégorie morphologique')
    lines.append('')
    for cat in sorted(per_category):
        causes = per_category[cat]
        lines.append(f'### {cat} ({sum(causes.values())} erreurs)')
        for cause, n in sorted(causes.items(), key=lambda kv: -kv[1]):
            lines.append(f'- {cause} : {n}')
        lines.append('')

    # Listing détaillé des erreurs
    lines.append('## Détail des erreurs (verbe par verbe)')
    lines.append('')
    by_verb = defaultdict(list)
    for row, e in all_errors:
        by_verb[(row['lemma_ar'], row['category'], row['root_ar'])].append(e)
    for (lemma, cat, root), errs in sorted(by_verb.items()):
        lines.append(f'### {lemma}  ({cat}, racine `{root}`)')
        for e in errs:
            ours = e.get('ours') or '∅'
            theirs = e.get('theirs') or '∅'
            lines.append(f'- **{e["field"]}** : nous=`{ours}` / Almaany=`{theirs}`  →  *{e["cause"]}*')
        lines.append('')

    with open(REPORT_FILE, 'w', encoding='utf-8') as f:
        f.write('\n'.join(lines))
    print(f'\nGénéré : {REPORT_FILE}')


if __name__ == '__main__':
    main()
