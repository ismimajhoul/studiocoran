<?php
/**
 * Proxy serveur vers l'API Anthropic Claude pour le chat linguistique.
 *
 * Reçoit en POST JSON :
 *   {
 *     "question": "...",                  // question utilisateur (string)
 *     "history":  [{role, content}, ...], // tours précédents (max ~10)
 *     "context":  {                        // contexte du verset/mot courant
 *       "sourate_num":   N,
 *       "sourate_name":  "...",
 *       "verset_num":    N,
 *       "verset_text":   "...",
 *       "verset_fr":     "...",
 *       "word":          "...",
 *       "morpho":        { ... }           // données morpho du mot cliqué
 *     }
 *   }
 *
 * Renvoie : { "reply": "...", "usage": {...} } ou { "error": "..." }.
 */

header('Content-Type: application/json; charset=utf-8');

// Charge la config (clé API hors-repo)
$cfgFile = __DIR__ . '/chat_config.php';
if (!file_exists($cfgFile)) {
    http_response_code(500);
    echo json_encode(['error' => 'Config manquante : créer chat_config.php depuis chat_config.example.php']);
    exit;
}
$cfg = require $cfgFile;
$apiKey = $cfg['anthropic_api_key'] ?? '';
$model  = $cfg['model']             ?? 'claude-sonnet-4-6';
$maxTok = (int)($cfg['max_tokens']  ?? 1024);

if (!$apiKey || strpos($apiKey, 'REMPLACE') !== false) {
    http_response_code(500);
    echo json_encode(['error' => 'Clé API non configurée dans chat_config.php']);
    exit;
}

// Lit le body JSON
$raw = file_get_contents('php://input');
$req = json_decode($raw, true);
if (!is_array($req)) {
    http_response_code(400);
    echo json_encode(['error' => 'Body JSON invalide']);
    exit;
}

$question = trim((string)($req['question'] ?? ''));
$history  = is_array($req['history'] ?? null) ? $req['history'] : [];
$context  = is_array($req['context'] ?? null) ? $req['context'] : [];

if ($question === '') {
    http_response_code(400);
    echo json_encode(['error' => 'Question vide']);
    exit;
}

// ─── System prompt : garde-fou linguistique strict ────────────────────────
$system = <<<SYS
Tu es l'assistant linguistique de Studio Coran, une application de lecture
du Coran qui aide l'utilisateur à comprendre la langue arabe du texte.

PÉRIMÈTRE STRICT — tu réponds UNIQUEMENT aux questions de nature linguistique :
- grammaire arabe (i'rab, conjugaison, déclinaison, particules)
- morphologie (racine, wazn, forme verbale, schème nominal)
- sémantique de surface (que veut dire ce mot ? quels sont ses sens en arabe classique ?)
- étymologie et dérivation (relations entre mots de même racine)
- syntaxe (rôle de chaque mot dans la phrase)

REFUS POLI — pour toute question hors-périmètre, réponds en français :
"Cette question dépasse le cadre linguistique auquel je me limite. Pour des
questions de tafsir, de fiqh, de théologie ou de spiritualité, je vous
recommande de consulter un savant qualifié ou un ouvrage de référence
(Tafsir Ibn Kathir, Al-Jalalayn, etc.)."
Cela inclut : sens spirituel, interprétation, jurisprudence, occasions de
révélation (asbāb al-nuzūl), comparaisons inter-religieuses, opinions
personnelles sur le texte.

DONNÉES FOURNIES — l'application te transmet à chaque tour :
- la sourate et le verset courants
- éventuellement le mot précis cliqué par l'utilisateur
- éventuellement les données morphologiques de ce mot (racine, lemme, wazn,
  features grammaticales, conjugaisons, participes, masdar)

Quand ces données sont fournies, APPUIE-TOI EN PRIORITÉ DESSUS plutôt que
sur ta mémoire générale. Si une donnée fournie semble contredire ta mémoire,
mentionne-le poliment ("d'après les données de l'application…") sans
trancher autoritairement.

STYLE — réponds en français clair, concis (3-5 phrases pour une question
simple, plus si justifié), avec les mots arabes en arabe et leur
translittération si utile. Évite les listes à puces sauf si la question
demande une énumération. N'utilise pas de markdown lourd (titres, gras
multiples) — c'est un chat, pas un article.
SYS;

// ─── Construction du message utilisateur enrichi du contexte ──────────────
$ctxLines = [];
if (!empty($context['sourate_num']) || !empty($context['sourate_name'])) {
    $n = $context['sourate_num']  ?? '?';
    $s = $context['sourate_name'] ?? '';
    $v = $context['verset_num']   ?? '?';
    $ctxLines[] = "Sourate {$n} ({$s}), verset {$v}.";
}
if (!empty($context['verset_text'])) {
    $ctxLines[] = "Texte arabe : " . $context['verset_text'];
}
if (!empty($context['verset_fr'])) {
    $ctxLines[] = "Traduction française : " . $context['verset_fr'];
}
if (!empty($context['word'])) {
    $ctxLines[] = "Mot précis sur lequel porte la question : " . $context['word'];
}
if (!empty($context['morpho']) && is_array($context['morpho'])) {
    $m = $context['morpho'];
    $morphoBits = [];
    foreach (['root_ar','lemma_ar','past_3ms','present_3ms','imperative_2ms',
              'masdar','active_participle','passive_participle',
              'verb_form','features'] as $k) {
        if (!empty($m[$k])) $morphoBits[] = "$k=" . $m[$k];
    }
    if ($morphoBits) {
        $ctxLines[] = "Données morphologiques de ce mot (faisant autorité) : "
                    . implode(' ; ', $morphoBits);
    }
}

$userMsg = '';
if ($ctxLines) {
    $userMsg .= "[CONTEXTE]\n" . implode("\n", $ctxLines) . "\n\n";
}
$userMsg .= "[QUESTION]\n" . $question;

// ─── Construction des messages pour l'API ─────────────────────────────────
$messages = [];
foreach ($history as $turn) {
    if (!is_array($turn)) continue;
    $r = $turn['role']    ?? '';
    $c = $turn['content'] ?? '';
    if (!in_array($r, ['user','assistant'], true) || !is_string($c) || $c === '') continue;
    $messages[] = ['role' => $r, 'content' => $c];
}
$messages[] = ['role' => 'user', 'content' => $userMsg];

// ─── Appel API Anthropic ──────────────────────────────────────────────────
$payload = [
    'model'      => $model,
    'max_tokens' => $maxTok,
    'system'     => $system,
    'messages'   => $messages,
];

$ch = curl_init('https://api.anthropic.com/v1/messages');
curl_setopt_array($ch, [
    CURLOPT_POST           => true,
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_HTTPHEADER     => [
        'Content-Type: application/json',
        'x-api-key: ' . $apiKey,
        'anthropic-version: 2023-06-01',
    ],
    CURLOPT_POSTFIELDS     => json_encode($payload, JSON_UNESCAPED_UNICODE),
    CURLOPT_TIMEOUT        => 60,
]);
// MAMP/WAMP local ne possède pas de CA bundle → la vérification SSL échoue.
// On la désactive uniquement en local. En prod (alwaysdata), la vérif reste ON.
$srvName = $_SERVER['SERVER_NAME'] ?? '';
$srvAddr = $_SERVER['SERVER_ADDR'] ?? '';
$isLocal = in_array($srvName, ['localhost', '127.0.0.1', '::1'], true)
        || in_array($srvAddr, ['127.0.0.1', '::1'], true)
        || str_ends_with($srvName, '.local');
if ($isLocal) {
    curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);
    curl_setopt($ch, CURLOPT_SSL_VERIFYHOST, 0);
}
$resp = curl_exec($ch);
$http = curl_getinfo($ch, CURLINFO_HTTP_CODE);
$err  = curl_error($ch);

if ($resp === false) {
    http_response_code(502);
    echo json_encode(['error' => 'Erreur réseau vers Anthropic : ' . $err]);
    exit;
}
if ($http !== 200) {
    http_response_code(502);
    echo json_encode(['error' => "API Anthropic a renvoyé HTTP $http", 'detail' => $resp]);
    exit;
}

$data = json_decode($resp, true);
$reply = '';
if (isset($data['content']) && is_array($data['content'])) {
    foreach ($data['content'] as $block) {
        if (($block['type'] ?? '') === 'text') $reply .= $block['text'];
    }
}

echo json_encode([
    'reply' => $reply,
    'usage' => $data['usage'] ?? null,
    'model' => $data['model'] ?? $model,
]);
