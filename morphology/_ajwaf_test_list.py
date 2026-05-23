"""Génère la liste des verbes أجوف Form I active à tester, avec un exemple
de sourate:verset:mot pour chacun, triée par fréquence d'occurrence."""
import os, sys, json, subprocess
from collections import defaultdict

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')

DIR = os.path.dirname(__file__)

DIACRITICS = set('ًٌٍَُِّْٰـ')
HARAKAT_NS = set('ًٌٍَُِْٰـ')

def _norm(s):
    if not s: return ''
    return (s.replace('ٱ', 'ا').replace('ٰ', '')
             .replace('آ', 'ا').replace('أ', 'ا').replace('إ', 'ا')
             .replace('ؤ', 'و').replace('ئ', 'ي'))

def skel(s):
    if not s: return ''
    s = _norm(s)
    s = ''.join(c for c in s if c not in HARAKAT_NS)
    return s.replace('ءا', 'ا').replace('ء', '')


# 1. Verbes أجوف Form I active
out = subprocess.run(
    ['C:/MAMP/bin/mysql/bin/mysql.exe', '-u', 'root', '-proot',
     'quran_wasla', '--default-character-set=utf8mb4', '-B', '-N', '-e',
     "SELECT root_ar, past_3ms, present_3ms, masdar, source "
     "FROM quran_verb_canonical WHERE verb_form=1 AND voice='active' "
     "AND (SUBSTRING_INDEX(SUBSTRING_INDEX(root_ar,' ',2),' ',-1)='و' "
     "  OR SUBSTRING_INDEX(SUBSTRING_INDEX(root_ar,' ',2),' ',-1)='ي')"],
    capture_output=True, text=True, encoding='utf-8'
)
ajwaf = {}
for line in out.stdout.splitlines():
    c = line.split('\t')
    if len(c) < 5: continue
    ajwaf[c[0]] = {'past': c[1], 'present': c[2], 'masdar': c[3], 'source': c[4]}

# 2. Fréquence + un exemple par racine (le verset le plus tôt)
out_occ = subprocess.run(
    ['C:/MAMP/bin/mysql/bin/mysql.exe', '-u', 'root', '-proot',
     'quran_wasla', '--default-character-set=utf8mb4', '-B', '-N', '-e',
     "SELECT root_ar, sura, aya, word_position, form_ar "
     "FROM quran_morphology_verbs "
     "WHERE COALESCE(verb_form,1)=1 AND features NOT LIKE '%PASS%' "
     "ORDER BY root_ar, sura, aya, word_position"],
    capture_output=True, text=True, encoding='utf-8'
)
freq = defaultdict(int)
sample = {}
for line in out_occ.stdout.splitlines():
    c = line.split('\t')
    if len(c) < 5: continue
    root, sura, aya, wp, form = c[0], int(c[1]), int(c[2]), int(c[3]), c[4]
    freq[root] += 1
    if root not in sample:
        sample[root] = {'sura': sura, 'aya': aya, 'word': wp, 'form_ar': form}

# 3. Charge reverso pour catégoriser
with open(os.path.join(DIR, 'reverso_truth.json'), 'r', encoding='utf-8') as f:
    rev_list = json.load(f)
rev_by_skel = {}
for r in rev_list:
    if r['reverso'].get('status') != 'ok' or r['verb_form'] != 1: continue
    s = skel(r['past_3ms'])
    if s: rev_by_skel.setdefault(s, []).append(r)

# 4. Charge overrides pour identifier les corrigés
with open(os.path.join(DIR, 'verb_canonical_overrides.json'), 'r', encoding='utf-8') as f:
    overrides = json.load(f)

# 5. Catégoriser chaque verbe
fields = ['past_3ms','present_3ms','imperative_2ms','masdar','active_participle','passive_participle']
results = []
for root, data in ajwaf.items():
    if root not in sample: continue
    cat = 'NO_REVERSO'
    has_override = f'{root}:1:active' in overrides
    sk = skel(data['past'])
    rev_match = None
    for r in rev_by_skel.get(sk, []):
        if skel(r['reverso'].get('past_3ms','')) == sk:
            rev_match = r; break
    if has_override:
        cat = 'OVERRIDDEN'
    elif rev_match:
        # Check if all fields match
        rev_data = rev_match['reverso']
        # Pull canonical
        out_can = subprocess.run(
            ['C:/MAMP/bin/mysql/bin/mysql.exe', '-u', 'root', '-proot',
             'quran_wasla', '--default-character-set=utf8mb4', '-B', '-N', '-e',
             f"SELECT present_3ms,imperative_2ms,masdar,active_participle,passive_participle "
             f"FROM quran_verb_canonical WHERE root_ar='{root}' AND verb_form=1 AND voice='active'"],
            capture_output=True, text=True, encoding='utf-8'
        )
        can_row = out_can.stdout.strip().split('\t')
        if len(can_row) == 5:
            ours_fields = {
                'present_3ms': can_row[0] if can_row[0]!='NULL' else None,
                'imperative_2ms': can_row[1] if can_row[1]!='NULL' else None,
                'masdar': can_row[2] if can_row[2]!='NULL' else None,
                'active_participle': can_row[3] if can_row[3]!='NULL' else None,
                'passive_participle': can_row[4] if can_row[4]!='NULL' else None,
            }
            mismatch = False
            for f in ['present_3ms','imperative_2ms','masdar','active_participle','passive_participle']:
                ours = ours_fields.get(f)
                theirs = rev_data.get(f)
                if ours and theirs and skel(ours) != skel(theirs):
                    mismatch = True; break
            cat = 'HOMOGRAPH_OR_DIVERGENT' if mismatch else 'MATCH_REVERSO'
    s = sample[root]
    results.append({
        'root': root, 'past': data['past'], 'pres': data['present'],
        'category': cat, 'freq': freq[root],
        'sura': s['sura'], 'aya': s['aya'], 'word': s['word'],
        'form_ar': s['form_ar'],
    })

# 6. Tri par catégorie puis fréquence desc
cat_order = {'OVERRIDDEN': 0, 'MATCH_REVERSO': 1, 'NO_REVERSO': 2, 'HOMOGRAPH_OR_DIVERGENT': 3}
results.sort(key=lambda x: (cat_order.get(x['category'], 9), -x['freq']))

# 7. Sortie markdown
lines = []
lines.append('# Liste de test verbes أجوف Form I active')
lines.append('')
lines.append('Triés par catégorie puis par fréquence (occurrences décroissantes).')
lines.append('Chaque ligne donne : verbe, racine, sourate:verset:mot, présent, fréquence, source.')
lines.append('')
prev_cat = None
for r in results:
    if r['category'] != prev_cat:
        prev_cat = r['category']
        lines.append('')
        explanations = {
            'OVERRIDDEN': '## 🔧 OVERRIDDEN — verbes avec correction manuelle (à vérifier que la correction marche bien)',
            'MATCH_REVERSO': '## ✅ MATCH_REVERSO — notre canonical match reverso (devrait déjà être correct)',
            'NO_REVERSO': '## ❓ NO_REVERSO — pas de données reverso, à vérifier manuellement',
            'HOMOGRAPH_OR_DIVERGENT': '## ⚠️ HOMOGRAPH — reverso ne distingue pas l\'homographe, notre canonical à vérifier',
        }
        lines.append(explanations.get(r['category'], r['category']))
        lines.append('')
        lines.append('| Verbe | Racine | Test | Présent | Occ |')
        lines.append('|---|---|---|---|---|')
    lines.append(f'| **{r["past"]}** | `{r["root"]}` | {r["sura"]}:{r["aya"]} mot {r["word"]} ({r["form_ar"]}) | {r["pres"]} | {r["freq"]} |')

with open(os.path.join(DIR, 'ajwaf_test_list.md'), 'w', encoding='utf-8') as f:
    f.write('\n'.join(lines))

# Stats
print(f'Total verbes أجوف : {len(results)}')
from collections import Counter
cats = Counter(r['category'] for r in results)
for c, n in cats.most_common():
    print(f'  {c} : {n}')
print(f'\n→ ajwaf_test_list.md')
