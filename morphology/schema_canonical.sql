-- Table des conjugaisons canoniques (formes citationnelles) par
-- (racine, forme verbale, voix). Indexée pour un lookup rapide depuis
-- morphology.php.
--
-- Une entrée par "verbe canonique" — pas par occurrence dans le Coran.
-- ~3000 lignes attendues (1500 racines × ~1.5 formes × ~1.2 voix).

SET NAMES utf8mb4;

DROP TABLE IF EXISTS quran_verb_canonical;

CREATE TABLE quran_verb_canonical (
  root_ar            VARCHAR(16) NOT NULL  COMMENT 'Racine en arabe, espaces entre lettres (ex: "ك ت ب")',
  verb_form          TINYINT UNSIGNED NOT NULL DEFAULT 1
                     COMMENT 'Forme I à X (1-10). 1 par défaut pour les entrées Form I.',
  voice              ENUM('active','passive') NOT NULL DEFAULT 'active',
  past_3ms           VARCHAR(64) NULL  COMMENT 'الماضي — 3e masc. sing. (ex: كَتَبَ)',
  present_3ms        VARCHAR(64) NULL  COMMENT 'المضارع — 3e masc. sing. (ex: يَكْتُبُ)',
  imperative_2ms     VARCHAR(64) NULL  COMMENT 'الأمر — 2e masc. sing. (ex: اُكْتُبْ)',
  masdar             VARCHAR(64) NULL  COMMENT 'المصدر (ex: كِتَابَة)',
  active_participle  VARCHAR(64) NULL  COMMENT 'اسم الفاعل (ex: كَاتِب)',
  passive_participle VARCHAR(64) NULL  COMMENT 'اسم المفعول (ex: مَكْتُوب)',
  source             VARCHAR(32) NULL  COMMENT 'Qutrub | dictionary | manual',
  PRIMARY KEY (root_ar, verb_form, voice),
  INDEX idx_root (root_ar)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
