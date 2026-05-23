"""Triple cross-validation pour مهموز (assimilé : R1 faible و/ي, R2 et R3 non-faibles)."""
import os, sys, json, subprocess
from collections import defaultdict, Counter

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

def strip_tanwin(s):
    if not s: return s
    while s and s[-1] in 'ًٌ':
        s = s[:-1]
    return s


# Load mahmuz : au moins une position racine = ا (encodage hamza),
# ni creux ni défectueux ni géminé ni lafif ni mithal pur
out = subprocess.run(
    ['C:/MAMP/bin/mysql/bin/mysql.exe', '-u', 'root', '-proot',
     'quran_wasla', '--default-character-set=utf8mb4', '-B', '-N', '-e',
     "SELECT root_ar, past_3ms, present_3ms, imperative_2ms, masdar, "
     "active_participle, passive_participle, source "
     "FROM quran_verb_canonical WHERE verb_form=1 AND voice='active' "
     "AND LENGTH(root_ar) - LENGTH(REPLACE(root_ar, ' ', '')) + 1 = 3 "
     "AND (SUBSTRING_INDEX(root_ar,' ',1)='ا' "
     "  OR SUBSTRING_INDEX(SUBSTRING_INDEX(root_ar,' ',2),' ',-1)='ا' "
     "  OR SUBSTRING_INDEX(root_ar,' ',-1)='ا') "
     "AND SUBSTRING_INDEX(root_ar,' ',1) NOT IN ('و','ي') "
     "AND SUBSTRING_INDEX(SUBSTRING_INDEX(root_ar,' ',2),' ',-1) NOT IN ('و','ي') "
     "AND SUBSTRING_INDEX(root_ar,' ',-1) NOT IN ('و','ي')"],
    capture_output=True, text=True, encoding='utf-8'
)
mahmuz = []
for line in out.stdout.splitlines():
    c = line.split('\t')
    if len(c) < 8: continue
    mahmuz.append({
        'root_ar': c[0], 'past_3ms': c[1], 'present_3ms': c[2],
        'imperative_2ms': c[3] if c[3]!='NULL' else None,
        'masdar': c[4] if c[4]!='NULL' else None,
        'active_participle': c[5] if c[5]!='NULL' else None,
        'passive_participle': c[6] if c[6]!='NULL' else None,
        'source': c[7],
    })

out_freq = subprocess.run(
    ['C:/MAMP/bin/mysql/bin/mysql.exe', '-u', 'root', '-proot',
     'quran_wasla', '--default-character-set=utf8mb4', '-B', '-N', '-e',
     "SELECT root_ar, COUNT(*) FROM quran_morphology_verbs "
     "WHERE COALESCE(verb_form,1)=1 AND features NOT LIKE '%PASS%' GROUP BY root_ar"],
    capture_output=True, text=True, encoding='utf-8'
)
freq = {}
for line in out_freq.stdout.splitlines():
    parts = line.split('\t')
    if len(parts)==2: freq[parts[0]] = int(parts[1])

with open(os.path.join(DIR, 'reverso_truth.json'), 'r', encoding='utf-8') as f:
    rev_list = json.load(f)
rev_by_skel = {}
for r in rev_list:
    if r['reverso'].get('status')!='ok' or r['verb_form']!=1: continue
    s = skel(r['past_3ms'])
    if s: rev_by_skel.setdefault(s, []).append(r)

with open(os.path.join(DIR, 'cooljugator_truth.json'), 'r', encoding='utf-8') as f:
    cj_list = json.load(f)
cj_by_skel = {}
for r in cj_list:
    if r['cj'].get('status')!='ok' or r['verb_form']!=1: continue
    s = skel(r['past_3ms'])
    if s: cj_by_skel.setdefault(s, []).append(r)

with open(os.path.join(DIR, 'studyquran_truth.json'), 'r', encoding='utf-8') as f:
    sq_truth = json.load(f)
sq_by_skel = {}
for past, d in sq_truth.items():
    s = skel(past)
    if s: sq_by_skel.setdefault(s, []).append(d)

with open(os.path.join(DIR, 'verb_canonical_overrides.json'), 'r', encoding='utf-8') as f:
    existing = json.load(f)


fields = ['past_3ms','present_3ms','imperative_2ms','masdar',
          'active_participle','passive_participle']

def filter_safe(field, value):
    if not value: return False
    v_devoc = devoc(value)
    if v_devoc in {'الاجوف','المهموز','المهموز','الفعل','الماضي','المضارع','الناقص','المعتل','المهموز'}: return False
    if value.startswith('ال'): return False
    if field == 'past_3ms' and v_devoc[:1] in ('ي','ت','ن'): return False
    if field == 'present_3ms' and v_devoc[:1] not in ('ي','ت','ن'): return False
    if field == 'imperative_2ms' and v_devoc[:1] in ('ي','ت','ن'): return False
    if 'participle' in field:
        if strip_tanwin(value).endswith('ة'): return False
        if len(v_devoc) < 3: return False
    if field == 'masdar' and len(v_devoc) < 3: return False
    return True


hc_proposals = {}
diff_details = []
homographs = []
no_sources = []

for can in mahmuz:
    root = can['root_ar']
    past_sk = skel(can['past_3ms'])
    key = f'{root}:1:active'

    rev_match = next(iter(rev_by_skel.get(past_sk, [])), None)
    cj_match  = next(iter(cj_by_skel.get(past_sk, [])), None)
    sq_match  = next(iter(sq_by_skel.get(past_sk, [])), None)

    is_homograph_rev = False
    if rev_match:
        rev_past_sk = skel(rev_match['reverso'].get('past_3ms'))
        if rev_past_sk and rev_past_sk != past_sk:
            is_homograph_rev = True
            homographs.append(can)

    is_homograph_cj = False
    if cj_match:
        cj_past_sk = skel(cj_match['cj'].get('past_3ms'))
        if cj_past_sk and cj_past_sk != past_sk:
            is_homograph_cj = True

    if not rev_match and not cj_match and not sq_match:
        no_sources.append(can)
        continue

    existing_fields = set()
    if key in existing and not key.startswith('_'):
        existing_fields = set(existing[key].keys()) - {'comment'}

    for f in fields:
        ours = can.get(f)
        rev_v = rev_match['reverso'].get(f) if (rev_match and not is_homograph_rev) else None
        cj_v  = cj_match['cj'].get(f) if (cj_match and not is_homograph_cj) else None
        sq_v  = sq_match.get(f) if sq_match else None

        if not ours: continue

        srcs = []
        if rev_v and filter_safe(f, rev_v): srcs.append(('reverso', rev_v))
        if cj_v and filter_safe(f, cj_v): srcs.append(('cooljugator', cj_v))
        if sq_v and filter_safe(f, sq_v): srcs.append(('studyquran', sq_v))
        if not srcs: continue

        ours_skel = skel(ours)
        diff_sources = [(s, v) for s, v in srcs if skel(v) != ours_skel]
        agree_sources = [(s, v) for s, v in srcs if skel(v) == ours_skel]

        if len(diff_sources) >= 2:
            value_groups = defaultdict(list)
            for s, v in diff_sources:
                value_groups[skel(v)].append((s, v))
            best_group = max(value_groups.values(), key=len)
            if len(best_group) >= 2:
                if f not in existing_fields:
                    chosen_value = strip_tanwin(best_group[0][1])
                    hc_proposals.setdefault(key, {})[f] = chosen_value
                    diff_details.append({
                        'root': root, 'past': can['past_3ms'], 'freq': freq.get(root, 0),
                        'field': f, 'ours': ours,
                        'sources': diff_sources, 'agree_with_ours': agree_sources,
                        'level': 'HC'
                    })
                    continue
        if diff_sources and not agree_sources:
            diff_details.append({
                'root': root, 'past': can['past_3ms'], 'freq': freq.get(root, 0),
                'field': f, 'ours': ours,
                'sources': diff_sources, 'agree_with_ours': [],
                'level': 'MC_single'
            })

print(f'Total مهموز Form I active : {len(mahmuz)}')
print(f'Sans aucune source : {len(no_sources)}')
print(f'Homographes reverso : {len(homographs)}')
print(f'HC propositions : {len(hc_proposals)} verbes, {sum(len(v) for v in hc_proposals.values())} champs')

lines = ['# Triple cross-validation مهموز', '']
lines.append(f'- Total verbes مهموز Form I active : {len(mahmuz)}')
lines.append(f'- HC propositions : {len(hc_proposals)} verbes')
lines.append('')
lines.append('## 🎯 HIGH CONFIDENCE — 2+ sources d\'accord contre nous')
lines.append('')
hc_by_verb = defaultdict(list)
for d in diff_details:
    if d['level'] == 'HC':
        hc_by_verb[(d['past'], d['root'], d['freq'])].append(d)
for (past, root, fr), ds in sorted(hc_by_verb.items(), key=lambda x: -x[0][2]):
    lines.append(f'### {past}  (`{root}`, {fr} occurrences)')
    for d in ds:
        srcs_str = ' / '.join(f'{s}=`{v}`' for s, v in d['sources'])
        lines.append(f'- **{d["field"]}** : nous=`{d["ours"]}` | {srcs_str}')
    lines.append('')

# Single-source diffs (MC) pour info
lines.append('## ⚠️ MC (1 seule source) — pour inspection')
lines.append('')
mc_by_verb = defaultdict(list)
for d in diff_details:
    if d['level'] == 'MC_single':
        mc_by_verb[(d['past'], d['root'], d['freq'])].append(d)
for (past, root, fr), ds in sorted(mc_by_verb.items(), key=lambda x: -x[0][2]):
    lines.append(f'### {past}  (`{root}`, {fr} occurrences)')
    for d in ds:
        srcs_str = ' / '.join(f'{s}=`{v}`' for s, v in d['sources'])
        lines.append(f'- **{d["field"]}** : nous=`{d["ours"]}` | {srcs_str}')
    lines.append('')

with open(os.path.join(DIR, 'mahmuz_triple_report.md'), 'w', encoding='utf-8') as f:
    f.write('\n'.join(lines))

for key, fields_dict in hc_proposals.items():
    fields_dict['comment'] = 'Triple-validated مهموز (≥2 sources)'
with open(os.path.join(DIR, 'mahmuz_triple_overrides.json'), 'w', encoding='utf-8') as f:
    json.dump(hc_proposals, f, ensure_ascii=False, indent=2)

print(f'\n→ mahmuz_triple_report.md')
print(f'→ mahmuz_triple_overrides.json')
