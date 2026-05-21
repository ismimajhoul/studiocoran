<?php
header('Access-Control-Allow-Origin: *');
header('Content-Type: application/json');

// Mêmes credentials qu'api.php : tout le dev se fait contre alwaysdata.
// Pour tester en local sur MAMP, change temporairement ces valeurs.
$servername = "mysql-studiocoran.alwaysdata.net";
$username = "323869";
$password = "Jesaispas94";
$dbname = "studiocoran_3";

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
