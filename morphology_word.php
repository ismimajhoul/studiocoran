<?php
header('Access-Control-Allow-Origin: *');
header('Content-Type: application/json');

// Auto-détection localhost vs prod (idem morphology.php).
$host = $_SERVER['HTTP_HOST'] ?? '';
$is_local = ($host === 'localhost' || strpos($host, '127.0.0.1') === 0
             || strpos($host, 'localhost:') === 0);
if ($is_local) {
  $servername = "localhost"; $username = "root"; $password = "root"; $dbname = "quran_wasla";
} else {
  $servername = "mysql-studiocoran.alwaysdata.net"; $username = "323869";
  $password = "Jesaispas94"; $dbname = "studiocoran_3";
}

mysqli_report(MYSQLI_REPORT_ERROR | MYSQLI_REPORT_STRICT);

try {
  $conn = new mysqli($servername, $username, $password, $dbname);
  $conn->set_charset('utf8mb4');

  $sura = isset($_GET['sura']) ? (int)$_GET['sura'] : 0;
  $aya  = isset($_GET['aya'])  ? (int)$_GET['aya']  : 0;
  $word = isset($_GET['word']) ? (int)$_GET['word'] : 0;
  if (!$sura || !$aya || !$word) {
    http_response_code(400);
    echo json_encode(['error' => 'Missing params (sura, aya, word)']);
    exit;
  }

  // Tous les segments du mot (préfixes + stem + suffixes éventuels).
  $stmt = $conn->prepare("
    SELECT segment, tag, pos, lemma_buck, root_buck, root_ar, features
    FROM quran_morphology_all
    WHERE sura = ? AND aya = ? AND word_position = ?
    ORDER BY segment
  ");
  $stmt->bind_param("iii", $sura, $aya, $word);
  $stmt->execute();
  $rs = $stmt->get_result();
  $segments = [];
  while ($row = $rs->fetch_assoc()) $segments[] = $row;
  $stmt->close();

  if (!$segments) {
    http_response_code(404);
    echo json_encode(['error' => 'Not found', 'sura'=>$sura, 'aya'=>$aya, 'word'=>$word]);
    exit;
  }

  // Segment "tête" : on prend en priorité le STEM avec un POS de contenu
  // (nom/verbe/adjectif/nom propre), sinon le 1er segment.
  $head = null;
  $contentPos = ['N','PN','ADJ','V','IMPV','IMPN','DEM','REL','PRON'];
  foreach ($segments as $s) {
    $isStem = (strpos($s['features'] ?? '', 'STEM') !== false);
    if ($isStem && in_array($s['pos'], $contentPos, true)) { $head = $s; break; }
  }
  if (!$head) $head = $segments[0];

  // Famille de la racine : autres lemmes du Coran partageant la même racine.
  $family = [];
  if (!empty($head['root_ar'])) {
    $stmt2 = $conn->prepare("
      SELECT lemma_buck, pos, COUNT(*) AS n
      FROM quran_morphology_all
      WHERE root_ar = ?
      GROUP BY lemma_buck, pos
      ORDER BY n DESC
      LIMIT 12
    ");
    $stmt2->bind_param("s", $head['root_ar']);
    $stmt2->execute();
    $rs2 = $stmt2->get_result();
    while ($r = $rs2->fetch_assoc()) $family[] = $r;
    $stmt2->close();
  }

  $conn->close();
  echo json_encode([
    'sura' => $sura, 'aya' => $aya, 'word' => $word,
    'head' => $head,
    'segments' => $segments,
    'family' => $family,
  ], JSON_UNESCAPED_UNICODE);
} catch (Throwable $e) {
  http_response_code(500);
  echo json_encode(['error' => 'DB error', 'detail' => $e->getMessage()]);
}
