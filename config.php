<?php
header('Content-Type: application/javascript; charset=utf-8');

$envPath = __DIR__ . '/.env';
if (!file_exists($envPath)) {
  echo "window.APP_CONFIG = { error: 'Missing .env file' };";
  exit;
}

$lines = file($envPath, FILE_IGNORE_NEW_LINES);
$cfg = [];

foreach ($lines as $line) {
  $line = trim($line);
  if ($line === '' || substr($line, 0, 1) === '#') continue;

  $pos = strpos($line, '=');
  if ($pos === false) continue;

  $key = trim(substr($line, 0, $pos));
  $val = trim(substr($line, $pos + 1));

  // noņem pēdiņas, ja ieliktas
  if ((substr($val, 0, 1) === '"' && substr($val, -1) === '"') || (substr($val, 0, 1) === "'" && substr($val, -1) === "'")) {
    $val = substr($val, 1, -1);
  }

  $cfg[$key] = $val;
}

echo "window.APP_CONFIG = " . json_encode($cfg, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE) . ";";
