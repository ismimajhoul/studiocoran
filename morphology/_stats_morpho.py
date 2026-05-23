"""Stats morphologiques des verbes du Coran : combien par catégorie."""
import sys, subprocess
from collections import Counter
sys.stdout.reconfigure(encoding='utf-8')

def classify(root):
    """Reproduction de classifyVerb en Python."""
    L = root.split()
    if len(L) == 4:
        a, b, c, d = L
        if a == c and b == d:
            return ('صحيح', 'مضعف رباعي')
        return ('صحيح', 'رباعي')
    if len(L) != 3:
        return ('?', '?')
    r1, r2, r3 = L
    def isW(c): return c == 'و' or c == 'ي'
    def isH(c): return c == 'ا' or c in 'ءأإآؤئ'
    r1W, r2W, r3W = isW(r1), isW(r2), isW(r3)
    wc = (1 if r1W else 0) + (1 if r2W else 0) + (1 if r3W else 0)
    if wc >= 2:        return ('معتل', 'لفيف')
    if wc >= 1:
        if r1W: return ('معتل', 'مثال')
        if r2W: return ('معتل', 'أجوف')
        if r3W: return ('معتل', 'ناقص')
    if r2 == r3:       return ('صحيح', 'مضعف')
    if isH(r1) or isH(r2) or isH(r3): return ('صحيح', 'مهموز')
    return ('صحيح', 'سالم')


# Récupère les triplets canonical
out = subprocess.run(
    ['C:/MAMP/bin/mysql/bin/mysql.exe', '-u', 'root', '-proot',
     'quran_wasla', '--default-character-set=utf8mb4', '-B', '-N', '-e',
     "SELECT root_ar, verb_form, voice FROM quran_verb_canonical"],
    capture_output=True, text=True, encoding='utf-8'
)
triplets = [line.split('\t') for line in out.stdout.splitlines() if line]

# Récupère aussi les occurrences (= un mot dans un verset)
out2 = subprocess.run(
    ['C:/MAMP/bin/mysql/bin/mysql.exe', '-u', 'root', '-proot',
     'quran_wasla', '--default-character-set=utf8mb4', '-B', '-N', '-e',
     "SELECT root_ar, COALESCE(verb_form,1), CASE WHEN features LIKE '%PASS%' THEN 'passive' ELSE 'active' END FROM quran_morphology_verbs"],
    capture_output=True, text=True, encoding='utf-8'
)
occurrences = [line.split('\t') for line in out2.stdout.splitlines() if line]

# Stats par type
print('=== Stats par catégorie morphologique ===')
print()
print(f"{'Branche':<8} {'Sous-type':<14} {'Racines':>8} {'Triplets':>9} {'Occurrences':>12}")
print('-' * 60)

# Map root → type
root_type = {}
for root, vf, voice in triplets:
    branche, sub = classify(root)
    root_type[root] = (branche, sub)

# Count uniqueness
roots_by_type = Counter()
for root, t in root_type.items():
    roots_by_type[t] += 1

# Count triplets and occurrences
triplets_by_type = Counter()
for root, vf, voice in triplets:
    t = classify(root)
    triplets_by_type[t] += 1

occ_by_type = Counter()
for root, vf, voice in occurrences:
    t = classify(root)
    occ_by_type[t] += 1

# Sort by branch then frequency
all_types = sorted(roots_by_type.keys(), key=lambda x: (x[0] != 'صحيح', -occ_by_type.get(x, 0)))
for t in all_types:
    branche, sub = t
    print(f"{branche:<8} {sub:<14} {roots_by_type[t]:>8} {triplets_by_type[t]:>9} {occ_by_type[t]:>12}")

# Totals
print('-' * 60)
print(f"{'TOTAL':<23} {sum(roots_by_type.values()):>8} {sum(triplets_by_type.values()):>9} {sum(occ_by_type.values()):>12}")
print()

# Verbes avec hamza somewhere
print('=== Verbes avec HAMZA quelque part dans la racine ===')
hamza_roots = set()
for root in root_type:
    L = root.split()
    if any(c == 'ا' or c in 'ءأإآؤئ' for c in L):
        hamza_roots.add(root)
hamza_occ = sum(1 for r, _, _ in occurrences if r in hamza_roots)
print(f'Racines avec hamza : {len(hamza_roots)} / {len(root_type)} ({len(hamza_roots)*100//len(root_type)}%)')
print(f'Occurrences avec hamza : {hamza_occ} / {len(occurrences)} ({hamza_occ*100//len(occurrences)}%)')
print()

# Verbes défectueux R3 weak
print('=== Verbes DÉFECTUEUX (R3 = و ou ي) ===')
def_roots = set()
for root in root_type:
    L = root.split()
    if len(L) == 3 and L[2] in ('و', 'ي'):
        def_roots.add(root)
def_occ = sum(1 for r, _, _ in occurrences if r in def_roots)
print(f'Racines défectueuses : {len(def_roots)} ({len(def_roots)*100//len(root_type)}%)')
print(f'Occurrences : {def_occ} ({def_occ*100//len(occurrences)}%)')
print()

# Verbes creux R2 weak
print('=== Verbes CREUX (R2 = و ou ي) ===')
creux_roots = set()
for root in root_type:
    L = root.split()
    if len(L) == 3 and L[1] in ('و', 'ي'):
        creux_roots.add(root)
creux_occ = sum(1 for r, _, _ in occurrences if r in creux_roots)
print(f'Racines creuses : {len(creux_roots)} ({len(creux_roots)*100//len(root_type)}%)')
print(f'Occurrences : {creux_occ} ({creux_occ*100//len(occurrences)}%)')
