"""
Phase 1 — Construction d'un jeu de test représentatif de ~200 verbes.

Lit le corpus, classifie chaque (racine, forme, voix) selon son type
morphologique (sain, creux, défectueux, géminé, lafif, hamza, Forms II-X),
puis échantillonne en privilégiant les racines à haute fréquence.

Sortie : morphology/test_set.json
  [
    {
      "category": "form1_sain_u",
      "root_ar": "ا خ ذ",
      "root_buck": "Ax*",
      "form": 1,
      "voice": "active",
      "lemma_ar": "أَخَذَ",
      "lemma_buck": ">axa*a",
      "occurrences": 273,
      "sample_loc": "2:48:14"
    },
    ...
  ]

Usage :
    python build_test_set.py
"""

import json
import os
import re
from collections import defaultdict

# Réutilise les utilitaires du script d'enrichissement
from enrich_with_qutrub import (
    INPUT_CORPUS, BUCK_TO_AR, buck_to_ar, root_to_spaced,
    FORM_RX, ROMAN_TO_INT, build_root_vowel_map
)

OUTPUT_FILE = os.path.join(os.path.dirname(__file__), 'test_set.json')

LOC_RX = re.compile(r'^\((\d+):(\d+):(\d+):(\d+)\)$')

# Cibles d'échantillonnage par catégorie (total ≈ 215)
TARGETS = {
    # Form I sain : 3 voyelles × 15 = 45
    'form1_sain_a': 15,   # R2 fatha (يَفْعَلُ)
    'form1_sain_u': 15,   # R2 damma (يَفْعُلُ)
    'form1_sain_i': 15,   # R2 kasra (يَفْعِلُ)
    # Form I creux : 2 × 12 = 24
    'form1_creux_w': 12,  # R2 = و
    'form1_creux_y': 12,  # R2 = ي
    # Form I défectueux : 2 × 12 = 24
    'form1_def_w': 12,    # R3 = و (Buck w)
    'form1_def_y': 12,    # R3 = ي (Buck y)
    # Form I géminé R2=R3
    'form1_gemine': 12,
    # Form I hamza (le corpus encode toute hamza-racine par 'A')
    'form1_hamza_r1': 8,
    'form1_hamza_r2': 8,
    'form1_hamza_r3': 8,
    # Form I lafif (deux faibles, généralement R1=و + R3=ي/و)
    'form1_lafif': 6,
    # Passive Form I (diversité)
    'form1_passive': 10,
    # Formes II à X
    'form2': 12,
    'form3': 8,
    'form4': 12,
    'form5': 8,
    'form6': 6,
    'form7': 5,
    'form8': 10,   # incl. cas d'assimilation
    'form9': 2,
    'form10': 8,
}

# Le corpus Buckwalter encode hamza-racine par 'A' (alif). Pas de ' / > / < / & / } dans les racines.
# w / y sont les vraies faibles (و / ي). 'A' est traité comme hamza.
WEAK_BUCK = set('wy')   # و ي

def classify(root_buck, form_num, voice):
    """Retourne le tag de catégorie ou None si non concerné."""
    if voice == 'passive':
        if form_num == 1:
            return 'form1_passive'
        return None

    if form_num >= 2:
        return f'form{form_num}'

    # Form I active : classifier par type morphologique
    if len(root_buck) < 3 or len(root_buck) > 3:
        return None  # racines à 4 lettres ignorées (rare)
    r1, r2, r3 = root_buck

    # Hamza prioritaire (encodée 'A' dans les racines du corpus)
    if r1 == 'A':
        return 'form1_hamza_r1'
    if r2 == 'A':
        return 'form1_hamza_r2'
    if r3 == 'A':
        return 'form1_hamza_r3'

    # Lafif : R1 et R3 faibles, ou R2 et R3 faibles
    r1_weak = r1 in WEAK_BUCK
    r2_weak = r2 in WEAK_BUCK
    r3_weak = r3 in WEAK_BUCK
    if (r1_weak and r3_weak) or (r2_weak and r3_weak):
        return 'form1_lafif'

    # Géminé : R2 == R3 (les deux non-faibles, sinon ce serait creux/défectueux d'abord)
    if r2 == r3 and not r2_weak:
        return 'form1_gemine'

    # Creux : R2 faible
    if r2 == 'w': return 'form1_creux_w'
    if r2 == 'y': return 'form1_creux_y'

    # Défectueux : R3 faible
    if r3 == 'w': return 'form1_def_w'
    if r3 == 'y': return 'form1_def_y'

    # Reste = sain. Voyelle de R2 raffinée après.
    return 'form1_sain'


def main():
    print('[1/3] Lecture du corpus + agrégation par (root, form, voice)...')

    # vowel_map : racine_ar → 'a' | 'u' | 'i' (extrait des IMPF Form I)
    vowel_map = build_root_vowel_map(INPUT_CORPUS)
    print(f'      Map voyelles R2 (Form I sain) : {len(vowel_map)} racines')

    # agrégateur : (root_buck, form_num, voice) → dict
    agg = defaultdict(lambda: {'occ': 0, 'lemma_buck': None, 'sample_loc': None})

    with open(INPUT_CORPUS, 'r', encoding='utf-8') as f:
        for line in f:
            if line.startswith('#') or line.startswith('LOCATION') or not line.strip():
                continue
            parts = line.rstrip('\n').split('\t')
            if len(parts) != 4 or parts[2] != 'V':
                continue
            loc, form_buck, _tag, features = parts
            tags = features.split('|')
            m = LOC_RX.match(loc)
            if not m: continue
            sura, aya, word, seg = m.groups()

            root_buck = None
            lemma_buck = None
            form_num = 1
            for t in tags:
                if t.startswith('ROOT:'): root_buck = t[5:]
                elif t.startswith('LEM:'): lemma_buck = t[4:]
                else:
                    mm = FORM_RX.match(t)
                    if mm: form_num = ROMAN_TO_INT[mm.group(1)]
            if not root_buck: continue

            voice = 'passive' if 'PASS' in tags else 'active'
            key = (root_buck, form_num, voice)
            row = agg[key]
            row['occ'] += 1
            if row['lemma_buck'] is None:
                row['lemma_buck'] = lemma_buck
                row['sample_loc'] = f'{sura}:{aya}:{word}'

    print(f'      Triplets uniques (root, form, voice) : {len(agg)}')

    print('\n[2/3] Classification...')
    buckets = defaultdict(list)

    for (root_buck, form_num, voice), data in agg.items():
        cat = classify(root_buck, form_num, voice)
        if cat is None: continue

        # Raffinement sain : ajouter le suffixe voyelle (_a / _u / _i)
        if cat == 'form1_sain':
            root_ar = root_to_spaced(root_buck)
            vowel = vowel_map.get(root_ar)
            if vowel is None:
                continue  # voyelle inconnue : on ne peut pas catégoriser proprement
            cat = f'form1_sain_{vowel}'

        if cat not in TARGETS:
            continue  # catégorie non échantillonnée

        buckets[cat].append({
            'category': cat,
            'root_ar': root_to_spaced(root_buck),
            'root_buck': root_buck,
            'form': form_num,
            'voice': voice,
            'lemma_ar': buck_to_ar(data['lemma_buck']) if data['lemma_buck'] else None,
            'lemma_buck': data['lemma_buck'],
            'occurrences': data['occ'],
            'sample_loc': data['sample_loc'],
        })

    print('\n[3/3] Échantillonnage (tri par fréquence desc.)...')
    test_set = []
    print(f"\n{'Catégorie':<22} {'Dispo':>6} {'Pris':>6}")
    print('-' * 40)
    for cat, target in TARGETS.items():
        avail = sorted(buckets.get(cat, []), key=lambda r: -r['occurrences'])
        chosen = avail[:target]
        test_set.extend(chosen)
        marker = '' if len(chosen) >= target else '  ⚠ partiel'
        print(f'{cat:<22} {len(avail):>6} {len(chosen):>6}{marker}')
    print('-' * 40)
    print(f"{'TOTAL':<22} {'':>6} {len(test_set):>6}")

    with open(OUTPUT_FILE, 'w', encoding='utf-8') as out:
        json.dump(test_set, out, ensure_ascii=False, indent=2)
    print(f'\nGénéré : {OUTPUT_FILE}')


if __name__ == '__main__':
    main()
