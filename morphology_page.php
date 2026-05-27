<?php
header('Access-Control-Allow-Origin: *');
header('Content-Type: application/json');

// Auto-détection localhost MAMP vs prod alwaysdata (idem morphology.php).
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

mysqli_report(MYSQLI_REPORT_ERROR | MYSQLI_REPORT_STRICT);

try {
  $conn = new mysqli($servername, $username, $password, $dbname);
  $conn->set_charset('utf8mb4');

  // L'appelant fournit les bornes (sura/first_aya/last_sura/last_aya) qu'il
  // tire de pages.json côté client. On évite ainsi de dépendre de la table
  // `pages` côté backend (incomplète sur le local MAMP).
  $sura     = isset($_GET['sura'])      ? (int)$_GET['sura']      : 0;
  $firstAya = isset($_GET['first_aya']) ? (int)$_GET['first_aya'] : 0;
  $lastSura = isset($_GET['last_sura']) ? (int)$_GET['last_sura'] : $sura;
  $lastAya  = isset($_GET['last_aya'])  ? (int)$_GET['last_aya']  : 0;
  if (!$sura || !$firstAya || !$lastSura || !$lastAya) {
    http_response_code(400);
    echo json_encode(['error' => 'Missing params: sura, first_aya, last_sura, last_aya']);
    exit;
  }
  $boundary = [
    'sura' => $sura, 'first_aya' => $firstAya,
    'last_sura' => $lastSura, 'last_aya' => $lastAya,
  ];

  // Récupérer tous les verbes dans ces bornes (même logique que api.php :
  // page peut couvrir 1 ou 2+ sourates, on gère les 2 cas).
  if ($boundary['sura'] == $boundary['last_sura']) {
    $stmt2 = $conn->prepare("
      SELECT sura, aya, word_position, segment, form_ar, lemma_ar, root_ar,
             verb_form, features
      FROM quran_morphology_verbs
      WHERE sura = ? AND aya >= ? AND aya <= ?
      ORDER BY sura, aya, word_position, segment
    ");
    $stmt2->bind_param("iii",
      $boundary['sura'], $boundary['first_aya'], $boundary['last_aya']);
  } else {
    $stmt2 = $conn->prepare("
      SELECT sura, aya, word_position, segment, form_ar, lemma_ar, root_ar,
             verb_form, features
      FROM quran_morphology_verbs
      WHERE (sura > ? AND sura < ?)
         OR (sura = ? AND aya >= ?)
         OR (sura = ? AND aya <= ?)
      ORDER BY sura, aya, word_position, segment
    ");
    $stmt2->bind_param("iiiiii",
      $boundary['sura'],     $boundary['last_sura'],
      $boundary['sura'],     $boundary['first_aya'],
      $boundary['last_sura'], $boundary['last_aya']);
  }
  $stmt2->execute();
  $rs = $stmt2->get_result();
  $verbs = [];
  while ($row = $rs->fetch_assoc()) {
    $verbs[] = $row;
  }
  $stmt2->close();
  $conn->close();

  echo json_encode([
    'range' => $boundary,
    'verbs' => $verbs,
    'count' => count($verbs),
  ], JSON_UNESCAPED_UNICODE);
} catch (Throwable $e) {
  http_response_code(500);
  echo json_encode(['error' => 'DB error', 'detail' => $e->getMessage()]);
}
