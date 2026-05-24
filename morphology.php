<?php
header('Access-Control-Allow-Origin: *');
header('Content-Type: application/json');

// Auto-détection : sur localhost MAMP, on lit la base locale (qui contient
// les overrides et Form I synthétiques pas encore pushés en prod). En prod
// alwaysdata, on garde les credentials d'origine.
$host = $_SERVER['HTTP_HOST'] ?? '';
$is_local = ($host === 'localhost' || strpos($host, '127.0.0.1') === 0
             || strpos($host, 'localhost:') === 0);
if ($is_local) {
  $servername = "localhost";
  $username   = "root";
  $password   = "root";
  $dbname     = "quran_wasla";
} else {
  $servername = "mysql-studiocoran.alwaysdata.net";
  $username   = "323869";
  $password   = "Jesaispas94";
  $dbname     = "studiocoran_3";
}

// Toute exception mysqli (ex: table absente) est rattrapée et renvoyée en
// JSON, plutôt que d'afficher la stacktrace PHP au navigateur.
mysqli_report(MYSQLI_REPORT_ERROR | MYSQLI_REPORT_STRICT);

try {
  $conn = new mysqli($servername, $username, $password, $dbname);
  $conn->set_charset('utf8mb4');

  $sura = isset($_GET['sura']) ? (int)$_GET['sura'] : 0;
  $aya  = isset($_GET['aya'])  ? (int)$_GET['aya']  : 0;
  $word = isset($_GET['word']) ? (int)$_GET['word'] : 0;

  if (!$sura || !$aya || !$word) {
    http_response_code(400);
    echo json_encode(['error' => 'Missing params (sura, aya, word required)']);
    exit;
  }

  // LEFT JOIN avec quran_verb_canonical pour récupérer aussi les conjugaisons
  // canoniques calculées par Qutrub (passé, présent, impératif, masdar...).
  // Le JOIN matche sur (racine, forme verbale, voix) :
  //   - verb_form NULL en base = Form I implicite → on utilise COALESCE = 1
  //   - voix = passive si features contient PASS, sinon active
  $stmt = $conn->prepare("
    SELECT v.form_ar, v.root_ar, v.verb_form, v.lemma_ar, v.features,
           c.past_3ms, c.present_3ms, c.imperative_2ms, c.masdar,
           c.active_participle, c.passive_participle
    FROM quran_morphology_verbs v
    LEFT JOIN quran_verb_canonical c
      ON c.root_ar = v.root_ar
     AND c.verb_form = COALESCE(v.verb_form, 1)
     AND c.voice = CASE WHEN v.features LIKE '%PASS%' THEN 'passive' ELSE 'active' END
    WHERE v.sura = ? AND v.aya = ? AND v.word_position = ?
    ORDER BY v.segment ASC
    LIMIT 1
  ");
  $stmt->bind_param("iii", $sura, $aya, $word);
  $stmt->execute();
  $result = $stmt->get_result();
  $row = $result->fetch_assoc();

  if ($row) {
    // Overrides au niveau du mot quranique (sura:aya:word_position) — pour
    // les cas où le tag du Quranic Corpus est défendable mais nous préférons
    // une autre lecture (ambiguïté morphologique réelle). Cf.
    // morphology/word_overrides.json pour la liste et la motivation.
    $wordOverridesFile = __DIR__ . '/morphology/word_overrides.json';
    if (file_exists($wordOverridesFile)) {
      $woOverrides = json_decode(file_get_contents($wordOverridesFile), true);
      $woKey = "$sura:$aya:$word";
      if (is_array($woOverrides) && isset($woOverrides[$woKey]) && is_array($woOverrides[$woKey])) {
        foreach ($woOverrides[$woKey] as $field => $value) {
          if ($field === 'comment' || $field[0] === '_') continue;
          $row[$field] = $value;
        }
      }
    }

    // Si le verbe coranique n'est pas une Form I active, on récupère aussi
    // la Form I active de la racine (le verbe trilitère "de base") — utilisée
    // dans l'UI pour afficher la racine sur la 1re ligne avec ses wazns
    // d'origine, puis le verbe coranique sur la 2e ligne avec "مشتق من …".
    $base = null;
    $isFormIActive = (intval($row['verb_form'] ?? 1) === 1)
                  && (stripos($row['features'] ?? '', 'PASS') === false);
    if (!$isFormIActive && !empty($row['root_ar'])) {
      $stmt2 = $conn->prepare("
        SELECT past_3ms, present_3ms, imperative_2ms, masdar,
               active_participle, passive_participle
        FROM quran_verb_canonical
        WHERE root_ar = ? AND verb_form = 1 AND voice = 'active'
        LIMIT 1
      ");
      $stmt2->bind_param("s", $row['root_ar']);
      $stmt2->execute();
      $base = $stmt2->get_result()->fetch_assoc();
      $stmt2->close();
    }
    $row['form1_base'] = $base;   // null si verbe = Form I active, OU si Form I absente

    echo json_encode($row, JSON_UNESCAPED_UNICODE);
  } else {
    http_response_code(404);
    echo json_encode(['error' => 'Not a verb',
                      'sura' => $sura, 'aya' => $aya, 'word' => $word],
                      JSON_UNESCAPED_UNICODE);
  }
  $stmt->close();
  $conn->close();
} catch (Throwable $e) {
  http_response_code(500);
  $msg = $e->getMessage();
  // Détecte le cas spécifique « table inexistante » pour donner un indice clair
  if (stripos($msg, "doesn't exist") !== false) {
    echo json_encode(['error' => 'Morphology table not imported on this DB',
                      'detail' => $msg]);
  } else {
    echo json_encode(['error' => 'DB error', 'detail' => $msg]);
  }
}
