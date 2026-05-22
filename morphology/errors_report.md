# Rapport d'erreurs — comparaison Qutrub vs Almaany (Phase 1)

- **Verbes testés** : 216
- **Match parfait** : 8
- **Avec erreurs** : 55
- **Skipped (pas dans Almaany / pas de match propre)** : 153
  - not_found : 145
  - almaany_no_match : 7
  - exception : 1
- **Total divergences** : 104

## Top causes d'erreur (toutes catégories confondues)

| Cause | Count |
|---|---|
| masdar_pattern | 37 |
| almaany_no_passive_participle | 15 |
| almaany_no_active_participle | 11 |
| autre_present_3ms | 9 |
| almaany_no_present_3ms | 7 |
| autre_active_participle | 5 |
| manque_active_participle | 5 |
| manque_passive_participle | 5 |
| manque_masdar | 2 |
| shadda_past_3ms | 2 |
| shadda_present_3ms | 2 |
| autre_passive_participle | 2 |
| autre_past_3ms | 2 |

## Par catégorie morphologique

### form10 (3 erreurs)
- almaany_no_present_3ms : 1
- almaany_no_active_participle : 1
- almaany_no_passive_participle : 1

### form1_creux_w (5 erreurs)
- almaany_no_passive_participle : 2
- masdar_pattern : 1
- almaany_no_present_3ms : 1
- almaany_no_active_participle : 1

### form1_def_w (1 erreurs)
- masdar_pattern : 1

### form1_def_y (1 erreurs)
- masdar_pattern : 1

### form1_gemine (3 erreurs)
- almaany_no_present_3ms : 1
- almaany_no_active_participle : 1
- almaany_no_passive_participle : 1

### form1_hamza_r1 (1 erreurs)
- masdar_pattern : 1

### form1_lafif (3 erreurs)
- almaany_no_active_participle : 1
- almaany_no_passive_participle : 1
- masdar_pattern : 1

### form1_passive (18 erreurs)
- manque_active_participle : 5
- manque_passive_participle : 5
- masdar_pattern : 3
- autre_present_3ms : 2
- autre_past_3ms : 1
- shadda_past_3ms : 1
- shadda_present_3ms : 1

### form1_sain_a (15 erreurs)
- masdar_pattern : 7
- manque_masdar : 2
- autre_present_3ms : 2
- almaany_no_passive_participle : 2
- almaany_no_active_participle : 1
- autre_active_participle : 1

### form1_sain_i (20 erreurs)
- masdar_pattern : 9
- almaany_no_active_participle : 3
- almaany_no_passive_participle : 2
- almaany_no_present_3ms : 1
- shadda_past_3ms : 1
- shadda_present_3ms : 1
- autre_active_participle : 1
- autre_passive_participle : 1
- autre_present_3ms : 1

### form1_sain_u (26 erreurs)
- masdar_pattern : 10
- almaany_no_passive_participle : 6
- almaany_no_present_3ms : 3
- almaany_no_active_participle : 3
- autre_present_3ms : 2
- autre_active_participle : 2

### form2 (1 erreurs)
- masdar_pattern : 1

### form3 (5 erreurs)
- autre_past_3ms : 1
- autre_present_3ms : 1
- autre_active_participle : 1
- autre_passive_participle : 1
- masdar_pattern : 1

### form5 (1 erreurs)
- autre_present_3ms : 1

### form7 (1 erreurs)
- masdar_pattern : 1

## Détail des erreurs (verbe par verbe)

### أَتَى  (form1_hamza_r1, racine `ا ت ي`)
- **masdar** : nous=`إِتْيَان` / Almaany=`إتيانة / مأتاة / مَأْتًى`  →  *masdar_pattern*

### بَعَثَ  (form1_sain_a, racine `ب ع ث`)
- **masdar** : nous=`بَعْثٌ` / Almaany=`بَعْثًا / بِعْثةً / بَعْثةً`  →  *masdar_pattern*

### بَلَغَ  (form1_sain_u, racine `ب ل غ`)
- **masdar** : nous=`بُلُوغٌ` / Almaany=`بُلوغًا / بَلاغًا`  →  *masdar_pattern*

### تَوَلَّىٰ  (form5, racine `و ل ي`)
- **present_3ms** : nous=`يَتَوَلَّى` / Almaany=`تولَّى`  →  *autre_present_3ms*

### جَعَلَ  (form1_sain_a, racine `ج ع ل`)
- **masdar** : nous=`∅` / Almaany=`جَعْلاً`  →  *manque_masdar*

### حَسِبَ  (form1_sain_a, racine `ح س ب`)
- **masdar** : nous=`حُسْبَانٌ` / Almaany=`حِسابًا / حَسْبًا / حُسْبانًا / حِسَبةً`  →  *masdar_pattern*

### حَكَمَ  (form1_sain_u, racine `ح ك م`)
- **masdar** : nous=`حُكْم` / Almaany=`حُكُومَةٌ`  →  *masdar_pattern*

### حَمَلَ  (form1_sain_i, racine `ح م ل`)
- **masdar** : nous=`حَمْل` / Almaany=`حَمْلاً`  →  *masdar_pattern*

### خَافَ  (form1_creux_w, racine `خ و ف`)
- **present_3ms** : nous=`يَخُوفُ` / Almaany=`∅`  →  *almaany_no_present_3ms*
- **active_participle** : nous=`خَائِف` / Almaany=`∅`  →  *almaany_no_active_participle*
- **passive_participle** : nous=`مَخُوف` / Almaany=`∅`  →  *almaany_no_passive_participle*

### خَرَجَ  (form1_sain_u, racine `خ ر ج`)
- **present_3ms** : nous=`يَخْرُجُ` / Almaany=`∅`  →  *almaany_no_present_3ms*
- **active_participle** : nous=`خَارِج` / Almaany=`∅`  →  *almaany_no_active_participle*
- **passive_participle** : nous=`مَخْرُوج` / Almaany=`∅`  →  *almaany_no_passive_participle*

### خَلَقَ  (form1_sain_u, racine `خ ل ق`)
- **active_participle** : nous=`خَالِق` / Almaany=`خليق`  →  *autre_active_participle*
- **masdar** : nous=`خَلْقٌ` / Almaany=`خَلاقَةً`  →  *masdar_pattern*

### دَخَلَ  (form1_sain_u, racine `د خ ل`)
- **active_participle** : nous=`دَاخِل` / Almaany=`دخِل`  →  *autre_active_participle*
- **passive_participle** : nous=`مَدْخُول` / Almaany=`∅`  →  *almaany_no_passive_participle*
- **masdar** : nous=`دُخُولٌ` / Almaany=`دَخْلاً / دَخَلاً`  →  *masdar_pattern*

### دَعَا  (form1_def_w, racine `د ع و`)
- **masdar** : nous=`دُعَاء` / Almaany=`دعيّ`  →  *masdar_pattern*

### ذَكَرَ  (form1_sain_u, racine `ذ ك ر`)
- **masdar** : nous=`ذِكْرٌ` / Almaany=`ذِكْرًا / ذُكْرًا / ذِكْرى`  →  *masdar_pattern*

### ذَهَبَ  (form1_sain_a, racine `ذ ه ب`)
- **masdar** : nous=`ذَهَابٌ` / Almaany=`ذَهابًا / ذُهُوبًا`  →  *masdar_pattern*

### رَجَعَ  (form1_passive, racine `ر ج ع`)
- **past_3ms** : nous=`رُجِعَ` / Almaany=`رجَّعَ`  →  *shadda_past_3ms*
- **present_3ms** : nous=`يُرْجَعُ` / Almaany=`يُرجِّع`  →  *shadda_present_3ms*
- **active_participle** : nous=`∅` / Almaany=`مُرجِّع`  →  *manque_active_participle*
- **passive_participle** : nous=`∅` / Almaany=`مُرجَّعٌ`  →  *manque_passive_participle*

### رَجَعَ  (form1_sain_i, racine `ر ج ع`)
- **past_3ms** : nous=`رَجَعَ` / Almaany=`رجَّعَ`  →  *shadda_past_3ms*
- **present_3ms** : nous=`يَرْجِعُ` / Almaany=`يُرجِّع`  →  *shadda_present_3ms*
- **active_participle** : nous=`رَاجِع` / Almaany=`مُرجِّع`  →  *autre_active_participle*
- **passive_participle** : nous=`مَرْجُوع` / Almaany=`مُرجَّعٌ`  →  *autre_passive_participle*

### رَزَقَ  (form1_sain_u, racine `ر ز ق`)
- **masdar** : nous=`رِزْقٌ` / Almaany=`رَزْقًا`  →  *masdar_pattern*

### رَفَعَ  (form1_sain_a, racine `ر ف ع`)
- **active_participle** : nous=`رَافِع` / Almaany=`رَفيع`  →  *autre_active_participle*

### سَبَقَ  (form1_sain_i, racine `س ب ق`)
- **masdar** : nous=`سَبْقٌ` / Almaany=`سَبْقًا`  →  *masdar_pattern*

### سَجَدَ  (form1_sain_u, racine `س ج د`)
- **passive_participle** : nous=`مَسْجُود` / Almaany=`∅`  →  *almaany_no_passive_participle*

### سَمِعَ  (form1_sain_a, racine `س م ع`)
- **masdar** : nous=`سَمْع` / Almaany=`سماعًا / سَمْعًا`  →  *masdar_pattern*

### شَكَرَ  (form1_sain_u, racine `ش ك ر`)
- **masdar** : nous=`شُكْرٌ` / Almaany=`شُكْرًا / شُكرانًا / شُكورًا`  →  *masdar_pattern*

### صَبَرَ  (form1_sain_i, racine `ص ب ر`)
- **masdar** : nous=`صَبْرٌ` / Almaany=`صَبْرًا`  →  *masdar_pattern*

### ضَرَبَ  (form1_sain_i, racine `ض ر ب`)
- **masdar** : nous=`ضَرْبٌ` / Almaany=`ضَرْبًا / ضَرَبانًا`  →  *masdar_pattern*

### ظَلَمَ  (form1_passive, racine `ظ ل م`)
- **active_participle** : nous=`∅` / Almaany=`ظالِم`  →  *manque_active_participle*
- **passive_participle** : nous=`∅` / Almaany=`مَظْلوم`  →  *manque_passive_participle*

### عَبَدَ  (form1_sain_u, racine `ع ب د`)
- **present_3ms** : nous=`يَعْبُدُ` / Almaany=`∅`  →  *almaany_no_present_3ms*
- **active_participle** : nous=`عَابِد` / Almaany=`∅`  →  *almaany_no_active_participle*
- **passive_participle** : nous=`مَعْبُود` / Almaany=`∅`  →  *almaany_no_passive_participle*

### عَرَفَ  (form1_sain_i, racine `ع ر ف`)
- **masdar** : nous=`عِرْفَانٌ` / Almaany=`عِرْفانًا / عِرِفَّانًا / مَعْرِفةً`  →  *masdar_pattern*

### عَقَلُ  (form1_sain_i, racine `ع ق ل`)
- **masdar** : nous=`عَقْل` / Almaany=`عَقْلاً`  →  *masdar_pattern*

### عَلِمَ  (form1_sain_a, racine `ع ل م`)
- **masdar** : nous=`عِلْمٌ` / Almaany=`عَلْمًا`  →  *masdar_pattern*

### عَمِلَ  (form1_sain_a, racine `ع م ل`)
- **masdar** : nous=`عَمَلٌ` / Almaany=`عَمَلاً`  →  *masdar_pattern*

### فَتَنُ  (form1_sain_i, racine `ف ت ن`)
- **active_participle** : nous=`فَاتِن` / Almaany=`∅`  →  *almaany_no_active_participle*
- **masdar** : nous=`فُتُونٌ` / Almaany=`فتونًا`  →  *masdar_pattern*

### فَعَلَ  (form1_sain_a, racine `ف ع ل`)
- **present_3ms** : nous=`يَفْعَلُ` / Almaany=`يطاوع`  →  *autre_present_3ms*
- **active_participle** : nous=`فَاعِل` / Almaany=`∅`  →  *almaany_no_active_participle*
- **passive_participle** : nous=`مَفْعُول` / Almaany=`∅`  →  *almaany_no_passive_participle*
- **masdar** : nous=`فِعْلٌ` / Almaany=`فعلاً`  →  *masdar_pattern*

### قَالَ  (form1_creux_w, racine `ق و ل`)
- **masdar** : nous=`قَوْل` / Almaany=`قولاً / قالاً / قَالةً`  →  *masdar_pattern*

### قَالَ  (form1_passive, racine `ق و ل`)
- **past_3ms** : nous=`قِيلَ` / Almaany=`قالَ`  →  *autre_past_3ms*
- **present_3ms** : nous=`يُقَالُ` / Almaany=`يقول`  →  *autre_present_3ms*
- **active_participle** : nous=`∅` / Almaany=`قائل`  →  *manque_active_participle*
- **passive_participle** : nous=`∅` / Almaany=`مقول`  →  *manque_passive_participle*
- **masdar** : nous=`قَوْل` / Almaany=`قولاً / قالاً / قَالةً`  →  *masdar_pattern*

### قَتَلَ  (form1_passive, racine `ق ت ل`)
- **active_participle** : nous=`∅` / Almaany=`قاتِل`  →  *manque_active_participle*
- **passive_participle** : nous=`∅` / Almaany=`مَقْتول`  →  *manque_passive_participle*
- **masdar** : nous=`قَتْلٌ` / Almaany=`قَتْلاً`  →  *masdar_pattern*

### قَتَلَ  (form1_sain_u, racine `ق ت ل`)
- **masdar** : nous=`قَتْلٌ` / Almaany=`قَتْلاً`  →  *masdar_pattern*

### قَدَرَ  (form1_sain_i, racine `ق د ر`)
- **present_3ms** : nous=`يَقْدِرُ` / Almaany=`تمكّن`  →  *autre_present_3ms*
- **active_participle** : nous=`قَادِر` / Almaany=`∅`  →  *almaany_no_active_participle*
- **passive_participle** : nous=`مَقْدُور` / Almaany=`∅`  →  *almaany_no_passive_participle*

### قَٰتَلَ  (form3, racine `ق ت ل`)
- **past_3ms** : nous=`قَاتَلَ` / Almaany=`قتَلَ`  →  *autre_past_3ms*
- **present_3ms** : nous=`يُقَاتِلُ` / Almaany=`يَقتُل`  →  *autre_present_3ms*
- **active_participle** : nous=`مُقَاتِل` / Almaany=`قاتِل`  →  *autre_active_participle*
- **passive_participle** : nous=`مُقَاتَل` / Almaany=`مَقْتول`  →  *autre_passive_participle*
- **masdar** : nous=`مُقَاتَلَة` / Almaany=`قَتْلاً`  →  *masdar_pattern*

### كَانَ  (form1_creux_w, racine `ك و ن`)
- **passive_participle** : nous=`مَكُون` / Almaany=`∅`  →  *almaany_no_passive_participle*

### كَذَّبَ  (form2, racine `ك ذ ب`)
- **masdar** : nous=`تَكْذِيب` / Almaany=`كِذّابًا`  →  *masdar_pattern*

### كَسَبَ  (form1_sain_i, racine `ك س ب`)
- **present_3ms** : nous=`يَكْسِبُ` / Almaany=`∅`  →  *almaany_no_present_3ms*
- **active_participle** : nous=`كَاسِب` / Almaany=`∅`  →  *almaany_no_active_participle*
- **passive_participle** : nous=`مَكْسُوب` / Almaany=`∅`  →  *almaany_no_passive_participle*

### كَفَرَ  (form1_sain_u, racine `ك ف ر`)
- **present_3ms** : nous=`يَكْفُرُ` / Almaany=`يؤمن`  →  *autre_present_3ms*
- **passive_participle** : nous=`مَكْفُور` / Almaany=`∅`  →  *almaany_no_passive_participle*
- **masdar** : nous=`كُفْرَانٌ` / Almaany=`كُفْرًا / كَفَرُوا`  →  *masdar_pattern*

### لَبِثَ  (form1_sain_a, racine `ل ب ث`)
- **masdar** : nous=`∅` / Almaany=`لَبْثًا / لُبْثًا`  →  *manque_masdar*

### مَسَّ  (form1_gemine, racine `م س س`)
- **present_3ms** : nous=`يَمَسُّ` / Almaany=`∅`  →  *almaany_no_present_3ms*
- **active_participle** : nous=`مَاسِس` / Almaany=`∅`  →  *almaany_no_active_participle*
- **passive_participle** : nous=`مَمْسُوس` / Almaany=`∅`  →  *almaany_no_passive_participle*

### نَصَرَ  (form1_sain_u, racine `ن ص ر`)
- **present_3ms** : nous=`يَنْصُرُ` / Almaany=`∅`  →  *almaany_no_present_3ms*
- **active_participle** : nous=`نَاصِر` / Almaany=`∅`  →  *almaany_no_active_participle*
- **passive_participle** : nous=`مَنْصُور` / Almaany=`∅`  →  *almaany_no_passive_participle*
- **masdar** : nous=`نُصْرَةٌ` / Almaany=`انتصار`  →  *masdar_pattern*

### نَّظَرَ  (form1_sain_u, racine `ن ظ ر`)
- **present_3ms** : nous=`يَنْظُرُ` / Almaany=`نظَرَ`  →  *autre_present_3ms*

### هَدَى  (form1_def_y, racine `ه د ي`)
- **masdar** : nous=`هَدْي` / Almaany=`هَدْيًا / هِدايةً`  →  *masdar_pattern*

### وَجَدَ  (form1_sain_i, racine `و ج د`)
- **masdar** : nous=`وِجْدَانٌ` / Almaany=`مَوجِدَةً`  →  *masdar_pattern*

### وَعَدَ  (form1_passive, racine `و ع د`)
- **present_3ms** : nous=`يُوعَدُ` / Almaany=`يَعِد`  →  *autre_present_3ms*
- **active_participle** : nous=`∅` / Almaany=`واعد`  →  *manque_active_participle*
- **passive_participle** : nous=`∅` / Almaany=`مَوْعود`  →  *manque_passive_participle*
- **masdar** : nous=`وَعْدٌ` / Almaany=`َعْدًا / عِدَةً / موعِدًا / موعِدةً / موعودًا`  →  *masdar_pattern*

### وَعَدَ  (form1_sain_i, racine `و ع د`)
- **masdar** : nous=`وَعْدٌ` / Almaany=`َعْدًا / عِدَةً / موعِدًا / موعِدةً / موعودًا`  →  *masdar_pattern*

### وَقَىٰ  (form1_lafif, racine `و ق ي`)
- **active_participle** : nous=`وَاقٍ` / Almaany=`∅`  →  *almaany_no_active_participle*
- **passive_participle** : nous=`مَوْقِيّ` / Almaany=`∅`  →  *almaany_no_passive_participle*
- **masdar** : nous=`وَقْي` / Almaany=`َقْيًا`  →  *masdar_pattern*

### وَهَبَ  (form1_sain_a, racine `و ه ب`)
- **present_3ms** : nous=`يَهَبُ` / Almaany=`يَهَبُه`  →  *autre_present_3ms*
- **passive_participle** : nous=`مَوْهُوب` / Almaany=`∅`  →  *almaany_no_passive_participle*

### ٱسْتَطَاعَ  (form10, racine `ط و ع`)
- **present_3ms** : nous=`يَسْتَطِيعُ` / Almaany=`∅`  →  *almaany_no_present_3ms*
- **active_participle** : nous=`مُسْتَطِيع` / Almaany=`∅`  →  *almaany_no_active_participle*
- **passive_participle** : nous=`مُسْتَطَاع` / Almaany=`∅`  →  *almaany_no_passive_participle*

### ٱنقَلَبَ  (form7, racine `ق ل ب`)
- **masdar** : nous=`اِنْقِلَاب` / Almaany=`انقلابًا`  →  *masdar_pattern*
