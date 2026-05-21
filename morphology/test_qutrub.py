"""
Test de Qutrub — version 2 : affiche les valeurs réelles 3MS et 2MS
pour vérifier que la conjugaison est exacte avant de lancer le batch.

Lance :
    python test_qutrub.py
"""

import sys, os
sys.stdout.reconfigure(encoding='utf-8')

QUTRUB_PATH = r'c:\MAMP\htdocs\qutrub'
if not os.path.isdir(QUTRUB_PATH):
    print(f"ERREUR : {QUTRUB_PATH} n'existe pas.")
    sys.exit(1)
sys.path.insert(0, QUTRUB_PATH)

from libqutrub.conjugator import conjugate

FATHA, DAMMA, KASRA = 'َ', 'ُ', 'ِ'

# Verbes-test (5 grands cas)
test_verbs = [
    ('كَتَبَ',  DAMMA,  'sain',           'كَتَبَ',  'يَكْتُبُ',  'اُكْتُبْ'),
    ('قَالَ',   DAMMA,  'creux و (q-w-l)', 'قَالَ',   'يَقُولُ',  'قُلْ'),
    ('كَادَ',   KASRA,  'creux ي (k-y-d)', 'كَادَ',   'يَكِيدُ',  'كِدْ'),
    ('بَلَا',   DAMMA,  'défectueux و',    'بَلَا',   'يَبْلُو',  'اُبْلُ'),
    ('رَمَى',   KASRA,  'défectueux ي',    'رَمَى',   'يَرْمِي',  'اِرْمِ'),
]

print("=" * 76)
print(f"{'VERBE':<8} {'TYPE':<18} {'PASSÉ 3MS':<12} {'PRÉSENT 3MS':<14} {'IMPÉRATIF 2MS':<14}")
print("=" * 76)

KEY_PAST_ACTIVE  = 'الماضي المعلوم'
KEY_PRES_ACTIVE  = 'المضارع المعلوم'
KEY_PAST_PASSIVE = 'الماضي المجهول'
KEY_PRES_PASSIVE = 'المضارع المجهول'
KEY_IMPERATIVE   = 'الأمر'
PRON_3MS = 'هو'
PRON_2MS = 'أنت'

for verb, ftype, label, exp_past, exp_pres, exp_impv in test_verbs:
    try:
        r = conjugate(verb, ftype, alltense=True, transitive=True, display_format='DICT')
        got_past = r.get(KEY_PAST_ACTIVE,  {}).get(PRON_3MS, '?')
        got_pres = r.get(KEY_PRES_ACTIVE,  {}).get(PRON_3MS, '?')
        got_impv = r.get(KEY_IMPERATIVE,   {}).get(PRON_2MS, '?')
        ok_past = '✓' if got_past == exp_past else '✗'
        ok_pres = '✓' if got_pres == exp_pres else '✗'
        ok_impv = '✓' if got_impv == exp_impv else '~'
        print(f"{verb:<8} {label:<18} {got_past:<10} {ok_past}  {got_pres:<12} {ok_pres}  {got_impv:<12} {ok_impv}")
        # Affiche aussi la voix passive pour info
        got_past_pass = r.get(KEY_PAST_PASSIVE, {}).get(PRON_3MS, '')
        got_pres_pass = r.get(KEY_PRES_PASSIVE, {}).get(PRON_3MS, '')
        if got_past_pass or got_pres_pass:
            print(f"         (passif : {got_past_pass} / {got_pres_pass})")
    except Exception as e:
        print(f"{verb:<8}  ERREUR : {type(e).__name__}: {e}")

print("\n" + "=" * 76)
print("Si tu vois beaucoup de ✓ pour passé/présent, on est prêts pour enrich.")
print("Les imperatifs marqués ~ ne sont pas forcément faux : leur forme exacte")
print("dépend de la convention orthographique (par ex. اُكْتُبْ vs اكْتُبْ).")
