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

  // Catégorie POS demandée. Table source : quran_morphology_all (tous types).
  //   verb → V / IMPV / IMPN
  //   noun → N / PN / ADJ / DEM / REL (substantifs)
  //   harf → toutes les particules (= ni verbe ni nom ni pronom suffixe)
  $cat = isset($_GET['cat']) ? $_GET['cat'] : 'verb';
  $posSets = [
    'verb' => ['V', 'IMPV', 'IMPN'],
    'noun' => ['N', 'PN', 'ADJ', 'DEM', 'REL'],
  ];
  if ($cat === 'harf') {
    // Particules : tout sauf verbes, noms et pronoms (PRON = surtout suffixes)
    $posFilter = "pos NOT IN ('V','IMPV','IMPN','N','PN','ADJ','DEM','REL','PRON')";
  } else {
    $set = $posSets[$cat] ?? $posSets['verb'];
    $quoted = array_map(function($p){ return "'".$p."'"; }, $set);
    $posFilter = "pos IN (" . implode(',', $quoted) . ")";
  }

  // Bornes de la page (1 ou plusieurs sourates).
  if ($boundary['sura'] == $boundary['last_sura']) {
    $rangeSql = "sura = ? AND aya >= ? AND aya <= ?";
    $types = "iii";
    $params = [$boundary['sura'], $boundary['first_aya'], $boundary['last_aya']];
  } else {
    $rangeSql = "((sura > ? AND sura < ?) OR (sura = ? AND aya >= ?) OR (sura = ? AND aya <= ?))";
    $types = "iiiiii";
    $params = [$boundary['sura'], $boundary['last_sura'],
               $boundary['sura'], $boundary['first_aya'],
               $boundary['last_sura'], $boundary['last_aya']];
  }

  $stmt2 = $conn->prepare("
    SELECT sura, aya, word_position, segment, pos, root_ar, lemma_buck, features
    FROM quran_morphology_all
    WHERE $rangeSql AND $posFilter
    ORDER BY sura, aya, word_position, segment
  ");
  $stmt2->bind_param($types, ...$params);
  $stmt2->execute();
  $rs = $stmt2->get_result();
  $items = [];
  while ($row = $rs->fetch_assoc()) {
    $items[] = $row;
  }
  $stmt2->close();
  $conn->close();

  echo json_encode([
    'range' => $boundary,
    'cat'   => $cat,
    'verbs' => $items,  // garde la clé 'verbs' pour compat avec le JS existant
    'count' => count($items),
  ], JSON_UNESCAPED_UNICODE);
} catch (Throwable $e) {
  http_response_code(500);
  echo json_encode(['error' => 'DB error', 'detail' => $e->getMessage()]);
}
