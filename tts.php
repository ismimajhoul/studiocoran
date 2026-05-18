<?php
// tts.php — proxy serveur vers Google Translate TTS
// Contourne le blocage côté navigateur en ajoutant les bons headers (User-Agent, Referer).
// Usage : tts.php?text=...&lang=ar
// Limite : 200 caractères par requête (limite Google).

$text     = isset($_GET['text']) ? $_GET['text'] : '';
$lang     = isset($_GET['lang']) ? $_GET['lang'] : 'ar';
$download = isset($_GET['download']) && $_GET['download'] === '1';
$filename = isset($_GET['name']) ? preg_replace('/[^A-Za-z0-9_\-]/', '', $_GET['name']) : 'tts';

if ($text === '') {
  http_response_code(400);
  exit('Missing text parameter');
}
if (mb_strlen($text) > 200) {
  http_response_code(400);
  exit('Text too long (max 200 chars)');
}

$url = 'https://translate.google.com/translate_tts'
     . '?ie=UTF-8'
     . '&tl=' . urlencode($lang)
     . '&q='  . urlencode($text)
     . '&client=tw-ob';

$ch = curl_init($url);
curl_setopt_array($ch, [
  CURLOPT_RETURNTRANSFER => true,
  CURLOPT_FOLLOWLOCATION => true,
  CURLOPT_TIMEOUT        => 10,
  CURLOPT_USERAGENT      => 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
  CURLOPT_REFERER        => 'https://translate.google.com/',
  CURLOPT_HTTPHEADER     => [
    'Accept: audio/mpeg, audio/*;q=0.9, */*;q=0.5',
    'Accept-Language: ar,en;q=0.9',
  ],
  // MAMP Windows n'a pas de bundle CA configuré → désactivation de la vérif SSL
  // (acceptable en local ; sinon : ajouter curl.cainfo=... dans php.ini)
  CURLOPT_SSL_VERIFYPEER => false,
  CURLOPT_SSL_VERIFYHOST => 0,
]);
$data        = curl_exec($ch);
$httpCode    = curl_getinfo($ch, CURLINFO_HTTP_CODE);
$contentType = curl_getinfo($ch, CURLINFO_CONTENT_TYPE);
$curlErrno   = curl_errno($ch);
$curlError   = curl_error($ch);
// (curl_close() est inutile depuis PHP 8.0 : la ressource se libère seule)

if ($httpCode === 200 && $data !== false && stripos($contentType, 'audio') !== false) {
  header('Content-Type: ' . $contentType);
  header('Content-Length: ' . strlen($data));
  header('Cache-Control: public, max-age=86400');
  header('Access-Control-Allow-Origin: *');
  if ($download) {
    header('Content-Disposition: attachment; filename="' . $filename . '.mp3"');
  }
  echo $data;
} else {
  http_response_code(502);
  header('Content-Type: text/plain; charset=utf-8');
  echo "Upstream error\n";
  echo "  HTTP code   : $httpCode\n";
  echo "  Content-Type: $contentType\n";
  echo "  cURL errno  : $curlErrno\n";
  echo "  cURL error  : $curlError\n";
  echo "  URL         : $url\n";
}
