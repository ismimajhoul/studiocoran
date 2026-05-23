# Rapport d'erreurs — comparaison Qutrub vs Almaany (Phase 1)

- **Verbes testés** : 216
- **Match parfait** : 31
- **Avec erreurs** : 144
- **Skipped (pas dans Almaany / pas de match propre)** : 41
  - almaany_no_match : 37
  - exception : 3
  - not_found : 1
- **Total divergences** : 325

## Top causes d'erreur (toutes catégories confondues)

| Cause | Count |
|---|---|
| masdar_pattern | 71 |
| almaany_no_passive_participle | 42 |
| autre_active_participle | 38 |
| autre_present_3ms | 33 |
| almaany_no_active_participle | 30 |
| almaany_no_present_3ms | 22 |
| autre_passive_participle | 16 |
| autre_past_3ms | 16 |
| manque_masdar | 12 |
| final_faible_past_3ms | 8 |
| manque_active_participle | 7 |
| manque_passive_participle | 7 |
| final_faible_passive_participle | 6 |
| final_faible_active_participle | 5 |
| shadda_past_3ms | 4 |
| final_faible_present_3ms | 4 |
| shadda_present_3ms | 2 |
| shadda_passive_participle | 2 |

## Par catégorie morphologique

### form10 (9 erreurs)
- masdar_pattern : 3
- almaany_no_present_3ms : 2
- almaany_no_active_participle : 2
- almaany_no_passive_participle : 2

### form1_creux_w (17 erreurs)
- masdar_pattern : 7
- almaany_no_passive_participle : 3
- autre_present_3ms : 3
- almaany_no_active_participle : 2
- almaany_no_present_3ms : 1
- autre_passive_participle : 1

### form1_creux_y (7 erreurs)
- masdar_pattern : 3
- almaany_no_passive_participle : 2
- autre_present_3ms : 1
- autre_passive_participle : 1

### form1_def_w (29 erreurs)
- almaany_no_active_participle : 6
- almaany_no_passive_participle : 6
- final_faible_past_3ms : 4
- autre_present_3ms : 4
- masdar_pattern : 2
- autre_past_3ms : 2
- almaany_no_present_3ms : 2
- autre_active_participle : 1
- final_faible_present_3ms : 1
- final_faible_passive_participle : 1

### form1_def_y (30 erreurs)
- almaany_no_present_3ms : 5
- almaany_no_active_participle : 5
- almaany_no_passive_participle : 5
- masdar_pattern : 4
- final_faible_past_3ms : 2
- shadda_past_3ms : 2
- final_faible_present_3ms : 2
- autre_active_participle : 2
- final_faible_passive_participle : 2
- autre_past_3ms : 1

### form1_gemine (22 erreurs)
- autre_active_participle : 9
- manque_masdar : 5
- almaany_no_passive_participle : 2
- autre_present_3ms : 2
- almaany_no_present_3ms : 1
- almaany_no_active_participle : 1
- autre_past_3ms : 1
- autre_passive_participle : 1

### form1_hamza_r1 (13 erreurs)
- autre_active_participle : 6
- masdar_pattern : 3
- almaany_no_present_3ms : 1
- almaany_no_active_participle : 1
- almaany_no_passive_participle : 1
- shadda_passive_participle : 1

### form1_hamza_r2 (16 erreurs)
- almaany_no_passive_participle : 3
- autre_present_3ms : 2
- autre_active_participle : 2
- manque_masdar : 2
- autre_past_3ms : 2
- almaany_no_present_3ms : 2
- almaany_no_active_participle : 2
- autre_passive_participle : 1

### form1_hamza_r3 (8 erreurs)
- final_faible_active_participle : 3
- autre_passive_participle : 3
- manque_masdar : 2

### form1_lafif (18 erreurs)
- almaany_no_passive_participle : 3
- masdar_pattern : 3
- autre_active_participle : 3
- autre_past_3ms : 2
- autre_present_3ms : 2
- almaany_no_active_participle : 1
- final_faible_active_participle : 1
- shadda_passive_participle : 1
- almaany_no_present_3ms : 1
- autre_passive_participle : 1

### form1_passive (29 erreurs)
- manque_active_participle : 7
- manque_passive_participle : 7
- masdar_pattern : 4
- autre_present_3ms : 3
- final_faible_past_3ms : 2
- autre_past_3ms : 1
- shadda_past_3ms : 1
- shadda_present_3ms : 1
- almaany_no_present_3ms : 1
- final_faible_present_3ms : 1
- manque_masdar : 1

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

### form2 (7 erreurs)
- masdar_pattern : 1
- final_faible_active_participle : 1
- almaany_no_present_3ms : 1
- almaany_no_active_participle : 1
- almaany_no_passive_participle : 1
- autre_active_participle : 1
- final_faible_passive_participle : 1

### form3 (20 erreurs)
- autre_past_3ms : 4
- autre_present_3ms : 4
- autre_active_participle : 4
- autre_passive_participle : 4
- masdar_pattern : 4

### form4 (8 erreurs)
- masdar_pattern : 6
- autre_active_participle : 1
- autre_passive_participle : 1

### form5 (6 erreurs)
- autre_present_3ms : 4
- autre_active_participle : 1
- final_faible_passive_participle : 1

### form6 (9 erreurs)
- autre_present_3ms : 2
- autre_past_3ms : 2
- almaany_no_active_participle : 2
- almaany_no_passive_participle : 2
- almaany_no_present_3ms : 1

### form7 (6 erreurs)
- masdar_pattern : 2
- autre_active_participle : 2
- almaany_no_passive_participle : 2

### form8 (10 erreurs)
- masdar_pattern : 3
- autre_active_participle : 2
- autre_passive_participle : 2
- autre_past_3ms : 1
- autre_present_3ms : 1
- final_faible_passive_participle : 1

## Détail des erreurs (verbe par verbe)

### أَبَى  (form1_hamza_r1, racine `ا ب ي`)
- **active_participle** : nous=`أَابٍ` / Almaany=`آبٍ`  →  *autre_active_participle*
- **masdar** : nous=`أَبْي` / Almaany=`إباءً`  →  *masdar_pattern*

### أَتَى  (form1_hamza_r1, racine `ا ت ي`)
- **masdar** : nous=`إِتْيَان` / Almaany=`إتيانة / مأتاة / مَأْتًى`  →  *masdar_pattern*

### أَخَذَ  (form1_hamza_r1, racine `ا خ ذ`)
- **active_participle** : nous=`أَاخِذ` / Almaany=`آخِذ`  →  *autre_active_participle*

### أَخْرَجَ  (form4, racine `خ ر ج`)
- **masdar** : nous=`إِخْرَاج` / Almaany=`إخراجًا`  →  *masdar_pattern*

### أَذِنَ  (form1_hamza_r1, racine `ا ذ ن`)
- **active_participle** : nous=`أَاذِن` / Almaany=`آذِن`  →  *autre_active_participle*

### أَرْسَلَ  (form4, racine `ر س ل`)
- **masdar** : nous=`إِرْسَال` / Almaany=`إرسالاً`  →  *masdar_pattern*

### أَشْرَكَ  (form4, racine `ش ر ك`)
- **masdar** : nous=`إِشْرَاك` / Almaany=`إشراكًا`  →  *masdar_pattern*

### أَضَلَّ  (form4, racine `ض ل ل`)
- **active_participle** : nous=`مُضْلِل` / Almaany=`مُضِلّ`  →  *autre_active_participle*
- **passive_participle** : nous=`مُضْلَل` / Almaany=`مُضَلّ`  →  *autre_passive_participle*
- **masdar** : nous=`إِضْلَال` / Almaany=`إضلالاً`  →  *masdar_pattern*

### أَكَلَ  (form1_hamza_r1, racine `ا ك ل`)
- **active_participle** : nous=`أَاكِل` / Almaany=`آكِل`  →  *autre_active_participle*

### أَمَرَ  (form1_hamza_r1, racine `ا م ر`)
- **present_3ms** : nous=`يَأْمُرُ` / Almaany=`∅`  →  *almaany_no_present_3ms*
- **active_participle** : nous=`أَامِر` / Almaany=`∅`  →  *almaany_no_active_participle*
- **passive_participle** : nous=`مَأْمُور` / Almaany=`∅`  →  *almaany_no_passive_participle*

### أَمَرَ  (form1_passive, racine `ا م ر`)
- **present_3ms** : nous=`يُؤْمَرُ` / Almaany=`∅`  →  *almaany_no_present_3ms*

### أَمِنَ  (form1_hamza_r1, racine `ا م ن`)
- **active_participle** : nous=`أَامِن` / Almaany=`آمن`  →  *autre_active_participle*

### أَنزَلَ  (form4, racine `ن ز ل`)
- **masdar** : nous=`إِنْزَال` / Almaany=`إنْزالاً`  →  *masdar_pattern*

### أَنفَقَ  (form4, racine `ن ف ق`)
- **masdar** : nous=`إِنْفَاق` / Almaany=`إنفاقًا`  →  *masdar_pattern*

### أَوَى  (form1_hamza_r1, racine `ا و ي`)
- **active_participle** : nous=`أَائٍ` / Almaany=`آوٍ`  →  *autre_active_participle*
- **passive_participle** : nous=`مَأُوي` / Almaany=`مأويّ`  →  *shadda_passive_participle*
- **masdar** : nous=`أَوْي` / Almaany=`إيوَاءً`  →  *masdar_pattern*

### بَدَأَ  (form1_hamza_r3, racine `ب د ا`)
- **active_participle** : nous=`بَادِأ` / Almaany=`بادِئ`  →  *final_faible_active_participle*
- **passive_participle** : nous=`مَبْدُوأ` / Almaany=`مبدوء`  →  *autre_passive_participle*
- **masdar** : nous=`∅` / Almaany=`بَدْأةً / بِدَايةً`  →  *manque_masdar*

### بَدَا  (form1_def_w, racine `ب د و`)
- **present_3ms** : nous=`يَبْدُو` / Almaany=`يقال`  →  *autre_present_3ms*
- **active_participle** : nous=`بَادٍ` / Almaany=`∅`  →  *almaany_no_active_participle*
- **passive_participle** : nous=`مَبْدُوّ` / Almaany=`∅`  →  *almaany_no_passive_participle*

### بَعَثَ  (form1_sain_a, racine `ب ع ث`)
- **masdar** : nous=`بَعْثٌ` / Almaany=`بَعْثًا / بِعْثةً / بَعْثةً`  →  *masdar_pattern*

### بَغَىٰ  (form1_def_y, racine `ب غ ي`)
- **masdar** : nous=`بَغْي` / Almaany=`بَغْيًا`  →  *masdar_pattern*

### بَلَغَ  (form1_sain_u, racine `ب ل غ`)
- **masdar** : nous=`بُلُوغٌ` / Almaany=`بُلوغًا / بَلاغًا`  →  *masdar_pattern*

### بَلَوْ  (form1_def_w, racine `ب ل و`)
- **past_3ms** : nous=`بَلَا` / Almaany=`بَلْو`  →  *final_faible_past_3ms*
- **present_3ms** : nous=`يَبْلُو` / Almaany=`∅`  →  *almaany_no_present_3ms*
- **active_participle** : nous=`بَالٍ` / Almaany=`∅`  →  *almaany_no_active_participle*
- **passive_participle** : nous=`مَبْلُوّ` / Almaany=`∅`  →  *almaany_no_passive_participle*

### بِئْسَ  (form1_hamza_r2, racine `ب ا س`)
- **past_3ms** : nous=`بَأَسَ` / Almaany=`بئِسَ`  →  *autre_past_3ms*
- **present_3ms** : nous=`يَبْؤُسُ` / Almaany=`يَبأَس`  →  *autre_present_3ms*
- **active_participle** : nous=`بَاءِس` / Almaany=`بائِس`  →  *autre_active_participle*
- **passive_participle** : nous=`مَبْءُوس` / Almaany=`∅`  →  *almaany_no_passive_participle*
- **masdar** : nous=`∅` / Almaany=`بُؤْسًا / بَأْسًا`  →  *manque_masdar*

### تَابَ  (form1_creux_w, racine `ت و ب`)
- **present_3ms** : nous=`يَتُوبُ` / Almaany=`تابَ`  →  *autre_present_3ms*

### تَبَارَكَ  (form6, racine `ب ر ك`)
- **present_3ms** : nous=`يَتَبَارَكُ` / Almaany=`تباركَ`  →  *autre_present_3ms*

### تَرَبَّصْ  (form5, racine `ر ب ص`)
- **present_3ms** : nous=`يَتَرَبَّصُ` / Almaany=`تربَّصَ`  →  *autre_present_3ms*

### تَشَٰبَهَ  (form6, racine `ش ب ه`)
- **past_3ms** : nous=`تَشَابَهَ` / Almaany=`تَشَبَّهَ`  →  *autre_past_3ms*
- **present_3ms** : nous=`يَتَشَابَهُ` / Almaany=`∅`  →  *almaany_no_present_3ms*
- **active_participle** : nous=`مُتَشَابِه` / Almaany=`∅`  →  *almaany_no_active_participle*
- **passive_participle** : nous=`مُتَشَابَه` / Almaany=`∅`  →  *almaany_no_passive_participle*

### تَعَٰلَىٰ  (form1_def_w, racine `ع ل و`)
- **past_3ms** : nous=`عَلَا` / Almaany=`تعلَّى`  →  *autre_past_3ms*
- **present_3ms** : nous=`يَعْلُو` / Almaany=`تعلَّى`  →  *autre_present_3ms*
- **active_participle** : nous=`عَالٍ` / Almaany=`مُتعلٍّ`  →  *autre_active_participle*
- **passive_participle** : nous=`مَعْلُوّ` / Almaany=`∅`  →  *almaany_no_passive_participle*

### تَلَىٰ  (form1_def_w, racine `ت ل و`)
- **past_3ms** : nous=`تَلَا` / Almaany=`تَلَّى`  →  *final_faible_past_3ms*
- **present_3ms** : nous=`يَتْلُو` / Almaany=`تَلَّى`  →  *autre_present_3ms*
- **active_participle** : nous=`تَالٍ` / Almaany=`∅`  →  *almaany_no_active_participle*
- **passive_participle** : nous=`مَتْلُوّ` / Almaany=`∅`  →  *almaany_no_passive_participle*

### تَلَىٰ  (form1_passive, racine `ت ل و`)
- **past_3ms** : nous=`تُلِيَ` / Almaany=`تَلَّى`  →  *final_faible_past_3ms*
- **present_3ms** : nous=`يُتْلَى` / Almaany=`تَلَّى`  →  *autre_present_3ms*

### تَمَتَّعَ  (form5, racine `م ت ع`)
- **present_3ms** : nous=`يَتَمَتَّعُ` / Almaany=`تمتَّعَ`  →  *autre_present_3ms*

### تَنَٰزَعُ  (form6, racine `ن ز ع`)
- **past_3ms** : nous=`تَنَازَعَ` / Almaany=`تَنَزَّعَ`  →  *autre_past_3ms*
- **present_3ms** : nous=`يَتَنَازَعُ` / Almaany=`تسرع`  →  *autre_present_3ms*
- **active_participle** : nous=`مُتَنَازِع` / Almaany=`∅`  →  *almaany_no_active_participle*
- **passive_participle** : nous=`مُتَنَازَع` / Almaany=`∅`  →  *almaany_no_passive_participle*

### تَوَفَّىٰ  (form5, racine `و ف ي`)
- **active_participle** : nous=`مُتَوَفِّي` / Almaany=`مُتَوَفٍّ`  →  *autre_active_participle*
- **passive_participle** : nous=`مُتَوَفَّي` / Almaany=`مُتَوَفًّى`  →  *final_faible_passive_participle*

### تَوَكَّلْ  (form5, racine `و ك ل`)
- **present_3ms** : nous=`يَتَوَكَّلُ` / Almaany=`توكَّلَ`  →  *autre_present_3ms*

### تَوَلَّىٰ  (form5, racine `و ل ي`)
- **present_3ms** : nous=`يَتَوَلَّى` / Almaany=`تولَّى`  →  *autre_present_3ms*

### جَرَيْ  (form1_def_y, racine `ج ر ي`)
- **past_3ms** : nous=`جَرَى` / Almaany=`جَرْي`  →  *final_faible_past_3ms*
- **present_3ms** : nous=`يَجْرِي` / Almaany=`∅`  →  *almaany_no_present_3ms*
- **active_participle** : nous=`جَارٍ` / Almaany=`∅`  →  *almaany_no_active_participle*
- **passive_participle** : nous=`مَجْرِيّ` / Almaany=`∅`  →  *almaany_no_passive_participle*

### جَزَىٰ  (form1_def_y, racine `ج ز ي`)
- **masdar** : nous=`جَزْي` / Almaany=`جزاءً`  →  *masdar_pattern*

### جَزَىٰ  (form1_passive, racine `ج ز ي`)
- **past_3ms** : nous=`جُزِيَ` / Almaany=`جزَى`  →  *final_faible_past_3ms*
- **present_3ms** : nous=`يُجْزَى` / Almaany=`يَجزي`  →  *final_faible_present_3ms*
- **active_participle** : nous=`∅` / Almaany=`جازٍ`  →  *manque_active_participle*
- **passive_participle** : nous=`∅` / Almaany=`مَجْزيّ`  →  *manque_passive_participle*
- **masdar** : nous=`جَزْي` / Almaany=`جزاءً`  →  *masdar_pattern*

### جَعَلَ  (form1_sain_a, racine `ج ع ل`)
- **masdar** : nous=`∅` / Almaany=`جَعْلاً`  →  *manque_masdar*

### جَٰدَلُ  (form3, racine `ج د ل`)
- **past_3ms** : nous=`جَادَلَ` / Almaany=`جدَلَ`  →  *autre_past_3ms*
- **present_3ms** : nous=`يُجَادِلُ` / Almaany=`يجدُل`  →  *autre_present_3ms*
- **active_participle** : nous=`مُجَادِل` / Almaany=`جادِل`  →  *autre_active_participle*
- **passive_participle** : nous=`مُجَادَل` / Almaany=`مَجْدول`  →  *autre_passive_participle*
- **masdar** : nous=`مُجَادَلَة` / Almaany=`جَدْلاً`  →  *masdar_pattern*

### جَٰهَدَ  (form3, racine `ج ه د`)
- **past_3ms** : nous=`جَاهَدَ` / Almaany=`جهَدَ`  →  *autre_past_3ms*
- **present_3ms** : nous=`يُجَاهِدُ` / Almaany=`يَجهَد`  →  *autre_present_3ms*
- **active_participle** : nous=`مُجَاهِد` / Almaany=`جاهد`  →  *autre_active_participle*
- **passive_participle** : nous=`مُجَاهَد` / Almaany=`مجهود`  →  *autre_passive_participle*
- **masdar** : nous=`مُجَاهَدَة` / Almaany=`جَهْدًا`  →  *masdar_pattern*

### حَسِبَ  (form1_sain_a, racine `ح س ب`)
- **masdar** : nous=`حُسْبَانٌ` / Almaany=`حِسابًا / حَسْبًا / حُسْبانًا / حِسَبةً`  →  *masdar_pattern*

### حَقَّ  (form1_gemine, racine `ح ق ق`)
- **active_participle** : nous=`حَاقِق` / Almaany=`حقيق`  →  *autre_active_participle*

### حَكَمَ  (form1_sain_u, racine `ح ك م`)
- **masdar** : nous=`حُكْم` / Almaany=`حُكُومَةٌ`  →  *masdar_pattern*

### حَلَلْ  (form1_gemine, racine `ح ل ل`)
- **past_3ms** : nous=`حَلَّ` / Almaany=`حلَّلَ`  →  *autre_past_3ms*
- **present_3ms** : nous=`يَحِلُّ` / Almaany=`يحلِّل`  →  *autre_present_3ms*
- **active_participle** : nous=`حَالِل` / Almaany=`مُحلِّل`  →  *autre_active_participle*
- **passive_participle** : nous=`مَحْلُول` / Almaany=`مُحلَّل`  →  *autre_passive_participle*

### حَمَلَ  (form1_sain_i, racine `ح م ل`)
- **masdar** : nous=`حَمْل` / Almaany=`حَمْلاً`  →  *masdar_pattern*

### خَابَ  (form1_creux_y, racine `خ ي ب`)
- **passive_participle** : nous=`مَخِيب` / Almaany=`∅`  →  *almaany_no_passive_participle*

### خَاضُ  (form1_creux_w, racine `خ و ض`)
- **masdar** : nous=`خَوْض` / Almaany=`خَوْضًا`  →  *masdar_pattern*

### خَافَ  (form1_creux_w, racine `خ و ف`)
- **present_3ms** : nous=`يَخُوفُ` / Almaany=`∅`  →  *almaany_no_present_3ms*
- **active_participle** : nous=`خَائِف` / Almaany=`∅`  →  *almaany_no_active_participle*
- **passive_participle** : nous=`مَخُوف` / Almaany=`∅`  →  *almaany_no_passive_participle*

### خَرَجَ  (form1_sain_u, racine `خ ر ج`)
- **present_3ms** : nous=`يَخْرُجُ` / Almaany=`∅`  →  *almaany_no_present_3ms*
- **active_participle** : nous=`خَارِج` / Almaany=`∅`  →  *almaany_no_active_participle*
- **passive_participle** : nous=`مَخْرُوج` / Almaany=`∅`  →  *almaany_no_passive_participle*

### خَشِىَ  (form1_def_y, racine `خ ش ي`)
- **past_3ms** : nous=`خَشَى` / Almaany=`خشَّى`  →  *shadda_past_3ms*
- **present_3ms** : nous=`يَخْشَى` / Almaany=`يخشّي`  →  *final_faible_present_3ms*
- **active_participle** : nous=`خَاشٍ` / Almaany=`مُخَشٍّ`  →  *autre_active_participle*
- **passive_participle** : nous=`مَخْشِيّ` / Almaany=`مُخَشًّى`  →  *final_faible_passive_participle*

### خَلَقَ  (form1_sain_u, racine `خ ل ق`)
- **active_participle** : nous=`خَالِق` / Almaany=`خليق`  →  *autre_active_participle*
- **masdar** : nous=`خَلْقٌ` / Almaany=`خَلاقَةً`  →  *masdar_pattern*

### دَخَلَ  (form1_sain_u, racine `د خ ل`)
- **active_participle** : nous=`دَاخِل` / Almaany=`دخِل`  →  *autre_active_participle*
- **passive_participle** : nous=`مَدْخُول` / Almaany=`∅`  →  *almaany_no_passive_participle*
- **masdar** : nous=`دُخُولٌ` / Almaany=`دَخْلاً / دَخَلاً`  →  *masdar_pattern*

### دَعَا  (form1_def_w, racine `د ع و`)
- **masdar** : nous=`دُعَاء` / Almaany=`دعيّ`  →  *masdar_pattern*

### ذَاقُ  (form1_creux_w, racine `ذ و ق`)
- **masdar** : nous=`ذَوْق` / Almaany=`ذَوْقًا / ذَوَاقًا`  →  *masdar_pattern*

### ذَرَأَ  (form1_hamza_r3, racine `ذ ر ا`)
- **active_participle** : nous=`ذَارِأ` / Almaany=`ذارِئ`  →  *final_faible_active_participle*
- **passive_participle** : nous=`مَذْرُوأ` / Almaany=`مَذْروء`  →  *autre_passive_participle*

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

### رَدَّ  (form1_gemine, racine `ر د د`)
- **active_participle** : nous=`رَادِد` / Almaany=`رادّ`  →  *autre_active_participle*
- **masdar** : nous=`∅` / Almaany=`رَدًّا`  →  *manque_masdar*

### رَدَّ  (form1_passive, racine `ر د د`)
- **active_participle** : nous=`∅` / Almaany=`رادّ`  →  *manque_active_participle*
- **passive_participle** : nous=`∅` / Almaany=`مَرْدود`  →  *manque_passive_participle*
- **masdar** : nous=`∅` / Almaany=`رَدًّا`  →  *manque_masdar*

### رَزَقَ  (form1_sain_u, racine `ر ز ق`)
- **masdar** : nous=`رِزْقٌ` / Almaany=`رَزْقًا`  →  *masdar_pattern*

### رَفَعَ  (form1_sain_a, racine `ر ف ع`)
- **active_participle** : nous=`رَافِع` / Almaany=`رَفيع`  →  *autre_active_participle*

### رَّضِىَ  (form1_def_w, racine `ر ض و`)
- **past_3ms** : nous=`رَضَا` / Almaany=`رضى`  →  *final_faible_past_3ms*
- **present_3ms** : nous=`يَرْضَوُ` / Almaany=`يحكمهم،`  →  *autre_present_3ms*
- **active_participle** : nous=`رَاضٍ` / Almaany=`∅`  →  *almaany_no_active_participle*
- **passive_participle** : nous=`مَرْضُوّ` / Almaany=`∅`  →  *almaany_no_passive_participle*

### زَادَ  (form1_creux_y, racine `ز ي د`)
- **masdar** : nous=`زَيْد` / Almaany=`زَوْدًا / مَزُود`  →  *masdar_pattern*

### زَاغَ  (form1_creux_y, racine `ز ي غ`)
- **present_3ms** : nous=`يَزِيغُ` / Almaany=`يَزوغ`  →  *autre_present_3ms*
- **passive_participle** : nous=`مَزِيغ` / Almaany=`مزوغٌ`  →  *autre_passive_participle*
- **masdar** : nous=`زَيْغ` / Almaany=`زَوْغًا / زاغَةٌ`  →  *masdar_pattern*

### سَأَلَ  (form1_hamza_r2, racine `س ا ل`)
- **present_3ms** : nous=`يَسْؤُلُ` / Almaany=`يَسأَل`  →  *autre_present_3ms*
- **active_participle** : nous=`سَاءِل` / Almaany=`سائِل`  →  *autre_active_participle*
- **passive_participle** : nous=`مَسْءُول` / Almaany=`مَسْئول`  →  *autre_passive_participle*
- **masdar** : nous=`∅` / Almaany=`سُؤالاً`  →  *manque_masdar*

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

### صَدَّ  (form1_gemine, racine `ص د د`)
- **active_participle** : nous=`صَادِد` / Almaany=`صَادّ`  →  *autre_active_participle*

### ضَاقَ  (form1_creux_y, racine `ض ي ق`)
- **passive_participle** : nous=`مَضِيق` / Almaany=`∅`  →  *almaany_no_passive_participle*
- **masdar** : nous=`ضَيْق` / Almaany=`ضَيْقًا / ضِيقًا`  →  *masdar_pattern*

### ضَرَبَ  (form1_sain_i, racine `ض ر ب`)
- **masdar** : nous=`ضَرْبٌ` / Almaany=`ضَرْبًا / ضَرَبانًا`  →  *masdar_pattern*

### ضَلَّ  (form1_gemine, racine `ض ل ل`)
- **active_participle** : nous=`ضَالِل` / Almaany=`ضالّ`  →  *autre_active_participle*
- **masdar** : nous=`∅` / Almaany=`ضَلَلْتُ / ضَلاًّ / ضَلالاً / ضَلالةً`  →  *manque_masdar*

### ظَلَمَ  (form1_passive, racine `ظ ل م`)
- **active_participle** : nous=`∅` / Almaany=`ظالِم`  →  *manque_active_participle*
- **passive_participle** : nous=`∅` / Almaany=`مَظْلوم`  →  *manque_passive_participle*

### ظَنَّ  (form1_gemine, racine `ظ ن ن`)
- **active_participle** : nous=`ظَانِن` / Almaany=`ظانّ`  →  *autre_active_participle*
- **masdar** : nous=`∅` / Almaany=`ظَنَنْتُ / ظَنًّا`  →  *manque_masdar*

### عَادَ  (form1_creux_w, racine `ع و د`)
- **masdar** : nous=`عَوْد` / Almaany=`عَوْدةً`  →  *masdar_pattern*

### عَبَدَ  (form1_sain_u, racine `ع ب د`)
- **present_3ms** : nous=`يَعْبُدُ` / Almaany=`∅`  →  *almaany_no_present_3ms*
- **active_participle** : nous=`عَابِد` / Almaany=`∅`  →  *almaany_no_active_participle*
- **passive_participle** : nous=`مَعْبُود` / Almaany=`∅`  →  *almaany_no_passive_participle*

### عَتَ  (form1_def_w, racine `ع ت و`)
- **past_3ms** : nous=`عَتَا` / Almaany=`عَتَّ`  →  *autre_past_3ms*
- **present_3ms** : nous=`يَعْتُو` / Almaany=`∅`  →  *almaany_no_present_3ms*
- **active_participle** : nous=`عَاتٍ` / Almaany=`∅`  →  *almaany_no_active_participle*
- **passive_participle** : nous=`مَعْتُوّ` / Almaany=`∅`  →  *almaany_no_passive_participle*

### عَرَفَ  (form1_sain_i, racine `ع ر ف`)
- **masdar** : nous=`عِرْفَانٌ` / Almaany=`عِرْفانًا / عِرِفَّانًا / مَعْرِفةً`  →  *masdar_pattern*

### عَسَى  (form1_def_y, racine `ع س ي`)
- **present_3ms** : nous=`يَعْسِي` / Almaany=`∅`  →  *almaany_no_present_3ms*
- **active_participle** : nous=`عَاسٍ` / Almaany=`∅`  →  *almaany_no_active_participle*
- **passive_participle** : nous=`مَعْسِيّ` / Almaany=`∅`  →  *almaany_no_passive_participle*

### عَصَا  (form1_def_y, racine `ع ص ي`)
- **past_3ms** : nous=`عَصَى` / Almaany=`عَصًا`  →  *final_faible_past_3ms*
- **present_3ms** : nous=`يَعْصِي` / Almaany=`∅`  →  *almaany_no_present_3ms*
- **active_participle** : nous=`عَاصٍ` / Almaany=`∅`  →  *almaany_no_active_participle*
- **passive_participle** : nous=`مَعْصِيّ` / Almaany=`∅`  →  *almaany_no_passive_participle*

### عَقَلُ  (form1_sain_i, racine `ع ق ل`)
- **masdar** : nous=`عَقْل` / Almaany=`عَقْلاً`  →  *masdar_pattern*

### عَلِمَ  (form1_sain_a, racine `ع ل م`)
- **masdar** : nous=`عِلْمٌ` / Almaany=`عَلْمًا`  →  *masdar_pattern*

### عَمِلَ  (form1_sain_a, racine `ع م ل`)
- **masdar** : nous=`عَمَلٌ` / Almaany=`عَمَلاً`  →  *masdar_pattern*

### عَيِي  (form1_lafif, racine `ع ي ي`)
- **past_3ms** : nous=`عَيَّ` / Almaany=`عيِيَ`  →  *autre_past_3ms*
- **present_3ms** : nous=`يَعِيُّ` / Almaany=`يَعيا`  →  *autre_present_3ms*
- **active_participle** : nous=`عَائٍ` / Almaany=`عَيّ`  →  *autre_active_participle*
- **passive_participle** : nous=`مَعِيي` / Almaany=`مَعِيّ`  →  *autre_passive_participle*

### عَٰهَدَ  (form3, racine `ع ه د`)
- **past_3ms** : nous=`عَاهَدَ` / Almaany=`عهِدَ`  →  *autre_past_3ms*
- **present_3ms** : nous=`يُعَاهِدُ` / Almaany=`يَعهَد`  →  *autre_present_3ms*
- **active_participle** : nous=`مُعَاهِد` / Almaany=`عاهِد`  →  *autre_active_participle*
- **passive_participle** : nous=`مُعَاهَد` / Almaany=`مَعْهود`  →  *autre_passive_participle*
- **masdar** : nous=`مُعَاهَدَة` / Almaany=`عَهْدًا`  →  *masdar_pattern*

### غَرَّ  (form1_gemine, racine `غ ر ر`)
- **present_3ms** : nous=`يَغُرُّ` / Almaany=`يقال`  →  *autre_present_3ms*
- **active_participle** : nous=`غَارِر` / Almaany=`أَغرُّ`  →  *autre_active_participle*
- **passive_participle** : nous=`مَغْرُور` / Almaany=`∅`  →  *almaany_no_passive_participle*
- **masdar** : nous=`∅` / Almaany=`غُرَّة`  →  *manque_masdar*

### غَشِيَ  (form1_def_w, racine `غ ش و`)
- **past_3ms** : nous=`غَشَا` / Almaany=`غُشِيَ`  →  *final_faible_past_3ms*
- **present_3ms** : nous=`يَغْشَوُ` / Almaany=`يُغشَى`  →  *final_faible_present_3ms*
- **active_participle** : nous=`غَاشٍ` / Almaany=`∅`  →  *almaany_no_active_participle*
- **passive_participle** : nous=`مَغْشُوّ` / Almaany=`مَغْشِيٌّ`  →  *final_faible_passive_participle*
- **masdar** : nous=`غَشْو` / Almaany=`غَشْيةً / غَشْيًا`  →  *masdar_pattern*

### غَوَىٰ  (form1_lafif, racine `غ و ي`)
- **present_3ms** : nous=`يَغْوُيُ` / Almaany=`∅`  →  *almaany_no_present_3ms*
- **active_participle** : nous=`غَائٍ` / Almaany=`غاوٍ،`  →  *autre_active_participle*
- **passive_participle** : nous=`مَغُوي` / Almaany=`∅`  →  *almaany_no_passive_participle*
- **masdar** : nous=`غَوْي` / Almaany=`غَوَايَةً / غَوِيّ / غُوَاةٌ / غاوون / غاويةٌ / غاوياتٌ`  →  *masdar_pattern*

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

### قَامَ  (form1_creux_w, racine `ق و م`)
- **masdar** : nous=`قَوْم` / Almaany=`قَوْمًا / قِيامًا / قامةً`  →  *masdar_pattern*

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

### قَرَأَ  (form1_hamza_r3, racine `ق ر ا`)
- **active_participle** : nous=`قَارِأ` / Almaany=`قارئ`  →  *final_faible_active_participle*
- **passive_participle** : nous=`مَقْرُوأ` / Almaany=`مَقْروء`  →  *autre_passive_participle*
- **masdar** : nous=`∅` / Almaany=`قِراءةً / قُرْآنًا`  →  *manque_masdar*

### قَصَّ  (form1_gemine, racine `ق ص ص`)
- **active_participle** : nous=`قَاصِص` / Almaany=`قاصّ`  →  *autre_active_participle*
- **masdar** : nous=`∅` / Almaany=`قَصًّا`  →  *manque_masdar*

### قَٰتَلَ  (form3, racine `ق ت ل`)
- **past_3ms** : nous=`قَاتَلَ` / Almaany=`قتَلَ`  →  *autre_past_3ms*
- **present_3ms** : nous=`يُقَاتِلُ` / Almaany=`يَقتُل`  →  *autre_present_3ms*
- **active_participle** : nous=`مُقَاتِل` / Almaany=`قاتِل`  →  *autre_active_participle*
- **passive_participle** : nous=`مُقَاتَل` / Almaany=`مَقْتول`  →  *autre_passive_participle*
- **masdar** : nous=`مُقَاتَلَة` / Almaany=`قَتْلاً`  →  *masdar_pattern*

### كَادَ  (form1_creux_w, racine `ك و د`)
- **present_3ms** : nous=`يَكُودُ` / Almaany=`يَكِيد`  →  *autre_present_3ms*
- **passive_participle** : nous=`مَكُود` / Almaany=`مَكِيد`  →  *autre_passive_participle*

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

### كَفَىٰ  (form1_def_y, racine `ك ف ي`)
- **masdar** : nous=`كَفْي` / Almaany=`كِفايَةً`  →  *masdar_pattern*

### لَبِثَ  (form1_sain_a, racine `ل ب ث`)
- **masdar** : nous=`∅` / Almaany=`لَبْثًا / لُبْثًا`  →  *manque_masdar*

### مَسَّ  (form1_gemine, racine `م س س`)
- **present_3ms** : nous=`يَمَسُّ` / Almaany=`∅`  →  *almaany_no_present_3ms*
- **active_participle** : nous=`مَاسِس` / Almaany=`∅`  →  *almaany_no_active_participle*
- **passive_participle** : nous=`مَمْسُوس` / Almaany=`∅`  →  *almaany_no_passive_participle*

### مَّاتَ  (form1_creux_w, racine `م و ت`)
- **present_3ms** : nous=`يَمُوتُ` / Almaany=`يقال`  →  *autre_present_3ms*
- **active_participle** : nous=`مَائِت` / Almaany=`∅`  →  *almaany_no_active_participle*
- **passive_participle** : nous=`مَمُوت` / Almaany=`∅`  →  *almaany_no_passive_participle*
- **masdar** : nous=`مَوْت` / Almaany=`مَوْتًا / ماتت / مَوَاتًا / مَوَاتٌ`  →  *masdar_pattern*

### مَّشَ  (form1_def_y, racine `م ش ي`)
- **past_3ms** : nous=`مَشَى` / Almaany=`مِشّ`  →  *autre_past_3ms*
- **present_3ms** : nous=`يَمْشِي` / Almaany=`∅`  →  *almaany_no_present_3ms*
- **active_participle** : nous=`مَاشٍ` / Almaany=`∅`  →  *almaany_no_active_participle*
- **passive_participle** : nous=`مَمْشِيّ` / Almaany=`∅`  →  *almaany_no_passive_participle*

### نَبَّأَ  (form2, racine `ن ب ا`)
- **active_participle** : nous=`مُنَبِّأ` / Almaany=`مُنبِّئ`  →  *final_faible_active_participle*

### نَجَّىٰ  (form2, racine `ن ج و`)
- **present_3ms** : nous=`يُنَجِّي` / Almaany=`∅`  →  *almaany_no_present_3ms*
- **active_participle** : nous=`مُنَجِّو` / Almaany=`∅`  →  *almaany_no_active_participle*
- **passive_participle** : nous=`مُنَجَّو` / Almaany=`∅`  →  *almaany_no_passive_participle*

### نَسِىَ  (form1_def_y, racine `ن س ي`)
- **past_3ms** : nous=`نَسَى` / Almaany=`نسَّى`  →  *shadda_past_3ms*
- **present_3ms** : nous=`يَنْسَى` / Almaany=`يُنسِّي`  →  *final_faible_present_3ms*
- **active_participle** : nous=`نَاسٍ` / Almaany=`مُنسٍّ`  →  *autre_active_participle*
- **passive_participle** : nous=`مَنْسِيّ` / Almaany=`مُنسًّى`  →  *final_faible_passive_participle*

### نَصَرَ  (form1_sain_u, racine `ن ص ر`)
- **present_3ms** : nous=`يَنْصُرُ` / Almaany=`∅`  →  *almaany_no_present_3ms*
- **active_participle** : nous=`نَاصِر` / Almaany=`∅`  →  *almaany_no_active_participle*
- **passive_participle** : nous=`مَنْصُور` / Almaany=`∅`  →  *almaany_no_passive_participle*
- **masdar** : nous=`نُصْرَةٌ` / Almaany=`انتصار`  →  *masdar_pattern*

### نَهَىٰ  (form1_def_y, racine `ن ه ي`)
- **present_3ms** : nous=`يَنْهَى` / Almaany=`∅`  →  *almaany_no_present_3ms*
- **active_participle** : nous=`نَاهٍ` / Almaany=`∅`  →  *almaany_no_active_participle*
- **passive_participle** : nous=`مَنْهِيّ` / Almaany=`∅`  →  *almaany_no_passive_participle*

### نَّظَرَ  (form1_sain_u, racine `ن ظ ر`)
- **present_3ms** : nous=`يَنْظُرُ` / Almaany=`نظَرَ`  →  *autre_present_3ms*

### هَاتُ  (form1_hamza_r2, racine `ه ا ت`)
- **present_3ms** : nous=`يَهْؤُتُ` / Almaany=`∅`  →  *almaany_no_present_3ms*
- **active_participle** : nous=`هَاءِت` / Almaany=`∅`  →  *almaany_no_active_participle*
- **passive_participle** : nous=`مَهْءُوت` / Almaany=`∅`  →  *almaany_no_passive_participle*

### هَادُ  (form1_creux_w, racine `ه و د`)
- **masdar** : nous=`هَوْد` / Almaany=`هَوْدًا`  →  *masdar_pattern*

### هَدَى  (form1_def_y, racine `ه د ي`)
- **masdar** : nous=`هَدْي` / Almaany=`هَدْيًا / هِدايةً`  →  *masdar_pattern*

### هَوَىٰ  (form1_lafif, racine `ه و ي`)
- **active_participle** : nous=`هَائٍ` / Almaany=`هاوٍ`  →  *final_faible_active_participle*
- **passive_participle** : nous=`مَهُوي` / Almaany=`مَهوِيّ`  →  *shadda_passive_participle*
- **masdar** : nous=`هَوْي` / Almaany=`هُوِيًّا / هَوَيانًا / هُوَّةً / فهو`  →  *masdar_pattern*

### وَجَدَ  (form1_sain_i, racine `و ج د`)
- **masdar** : nous=`وِجْدَانٌ` / Almaany=`مَوجِدَةً`  →  *masdar_pattern*

### وَدَّ  (form1_gemine, racine `و د د`)
- **active_participle** : nous=`وَادِد` / Almaany=`وادّ`  →  *autre_active_participle*

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

### وَلَّىٰ  (form2, racine `و ل ي`)
- **active_participle** : nous=`مُوَلِّي` / Almaany=`مُولٍّ`  →  *autre_active_participle*
- **passive_participle** : nous=`مُوَلَّي` / Almaany=`مُولًّى`  →  *final_faible_passive_participle*

### وَهَبَ  (form1_sain_a, racine `و ه ب`)
- **present_3ms** : nous=`يَهَبُ` / Almaany=`يَهَبُه`  →  *autre_present_3ms*
- **passive_participle** : nous=`مَوْهُوب` / Almaany=`∅`  →  *almaany_no_passive_participle*

### يَئِسَ  (form1_hamza_r2, racine `ي ا س`)
- **past_3ms** : nous=`يَأَسَ` / Almaany=`يئِس`  →  *autre_past_3ms*
- **present_3ms** : nous=`يَيْؤُسُ` / Almaany=`∅`  →  *almaany_no_present_3ms*
- **active_participle** : nous=`يَاءِس` / Almaany=`∅`  →  *almaany_no_active_participle*
- **passive_participle** : nous=`مَيْءُوس` / Almaany=`∅`  →  *almaany_no_passive_participle*

### يَلْ  (form1_lafif, racine `ل و ي`)
- **past_3ms** : nous=`لَوَى` / Almaany=`يَلَّ`  →  *autre_past_3ms*
- **present_3ms** : nous=`يَلْوُيُ` / Almaany=`يَلَّ`  →  *autre_present_3ms*
- **active_participle** : nous=`لَائٍ` / Almaany=`أَيَلٌ`  →  *autre_active_participle*
- **passive_participle** : nous=`مَلُوي` / Almaany=`∅`  →  *almaany_no_passive_participle*

### ٱتَّبَعَ  (form8, racine `ت ب ع`)
- **active_participle** : nous=`مُتْتَبِع` / Almaany=`متَّبِع`  →  *autre_active_participle*
- **passive_participle** : nous=`مُتْتَبَع` / Almaany=`متَّبَع`  →  *autre_passive_participle*
- **masdar** : nous=`اِتْتِبَاع` / Almaany=`اتِّباعًا`  →  *masdar_pattern*

### ٱتَّخَذَ  (form8, racine `ا خ ذ`)
- **past_3ms** : nous=`اِئْتَخَذَ` / Almaany=`اتَّخذَ`  →  *autre_past_3ms*
- **present_3ms** : nous=`يَأْتَخِذُ` / Almaany=`يتَّخذ`  →  *autre_present_3ms*
- **active_participle** : nous=`مُأْتَخِذ` / Almaany=`مُتَّخِذ`  →  *autre_active_participle*
- **passive_participle** : nous=`مُأْتَخَذ` / Almaany=`مُتَّخَذ`  →  *autre_passive_participle*
- **masdar** : nous=`اِأْتِخَاذ` / Almaany=`اتِّخاذًا`  →  *masdar_pattern*

### ٱخْتَلَفَ  (form8, racine `خ ل ف`)
- **masdar** : nous=`اِخْتِلَاف` / Almaany=`اختلافًا`  →  *masdar_pattern*

### ٱسْتَطَاعَ  (form10, racine `ط و ع`)
- **present_3ms** : nous=`يَسْتَطِيعُ` / Almaany=`∅`  →  *almaany_no_present_3ms*
- **active_participle** : nous=`مُسْتَطِيع` / Almaany=`∅`  →  *almaany_no_active_participle*
- **passive_participle** : nous=`مُسْتَطَاع` / Almaany=`∅`  →  *almaany_no_passive_participle*

### ٱسْتَعْجَلَ  (form10, racine `ع ج ل`)
- **present_3ms** : nous=`يَسْتَعْجِلُ` / Almaany=`∅`  →  *almaany_no_present_3ms*
- **active_participle** : nous=`مُسْتَعْجِل` / Almaany=`∅`  →  *almaany_no_active_participle*
- **passive_participle** : nous=`مُسْتَعْجَل` / Almaany=`∅`  →  *almaany_no_passive_participle*
- **masdar** : nous=`اِسْتِعْجَال` / Almaany=`عَجِلَ`  →  *masdar_pattern*

### ٱسْتَغْفَرَ  (form10, racine `غ ف ر`)
- **masdar** : nous=`اِسْتِغْفَار` / Almaany=`استغفارًا`  →  *masdar_pattern*

### ٱسْتَكْبَرَ  (form10, racine `ك ب ر`)
- **masdar** : nous=`اِسْتِكْبَار` / Almaany=`استكبارًا`  →  *masdar_pattern*

### ٱنشَقَّ  (form7, racine `ش ق ق`)
- **active_participle** : nous=`مُنْشَقِق` / Almaany=`مُنشقّ`  →  *autre_active_participle*
- **passive_participle** : nous=`مُنْشَقَق` / Almaany=`∅`  →  *almaany_no_passive_participle*

### ٱنطَلَقَ  (form7, racine `ط ل ق`)
- **masdar** : nous=`اِنْطِلَاق` / Almaany=`انطلاقًا`  →  *masdar_pattern*

### ٱنفَضُّ  (form7, racine `ف ض ض`)
- **active_participle** : nous=`مُنْفَضِض` / Almaany=`مُنفضّ`  →  *autre_active_participle*
- **passive_participle** : nous=`مُنْفَضَض` / Almaany=`∅`  →  *almaany_no_passive_participle*

### ٱنقَلَبَ  (form7, racine `ق ل ب`)
- **masdar** : nous=`اِنْقِلَاب` / Almaany=`انقلابًا`  →  *masdar_pattern*

### ٱهْتَدَىٰ  (form8, racine `ه د ي`)
- **passive_participle** : nous=`مُهْتَدًى` / Almaany=`مُهتدًي`  →  *final_faible_passive_participle*
