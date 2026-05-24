"""Génère une checklist markdown des verbes faibles/hamza à vérifier."""
import csv, os, sys

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')

DIR = os.path.dirname(__file__)
INPUT  = os.path.join(DIR, 'weak_verbs_list.tsv')
OUTPUT = os.path.join(DIR, 'weak_verbs_checklist.md')

def classify(root):
    """Classification rapide pour aider à savoir où regarder."""
    L = root.split()
    if len(L) != 3: return '?'
    r1, r2, r3 = L
    weaks = {'و', 'ي'}
    hamzas = {'ا'}
    r1w, r2w, r3w = r1 in weaks, r2 in weaks, r3 in weaks
    r1h, r2h, r3h = r1 in hamzas, r2 in hamzas, r3 in hamzas
    bits = []
    if r1w and r3w: bits.append('لفيف مفروق')
    elif r2w and r3w: bits.append('لفيف مقرون')
    elif r2w: bits.append('أجوف')
    elif r3w: bits.append('ناقص')
    elif r1w: bits.append('مثال')
    if r1h: bits.append('مهموز R1')
    if r2h: bits.append('مهموز R2')
    if r3h: bits.append('مهموز R3')
    return ' + '.join(bits) if bits else 'sain ?'

rows = []
with open(INPUT, encoding='utf-8') as f:
    next(f)  # warning mysql
    reader = csv.DictReader(f, delimiter='\t')
    for r in reader:
        try: freq = int(r['freq'])
        except: freq = 0
        rows.append({
            'root':    r['root_ar'],
            'freq':    freq,
            'past':    r['past_3ms']        if r['past_3ms']        != 'NULL' else '—',
            'pres':    r['present_3ms']     if r['present_3ms']     != 'NULL' else '—',
            'impv':    r['imperative_2ms']  if r['imperative_2ms']  != 'NULL' else '—',
            'masdar':  r['masdar']          if r['masdar']          != 'NULL' else '—',
            'actpart': r['active_participle']  if r['active_participle']  != 'NULL' else '—',
            'class':   classify(r['root_ar']),
        })
rows.sort(key=lambda x: -x['freq'])

def emit_tier(title, items):
    lines = [f'## {title} ({len(items)} verbes)', '']
    lines.append('| ☐ | Freq | Racine | Classification | Passé | Présent | Impératif | Masdar | Participe actif |')
    lines.append('|---|---:|---|---|---|---|---|---|---|')
    for r in items:
        lines.append(
            f"| ☐ | {r['freq']} | `{r['root']}` | {r['class']} | "
            f"{r['past']} | {r['pres']} | {r['impv']} | {r['masdar']} | {r['actpart']} |"
        )
    lines.append('')
    return lines

high = [r for r in rows if r['freq'] >= 100]
mid  = [r for r in rows if 20 <= r['freq'] < 100]
low  = [r for r in rows if r['freq'] < 20]

out = []
out.append('# Checklist verbes faibles / hamza à vérifier')
out.append('')
out.append(f'Total : **{len(rows)} verbes** (racine contenant و / ي / ا hamza).')
out.append('Données Form I active sortie de Qutrub — c\'est là que les bugs sont fréquents.')
out.append('')
out.append('Conventions :')
out.append('- `أجوف` (R2 faible) · `ناقص` (R3 faible) · `مثال` (R1 faible) · `لفيف` (≥2 faibles)')
out.append('- `مهموز Rn` : la racine encode une hamza par ا à la position n')
out.append('- Cocher ☐ → ✅ quand validé · ✏️ si bug à corriger (signaler à Claude)')
out.append('')
out.extend(emit_tier('🔥 Tier 1 — Critiques (freq ≥ 100)', high))
out.extend(emit_tier('⚡ Tier 2 — Importants (20 ≤ freq < 100)', mid))
out.extend(emit_tier('💧 Tier 3 — Longue traîne (freq < 20)', low))

with open(OUTPUT, 'w', encoding='utf-8') as f:
    f.write('\n'.join(out))

print(f'→ {OUTPUT}')
print(f'  Tier 1 (≥100) : {len(high)}')
print(f'  Tier 2 (20-99): {len(mid)}')
print(f'  Tier 3 (<20)  : {len(low)}')
