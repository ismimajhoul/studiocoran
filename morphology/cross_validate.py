"""
Cross-validation : pour chaque verbe canonical, compare nous / studyquran / reverso.

Pour chaque champ (past_3ms, present_3ms, imperative_2ms, masdar,
active_participle, passive_participle), on identifie 4 cas :

  AGREE    : nous == reverso == studyquran (ou les sources qui ont la valeur)
  DIFFER_HC: reverso et studyquran sont d'accord MAIS différents de nous
             → high confidence override candidate
  DIFFER_MC: une seule source diffère de nous (medium confidence)
  CONFLICT : reverso et studyquran sont en conflit
             → review manuelle nécessaire

Sortie :
  morphology/cross_validation_report.md
  morphology/cross_validation_overrides.json (overrides HC à appliquer)

Usage :
    python cross_validate.py
"""
import os, sys, json, subprocess, re
from collections import defaultdict, Counter

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')

DIR = os.path.dirname(__file__)
REVERSO_FILE     = os.path.join(DIR, 'reverso_truth.json')
STUDYQURAN_FILE  = os.path.join(DIR, 'studyquran_truth.json')
OVERRIDES_FILE   = os.path.join(DIR, 'verb_canonical_overrides.json')
REPORT_FILE      = os.path.join(DIR, 'cross_validation_report.md')
HC_OVERRIDES_FILE = os.path.join(DIR, 'cross_validation_overrides.json')

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
    if not s: return s
    while s and s[-1] in 'ًٌ':
        s = s[:-1]
    return s


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


def main():
    print('[1/5] Chargement des données...')
    canonical = load_canonical()
    print(f'      Canonical : {len(canonical)} verbes active')

    with open(REVERSO_FILE, 'r', encoding='utf-8') as f:
        reverso_list = json.load(f)
    # Index par past_3ms skeleton
    reverso_by_skel = {}
    for r in reverso_list:
        if r['reverso'].get('status') != 'ok': continue
        s = skel(r['past_3ms'])
        if s: reverso_by_skel.setdefault(s, []).append(r)
    print(f'      Reverso OK : {sum(len(v) for v in reverso_by_skel.values())} verbes indexés')

    with open(STUDYQURAN_FILE, 'r', encoding='utf-8') as f:
        sq_truth = json.load(f)
    sq_by_skel = {}
    for past, d in sq_truth.items():
        s = skel(past)
        if s: sq_by_skel.setdefault(s, []).append(d)
    print(f'      Studyquran : {sum(len(v) for v in sq_by_skel.values())} verbes indexés')

    with open(OVERRIDES_FILE, 'r', encoding='utf-8') as f:
        existing_overrides = json.load(f)

    print('[2/5] Matching et catégorisation...')
    fields = ['past_3ms', 'present_3ms', 'imperative_2ms', 'masdar',
              'active_participle', 'passive_participle']

    by_category = defaultdict(list)   # AGREE/DIFFER_HC/DIFFER_MC/CONFLICT → liste de (verb, field, ours, rev, sq)
    hc_proposals = {}                  # key → { field: value } pour overrides HC

    n_with_both = 0
    n_with_rev_only = 0
    n_with_sq_only = 0

    for can in canonical:
        if not can['past_3ms']: continue
        past_skel = skel(can['past_3ms'])

        # Trouve match dans reverso + studyquran (match préfère même verb_form)
        rev_match = None
        for r in reverso_by_skel.get(past_skel, []):
            if r.get('verb_form') == can['verb_form']:
                rev_match = r; break
        if rev_match is None and reverso_by_skel.get(past_skel):
            rev_match = reverso_by_skel[past_skel][0]

        sq_match = None
        for d in sq_by_skel.get(past_skel, []):
            if d.get('form_num') == can['verb_form']:
                sq_match = d; break
        if sq_match is None and sq_by_skel.get(past_skel):
            sq_match = sq_by_skel[past_skel][0]

        if rev_match and sq_match: n_with_both += 1
        elif rev_match: n_with_rev_only += 1
        elif sq_match: n_with_sq_only += 1

        key = f"{can['root_ar']}:{can['verb_form']}:{can['voice']}"
        existing_fields_for_verb = set()
        if key in existing_overrides and not key.startswith('_'):
            existing_fields_for_verb = set(existing_overrides[key].keys()) - {'comment'}

        for f in fields:
            ours = can.get(f)
            rev = rev_match['reverso'].get(f) if rev_match else None
            sq  = sq_match.get(f) if sq_match else None
            if not ours: continue   # skip si on n'a pas la valeur
            if not rev and not sq: continue   # skip si aucune source de comparaison

            ours_s = skel(ours)
            rev_s = skel(rev) if rev else None
            sq_s = skel(sq) if sq else None

            # Compare
            if rev_s and sq_s:
                if rev_s == sq_s == ours_s:
                    by_category['AGREE'].append((key, can['past_3ms'], f, ours, rev, sq))
                elif rev_s == sq_s and rev_s != ours_s:
                    by_category['DIFFER_HC'].append((key, can['past_3ms'], f, ours, rev, sq))
                    # Override candidate si pas déjà existant
                    if f not in existing_fields_for_verb:
                        hc_proposals.setdefault(key, {})[f] = strip_trailing_tanwin(rev)
                elif rev_s == ours_s and sq_s != ours_s:
                    by_category['SQ_ALONE'].append((key, can['past_3ms'], f, ours, rev, sq))
                elif sq_s == ours_s and rev_s != ours_s:
                    by_category['REV_ALONE'].append((key, can['past_3ms'], f, ours, rev, sq))
                else:
                    by_category['CONFLICT'].append((key, can['past_3ms'], f, ours, rev, sq))
            elif rev_s:
                if rev_s == ours_s:
                    by_category['AGREE'].append((key, can['past_3ms'], f, ours, rev, None))
                else:
                    by_category['REV_ONLY'].append((key, can['past_3ms'], f, ours, rev, None))
            elif sq_s:
                if sq_s == ours_s:
                    by_category['AGREE'].append((key, can['past_3ms'], f, ours, None, sq))
                else:
                    by_category['SQ_ONLY'].append((key, can['past_3ms'], f, ours, None, sq))

    print(f'      Verbes avec rev+sq : {n_with_both}')
    print(f'      Verbes avec rev seul : {n_with_rev_only}')
    print(f'      Verbes avec sq seul : {n_with_sq_only}')

    print('[3/5] Statistiques :')
    cat_order = ['AGREE','DIFFER_HC','REV_ALONE','SQ_ALONE','REV_ONLY','SQ_ONLY','CONFLICT']
    for cat in cat_order:
        if cat in by_category:
            print(f'      {cat:<12} : {len(by_category[cat])}')

    # ─── Génère cross_validation_overrides.json ────────────────────────
    print(f'[4/5] Overrides HC proposés : {len(hc_proposals)} verbes')
    with open(HC_OVERRIDES_FILE, 'w', encoding='utf-8') as f:
        json.dump(hc_proposals, f, ensure_ascii=False, indent=2)
    print(f'  → {HC_OVERRIDES_FILE}')

    # ─── Génère le rapport markdown ────────────────────────────────────
    print('[5/5] Génération du rapport...')
    lines = []
    lines.append('# Cross-validation Qutrub vs reverso vs studyquran')
    lines.append('')
    lines.append(f'- **Canonical actif** : {len(canonical)} verbes')
    lines.append(f'- **Avec reverso ET studyquran** : {n_with_both}')
    lines.append(f'- **Avec reverso seul** : {n_with_rev_only}')
    lines.append(f'- **Avec studyquran seul** : {n_with_sq_only}')
    lines.append('')

    lines.append('## Catégories de divergences')
    lines.append('')
    lines.append('| Catégorie | Count | Sens |')
    lines.append('|---|---|---|')
    for cat in cat_order:
        if cat not in by_category: continue
        n = len(by_category[cat])
        meanings = {
            'AGREE': 'Nous + reverso + sq tous d\'accord',
            'DIFFER_HC': '**HIGH CONFIDENCE** : reverso + sq d\'accord contre nous',
            'REV_ALONE': 'reverso seul diffère (sq d\'accord avec nous)',
            'SQ_ALONE': 'sq seul diffère (reverso d\'accord avec nous)',
            'REV_ONLY': 'Pas de sq disponible, reverso seul diffère',
            'SQ_ONLY': 'Pas de reverso disponible, sq seul diffère',
            'CONFLICT': 'reverso et sq diffèrent entre eux ET de nous',
        }
        lines.append(f'| {cat} | {n} | {meanings.get(cat,"?")} |')
    lines.append('')

    # Section DIFFER_HC = les vraies corrections à appliquer
    lines.append('## DIFFER_HC : overrides à haute confiance')
    lines.append('')
    lines.append('reverso et studyquran sont d\'accord, contre nous. Très probablement notre erreur.')
    lines.append('')
    diffs_by_key = defaultdict(list)
    for tup in by_category.get('DIFFER_HC', []):
        diffs_by_key[(tup[0], tup[1])].append(tup)
    for (key, past), diffs in sorted(diffs_by_key.items()):
        lines.append(f'### {past}  (`{key}`)')
        for _, _, field, ours, rev, sq in diffs:
            lines.append(f'- **{field}** : nous=`{ours}` / rev=`{rev}` / sq=`{sq}`')
        lines.append('')

    # Section CONFLICT = à investiguer
    lines.append('## CONFLICT : reverso ≠ studyquran ≠ nous')
    lines.append('')
    lines.append('Trois sources en conflit. À investiguer manuellement.')
    lines.append('')
    for tup in by_category.get('CONFLICT', [])[:40]:
        key, past, field, ours, rev, sq = tup
        lines.append(f'- **{past}** {field} : nous=`{ours}` / rev=`{rev}` / sq=`{sq}`  (`{key}`)')

    with open(REPORT_FILE, 'w', encoding='utf-8') as f:
        f.write('\n'.join(lines))
    print(f'  → {REPORT_FILE}')


if __name__ == '__main__':
    main()
