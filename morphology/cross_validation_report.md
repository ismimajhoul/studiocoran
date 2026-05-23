# Cross-validation Qutrub vs reverso vs studyquran

- **Canonical actif** : 1709 verbes
- **Avec reverso ET studyquran** : 68
- **Avec reverso seul** : 792
- **Avec studyquran seul** : 51

## Catégories de divergences

| Catégorie | Count | Sens |
|---|---|---|
| AGREE | 3819 | Nous + reverso + sq tous d'accord |
| DIFFER_HC | 4 | **HIGH CONFIDENCE** : reverso + sq d'accord contre nous |
| REV_ALONE | 10 | reverso seul diffère (sq d'accord avec nous) |
| SQ_ALONE | 13 | sq seul diffère (reverso d'accord avec nous) |
| REV_ONLY | 1305 | Pas de sq disponible, reverso seul diffère |
| SQ_ONLY | 5 | Pas de reverso disponible, sq seul diffère |
| CONFLICT | 5 | reverso et sq diffèrent entre eux ET de nous |

## DIFFER_HC : overrides à haute confiance

reverso et studyquran sont d'accord, contre nous. Très probablement notre erreur.

### كَادَ  (`ك ي د:1:active`)
- **present_3ms** : nous=`يَكِيدُ` / rev=`يَكَادُ` / sq=`يَكَادُ`

### كَانَ  (`ك ي ن:1:active`)
- **present_3ms** : nous=`يَكِينُ` / rev=`يَكُونُ` / sq=`يَكُوْنُ`

### تَلَقَّى  (`ل ق ي:5:active`)
- **masdar** : nous=`تَلَقُّي` / rev=`تَلَقٍّ` / sq=`تَلَقٍّ`

### أَنْبَأَ  (`ن ب ا:4:active`)
- **active_participle** : nous=`مُنْبِأ` / rev=`مُنْبِئ` / sq=`مُنْبِئٌ`

## CONFLICT : reverso ≠ studyquran ≠ nous

Trois sources en conflit. À investiguer manuellement.

- **أَمَنَ** masdar : nous=`إيمَانٌ` / rev=`أَمْن` / sq=`اِأْمَانٌ`  (`ا م ن:1:active`)
- **أَمَنَ** active_participle : nous=`أَامِن` / rev=`آمِن` / sq=`مُؤْمِنٌ`  (`ا م ن:1:active`)
- **كَادَ** passive_participle : nous=`مَكِيد` / rev=`مَكُود` / sq=`الأَجْوَفُ`  (`ك ي د:1:active`)
- **كَانَ** passive_participle : nous=`مَكِين` / rev=`مَكُون` / sq=`الأَجْوَفُ`  (`ك ي ن:1:active`)
- **أَنْبَأَ** masdar : nous=`إِنْبَاأ` / rev=`إِنْبَاء` / sq=`إِنْبِيَاءٌ`  (`ن ب ا:4:active`)