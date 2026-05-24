<?php
// Copie ce fichier en `chat_config.php` (qui est gitignoré) et remplis la clé.
// Ne JAMAIS commiter chat_config.php sur git.

return [
    // Clé API Anthropic (commence par sk-ant-api03-...)
    'anthropic_api_key' => 'sk-ant-api03-REMPLACE-MOI',
    // Modèle à utiliser. Sonnet 4.6 = bon compromis qualité / coût pour le MVP.
    'model'             => 'claude-sonnet-4-6',
    // Limite de tokens par réponse (suffit largement pour 3-4 paragraphes).
    'max_tokens'        => 1024,
];
