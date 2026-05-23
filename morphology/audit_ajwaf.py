"""Audit ciblé sur les verbes أجوف (creux, R2 = و ou ي) Form I active.

Pour chaque racine creuse :
- Récupère notre canonical (past, present, imp, masdar, actp, passp)
- Compare avec reverso si disponible
- Catégorise les divergences par champ et par cause probable

Sortie : ajwaf_audit.md (rapport markdown) + ajwaf_overrides_proposed.json
"""
import os, sys, json, subprocess
from collections import defaultdict, Counter

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')

DIR = os.path.dirname(__file__)
REVERSO_FILE = os.path.join(DIR, 'reverso_truth.json')
OVERRIDES_FILE = os.path.join(DIR, 'verb_canonical_overrides.json')
REPORT_FILE = os.path.join(DIR, 'ajwaf_audit.md')
PROPOSED_FILE = os.path.join(DIR, 'ajwaf_overrides_proposed.json')

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


# 1. Charge canonical creux Form I active
out = subprocess.run(
    ['C:/MAMP/bin/mysql/bin/mysql.exe', '-u', 'root', '-proot',
     'quran_wasla', '--default-character-set=utf8mb4', '-B', '-N', '-e',
     "SELECT root_ar, past_3ms, present_3ms, imperative_2ms, masdar, "
     "active_participle, passive_participle, source "
     "FROM quran_verb_canonical WHERE verb_form=1 AND voice='active' "
     "AND (SUBSTRING_INDEX(SUBSTRING_INDEX(root_ar,' ',2),' ',-1)='و' "
     "  OR SUBSTRING_INDEX(SUBSTRING_INDEX(root_ar,' ',2),' ',-1)='ي')"],
    capture_output=True, text=True, encoding='utf-8'
)
ajwaf = []
for line in out.stdout.splitlines():
    c = line.split('\t')
    if len(c) < 8: continue
    ajwaf.append({
        'root_ar': c[0], 'past_3ms': c[1], 'present_3ms': c[2],
        'imperative_2ms': c[3] if c[3] != 'NULL' else None,
        'masdar': c[4] if c[4] != 'NULL' else None,
        'active_participle': c[5] if c[5] != 'NULL' else None,
        'passive_participle': c[6] if c[6] != 'NULL' else None,
        'source': c[7],
    })
print(f'Total verbes أجوف Form I active : {len(ajwaf)}')

# Fréquences (occurrences)
out_freq = subprocess.run(
    ['C:/MAMP/bin/mysql/bin/mysql.exe', '-u', 'root', '-proot',
     'quran_wasla', '--default-character-set=utf8mb4', '-B', '-N', '-e',
     "SELECT root_ar, COUNT(*) FROM quran_morphology_verbs "
     "WHERE COALESCE(verb_form,1)=1 AND features NOT LIKE '%PASS%' "
     "GROUP BY root_ar"],
    capture_output=True, text=True, encoding='utf-8'
)
freq = {}
for line in out_freq.stdout.splitlines():
    parts = line.split('\t')
    if len(parts) == 2:
        freq[parts[0]] = int(parts[1])

# Charge reverso
with open(REVERSO_FILE, 'r', encoding='utf-8') as f:
    rev_list = json.load(f)
rev_by_skel = {}
for r in rev_list:
    if r['reverso'].get('status') != 'ok' or r['verb_form'] != 1: continue
    s = skel(r['past_3ms'])
    if s: rev_by_skel.setdefault(s, []).append(r)

# Charge overrides existants
with open(OVERRIDES_FILE, 'r', encoding='utf-8') as f:
    existing = json.load(f)

# 2. Analyse champ par champ
fields = ['past_3ms', 'present_3ms', 'imperative_2ms', 'masdar',
          'active_participle', 'passive_participle']

# Catégorisation
no_reverso = []     # pas de reverso
agree = []          # toutes les valeurs OK
diffs = []          # liste des divergences {root, field, ours, reverso, freq}

rejected_root_shift = []   # reverso shifts to different root
for can in ajwaf:
    sk = skel(can['past_3ms'])
    rev = None
    for r in rev_by_skel.get(sk, []):
        rev = r; break
    if rev is None:
        no_reverso.append(can)
        continue
    rev_data = rev['reverso']
    # FILTRE 1 : past skel different → root shift (homographe Form I/II ou autre racine)
    rev_past = rev_data.get('past_3ms')
    if rev_past and skel(rev_past) != skel(can['past_3ms']):
        rejected_root_shift.append((can, rev_past))
        continue
    rev_past_skel = skel(rev_data.get('past_3ms')) if rev_data.get('past_3ms') else ''
    verb_diffs = []
    for f in fields:
        ours = can.get(f)
        theirs = rev_data.get(f)
        if not ours or not theirs: continue
        if skel(ours) == skel(theirs): continue
        # FILTRE 3 : si reverso masdar == past_3ms, c'est une truncation (parser fallback)
        if f == 'masdar' and skel(theirs) == rev_past_skel: continue
        # FILTRE 4 : si participe reverso == past, idem
        if 'participle' in f and skel(theirs) == rev_past_skel: continue
        verb_diffs.append({'field': f, 'ours': ours, 'theirs': theirs})
    # FILTRE 2 : si > 3 champs diffèrent, c'est probablement encore un mismatch
    if len(verb_diffs) > 3:
        rejected_root_shift.append((can, rev_data.get('past_3ms')))
        continue
    if not verb_diffs:
        agree.append(can)
    else:
        for d in verb_diffs:
            diffs.append({
                'root': can['root_ar'],
                'past': can['past_3ms'],
                'freq': freq.get(can['root_ar'], 0),
                'field': d['field'],
                'ours': d['ours'],
                'theirs': d['theirs'],
            })

print(f'Pas de reverso : {len(no_reverso)} verbes')
print(f'Match parfait : {len(agree)} verbes')
print(f'Divergences (total) : {len(diffs)}')

# 3. Stats par champ
print('\nDivergences par champ :')
by_field = Counter(d['field'] for d in diffs)
for f, n in by_field.most_common():
    print(f'  {f:<22} : {n}')

# 4. Génère le rapport
lines = []
lines.append('# Audit verbes أجوف Form I active')
lines.append('')
lines.append(f'- **Total verbes أجوف Form I active** : {len(ajwaf)}')
lines.append(f'- **Avec reverso disponible** : {len(ajwaf) - len(no_reverso)}')
lines.append(f'- **Match parfait nous = reverso** : {len(agree)}')
lines.append(f'- **Avec ≥ 1 divergence** : {len(ajwaf) - len(no_reverso) - len(agree)}')
lines.append(f'- **Pas de reverso** : {len(no_reverso)}')
lines.append('')
lines.append('## Divergences par champ')
lines.append('| Champ | Count |')
lines.append('|---|---|')
for f, n in by_field.most_common():
    lines.append(f'| {f} | {n} |')
lines.append('')

# Tri par fréquence (les plus impactants d'abord)
lines.append('## Détail (trié par fréquence d\'occurrence dans le Coran)')
lines.append('')
diffs_by_verb = defaultdict(list)
for d in diffs:
    diffs_by_verb[(d['past'], d['root'], d['freq'])].append(d)
sorted_verbs = sorted(diffs_by_verb.items(), key=lambda x: -x[0][2])
for (past, root, fr), ds in sorted_verbs:
    lines.append(f'### {past}  (`{root}`, {fr} occurrences)')
    for d in ds:
        lines.append(f'- **{d["field"]}** : nous=`{d["ours"]}` / reverso=`{d["theirs"]}`')
    lines.append('')

# Verbes sans reverso (à ne pas oublier)
lines.append('## Verbes أجوف sans donnée reverso')
lines.append('')
for v in sorted(no_reverso, key=lambda x: -freq.get(x['root_ar'], 0))[:50]:
    fr = freq.get(v['root_ar'], 0)
    lines.append(f'- {v["past_3ms"]} (`{v["root_ar"]}`, {fr} occ)')
if len(no_reverso) > 50:
    lines.append(f'- ... ({len(no_reverso)-50} autres)')

with open(REPORT_FILE, 'w', encoding='utf-8') as f:
    f.write('\n'.join(lines))
print(f'\n→ {REPORT_FILE}')

# 5. Génère les overrides proposés
# Stratégie : pour chaque verbe avec divergences, on prend les valeurs reverso
# qui ne sont PAS clairement invalides (filtres comme dans generate_overrides_from_studyquran)
proposals = {}
for d in diffs:
    key = f"{d['root']}:1:active"
    if key in existing and not key.startswith('_'):
        # Déjà overridé manuellement — on respecte
        existing_fields = set(existing[key].keys()) - {'comment'}
    else:
        existing_fields = set()
    if d['field'] in existing_fields:
        continue
    # Filtres pragmatiques
    ours = d['ours']; theirs = d['theirs']; field = d['field']
    th_devoc = devoc(theirs)
    if not theirs or len(th_devoc) < 2: continue
    if theirs.startswith('ال'): continue
    if field == 'past_3ms' and th_devoc.startswith(('ي','ت','ن')):
        continue   # reverso a basculé sur le présent → faux positif
    if field == 'present_3ms' and not th_devoc.startswith(('ي','ت','ن')):
        continue
    if 'participle' in field and theirs.endswith('ة'):
        continue   # forme féminine
    # OK
    proposals.setdefault(key, {})[field] = strip_trailing_tanwin(theirs)

# Ajoute un comment
for key, fields_dict in proposals.items():
    fields_dict['comment'] = 'Auto-généré depuis reverso (audit أجوف)'

with open(PROPOSED_FILE, 'w', encoding='utf-8') as f:
    json.dump(proposals, f, ensure_ascii=False, indent=2)
print(f'→ {PROPOSED_FILE} : {len(proposals)} verbes avec overrides proposés')
