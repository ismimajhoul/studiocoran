"""Exporte la table pages en JSON minimal pour lookup côté client."""
import subprocess, json, os, sys

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')

# NB : la table `pages` locale est incomplète (93 pages seulement). On
# va donc chercher les 604 pages directement sur la prod alwaysdata.
out = subprocess.run(
    ['C:/MAMP/bin/mysql/bin/mysql.exe',
     '-h', 'mysql-studiocoran.alwaysdata.net',
     '-u', '323869', '-pJesaispas94', 'studiocoran_3',
     '--ssl-mode=DISABLED',
     '--default-character-set=utf8mb4', '-B', '-N', '-e',
     "SELECT page, sura, first_aya, last_sura, last_aya FROM pages ORDER BY page;"],
    capture_output=True, text=True, encoding='utf-8'
)
seen = set()
pages = []
for line in out.stdout.splitlines():
    parts = line.split('\t')
    if len(parts) != 5: continue
    p, s, a, ls, la = (int(x) for x in parts)
    key = (p, s, a, ls, la)
    if key in seen: continue
    seen.add(key)
    pages.append({'p': p, 's': s, 'a': a, 'ls': ls, 'la': la})

# Tri final par page
pages.sort(key=lambda x: (x['p'], x['s'], x['a']))

out_path = os.path.join(os.path.dirname(__file__), '..', 'pages.json')
with open(out_path, 'w', encoding='utf-8') as f:
    json.dump(pages, f, ensure_ascii=False, indent=None, separators=(',', ':'))
print(f'→ {os.path.abspath(out_path)}')
print(f'  {len(pages)} entrées (de la page {pages[0]["p"]} à {pages[-1]["p"]})')
