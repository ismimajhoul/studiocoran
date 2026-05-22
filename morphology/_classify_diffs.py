"""
Liste TOUTES les divergences (incl. masdar) entre notre canonique et Almaany,
pour les entrées avec match propre (skeleton). Classification manuelle ensuite.
"""
import sys, json, subprocess, unicodedata
sys.stdout.reconfigure(encoding='utf-8')

with open('almaany_truth.json', 'r', encoding='utf-8') as f:
    data = json.load(f)

out = subprocess.run(
    ['C:/MAMP/bin/mysql/bin/mysql.exe', '-u', 'root', '-proot',
     'quran_wasla', '--default-character-set=utf8mb4', '-B', '-N', '-e',
     'SELECT root_ar,verb_form,voice,past_3ms,present_3ms,masdar,active_participle,passive_participle FROM quran_verb_canonical'],
    capture_output=True, text=True, encoding='utf-8'
)
can = {}
for line in out.stdout.splitlines():
    c = line.split('\t')
    if len(c) < 8: continue
    can[(c[0], int(c[1]), c[2])] = {'past': c[3], 'pres': c[4], 'mas': c[5], 'act': c[6], 'pas': c[7]}

def clean(s):
    if not s: return ''
    s = ''.join(ch for ch in s if not unicodedata.category(ch).startswith('M'))
    return (s.replace('ٱ', 'ا').replace('آ', 'ا').replace('أ', 'ا')
              .replace('إ', 'ا').replace('ء', '').replace('ى', 'ا')
              .replace('ؤ', 'و').replace('ئ', 'ي'))

print("# Tableau de classification des divergences")
print("# Format : status | catégorie | lemma | champ | nous | Almaany")
print("# status à remplir manuellement : NOUS_FAUX | ALMAANY_FAUX | LES_DEUX_VALIDES")
print()

n = 0
for r in sorted(data, key=lambda x: (x['category'], -x['occurrences'])):
    a = r['almaany']
    if a.get('status') != 'ok' or a.get('match_quality') == 'fallback_first_entry':
        continue
    key = (r['root_ar'], r['form'], r['voice'])
    c = can.get(key)
    if not c: continue

    # Past, présent, actif, passif
    for field, ours_k, theirs_k in [
        ('past', c['past'], a.get('past_3ms_almaany')),
        ('pres', c['pres'], a.get('present_3ms_almaany')),
        ('act',  c['act'],  a.get('active_participle_almaany')),
        ('pas',  c['pas'],  a.get('passive_participle_almaany')),
    ]:
        if not ours_k or not theirs_k or ours_k == 'NULL':
            continue
        if clean(ours_k) == clean(theirs_k):
            continue
        print(f"? | {r['category']:<18} | {r['lemma_ar']:<14} | {field:<4} | {ours_k:<18} | {theirs_k}")
        n += 1

    # Masdar (notre vs liste Almaany)
    our_masdar = c['mas']
    almaany_masdars = a.get('masdars_almaany', []) or []
    if our_masdar and our_masdar != 'NULL' and almaany_masdars:
        match = any(clean(our_masdar) == clean(m) for m in almaany_masdars)
        if not match:
            print(f"? | {r['category']:<18} | {r['lemma_ar']:<14} | masdar | {our_masdar:<18} | {' / '.join(almaany_masdars)}")
            n += 1

print(f"\n# Total divergences: {n}")
