"""
Phase C+D : matche studyquran_truth.json avec quran_verb_canonical,
puis génère un rapport markdown des divergences.

Match strategy :
1. Par squelette consonnes (devocalize) du past_3ms / present_3ms
2. Filtre par form_num si disponible
3. Pour chaque match, compare chaque champ et catégorise la divergence

Sortie : morphology/studyquran_diff_report.md
"""
import os, sys, json, subprocess, re
from collections import defaultdict, Counter

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')

DIR = os.path.dirname(__file__)
TRUTH_FILE = os.path.join(DIR, 'studyquran_truth.json')
REPORT_FILE = os.path.join(DIR, 'studyquran_diff_report.md')

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
    s = s.replace('ءا', 'ا').replace('ء', '')
    return s

def skel(s):
    """Squelette conservant la shadda (distingue Form I vs II)."""
    if not s: return ''
    s = _norm(s)
    s = ''.join(c for c in s if c not in HARAKAT_NS)
    s = s.replace('ءا', 'ا').replace('ء', '')
    return s


def load_canonical():
    """Renvoie liste de dicts depuis quran_verb_canonical."""
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


def find_match(sq_entry, canonical):
    """Trouve la ligne canonical correspondante à une entrée studyquran.
    Match priorité : (1) skeleton du past, (2) skeleton du present, (3) racine + form."""
    sq_past_skel = skel(sq_entry.get('past_3ms'))
    sq_pres_skel = skel(sq_entry.get('present_3ms'))
    sq_root = sq_entry.get('root_ar')
    sq_form = sq_entry.get('form_num')

    if sq_past_skel:
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


def compare_field(field, ours, theirs):
    """Catégorise la divergence pour un champ."""
    if ours is None and theirs is None: return None  # both empty
    if ours is None and theirs is not None: return 'manque'
    if ours is not None and theirs is None: return None  # sq incomplet, on ignore
    if skel(ours) == skel(theirs): return None  # match parfait au squelette
    if devoc(ours) == devoc(theirs): return 'shadda_ou_diacritique'
    return 'autre'


def main():
    print('[1/3] Lecture canonical...')
    canonical = load_canonical()
    print(f'      {len(canonical)} lignes active')

    print('[2/3] Lecture studyquran_truth.json...')
    with open(TRUTH_FILE, 'r', encoding='utf-8') as f:
        truth = json.load(f)
    print(f'      {len(truth)} verbes scrapés')

    print('[3/3] Matching + diff...')
    fields = ['past_3ms', 'present_3ms', 'imperative_2ms', 'masdar',
              'active_participle', 'passive_participle']
    n_match = n_nomatch = 0
    cause_counter = Counter()
    diffs_by_verb = []   # liste de (sq_past, can, sq, [field_diffs])
    no_match = []

    for past, sq in truth.items():
        can = find_match(sq, canonical)
        if can is None:
            n_nomatch += 1
            no_match.append((past, sq))
            continue
        n_match += 1
        verb_diffs = []
        for f in fields:
            cat = compare_field(f, can.get(f), sq.get(f))
            if cat is None: continue
            verb_diffs.append({
                'field': f,
                'ours': can.get(f),
                'theirs': sq.get(f),
                'cause': cat,
            })
            cause_counter[f'{cat}_{f}'] += 1
        if verb_diffs:
            diffs_by_verb.append((past, can, sq, verb_diffs))

    n_perfect = n_match - len(diffs_by_verb)

    # Génère le rapport
    lines = []
    lines.append('# Rapport diff Qutrub vs studyquranarabic.com')
    lines.append('')
    lines.append(f'- **Verbes scrapés studyquran** : {len(truth)}')
    lines.append(f'- **Matchés avec canonical**     : {n_match}')
    lines.append(f'- **Non matchés** (pas dans corpus ou hors active) : {n_nomatch}')
    lines.append(f'- **Match parfait (aucune divergence)** : {n_perfect}')
    lines.append(f'- **Avec divergences**           : {len(diffs_by_verb)}')
    lines.append(f'- **Total divergences**          : {sum(len(v[3]) for v in diffs_by_verb)}')
    lines.append('')

    lines.append('## Top causes')
    lines.append('')
    lines.append('| Cause | Count |')
    lines.append('|---|---|')
    for c, n in cause_counter.most_common():
        lines.append(f'| {c} | {n} |')
    lines.append('')

    lines.append('## Détail par verbe')
    lines.append('')
    for past, can, sq, diffs in sorted(diffs_by_verb):
        root = can.get('root_ar', '?')
        form = can.get('verb_form', '?')
        lines.append(f'### {past}  (racine `{root}`, Form {form})')
        for d in diffs:
            ours = d['ours'] or '∅'
            theirs = d['theirs'] or '∅'
            lines.append(f'- **{d["field"]}** : nous=`{ours}` / studyquran=`{theirs}`  → *{d["cause"]}*')
        lines.append('')

    if no_match:
        lines.append('## Verbes studyquran sans match canonical')
        lines.append('')
        for past, sq in sorted(no_match)[:30]:
            lines.append(f'- {past}  (form={sq.get("form_num")}, root={sq.get("root_ar")})')
        if len(no_match) > 30:
            lines.append(f'- … et {len(no_match)-30} autres')

    with open(REPORT_FILE, 'w', encoding='utf-8') as f:
        f.write('\n'.join(lines))
    print(f'\n  ✓ Match parfait : {n_perfect}')
    print(f'  ✗ Avec divergences : {len(diffs_by_verb)}')
    print(f'  ⊘ Sans match : {n_nomatch}')
    print(f'  → Rapport : {REPORT_FILE}')


if __name__ == '__main__':
    main()
