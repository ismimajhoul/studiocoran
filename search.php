<?php
header('Access-Control-Allow-Origin: *'); // autorise toutes les demandes CORS
header('Content-Type: application/json');

$servername = "localhost";
$username = "root";
$password = "root";
$dbname = "quran_wasla";

$conn = new mysqli($servername, $username, $password, $dbname);

if ($conn->connect_error) {
  die("Search Connection failed: " . $conn->connect_error);
}

$searchWord = $_GET['word'];

$stmt = $conn->prepare("
  SELECT * 
  FROM quran_text 
  WHERE text LIKE ?
");

// Notez les pourcentages autour du mot de recherche, qui signifient "n'importe quel nombre de caractères avant ou après ce mot"
$searchWord = "%" . $searchWord . "%";
$stmt->bind_param("s", $searchWord);

$stmt->execute();

$result = $stmt->get_result();

$verses = [];
while ($row = $result->fetch_assoc()) {
  $verses[] = $row;
}

echo json_encode(['verses' => $verses]);

$stmt->close();
$conn->close();
?>
