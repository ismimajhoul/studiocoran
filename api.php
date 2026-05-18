<?php
header('Access-Control-Allow-Origin: *'); // autorise toutes les demandes CORS
header('Content-Type: application/json');

$servername = "mysql-studiocoran.alwaysdata.net";
$username = "323869";
$password = "Jesaispas94";
$dbname = "studiocoran_3";

$conn = new mysqli($servername, $username, $password, $dbname);

if ($conn->connect_error) {
  die("Connection failed: " . $conn->connect_error);
}

$page = $_GET['page'];

$stmt = $conn->prepare("
  SELECT * 
  FROM pages 
  WHERE page= ?
");
$stmt->bind_param("i", $page);

$stmt->execute();

$result = $stmt->get_result();
$row = $result->fetch_assoc();

if ($row["sura"] == $row["last_sura"]) {
    $stmt2 = $conn->prepare("
        SELECT * 
        FROM quran_text 
        WHERE sura = ? AND aya >= ? AND aya <= ?
    ");
    $stmt2->bind_param("iii", $row["sura"], $row["first_aya"], $row["last_aya"]);
} else {
    $stmt2 = $conn->prepare("
        SELECT * 
        FROM quran_text 
        WHERE (
            sura > ? AND sura < ?
        ) OR (
            sura = ? AND aya >= ?
        ) OR (
            sura = ? AND aya <= ?
        )
    ");
    $stmt2->bind_param("iiiiii", $row["sura"], $row["last_sura"], $row["sura"], $row["first_aya"], $row["last_sura"], $row["last_aya"]);
}

$stmt2->execute();

$result2 = $stmt2->get_result();

$verses = [];
while ($row2 = $result2->fetch_assoc()) {
  $verses[] = $row2;
}

echo json_encode(['verses' => $verses]);

$stmt->close();
$stmt2->close();
$conn->close();
?>
