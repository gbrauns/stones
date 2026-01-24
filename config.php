<?php
header('Content-Type: application/javascript; charset=utf-8');

$envPath = __DIR__ . '/.env';
if (!file_exists($envPath)) {
  echo "window.APP_CONFIG = { error: 'Missing .env file' };";
  exit;
}

$lines = file($envPath, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
$cfg = [];

foreach ($lines as $line) {
  $line = trim($line);
  if ($line === '' || str_starts_with($line, '#')) continue;
  $pos = strpos($line, '=');
  if ($pos === false) continue;

  $key = trim(substr($line, 0, $pos));
  $val = trim(substr($line, $pos + 1));

  // Noņem pēdiņas, ja ieliktas
  $val = trim($val, "\"'");

  $cfg[$key] = $val;
}

echo "window.APP_CONFIG = " . json_encode($cfg, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE) . ";";
