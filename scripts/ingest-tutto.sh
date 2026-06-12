#!/bin/bash
# ingest-tutto.sh
# Lancia tutti gli script di ingestione in sequenza
# Uso: bash ingest-tutto.sh
# Assicurati di essere nella cartella scripts/ con tutti i file JSON presenti

echo "======================================"
echo "  MindColor — Ingestione Knowledge Base"
echo "======================================"
echo ""

# Verifica che i file JSON esistano
if [ ! -f "instagram-posts.json" ]; then
  echo "ERRORE: instagram-posts.json non trovato."
  echo "Rinomina il file scaricato da Apify (post) in instagram-posts.json"
  exit 1
fi

if [ ! -f "instagram-reels.json" ]; then
  echo "ERRORE: instagram-reels.json non trovato."
  echo "Rinomina il file scaricato da Apify (reel) in instagram-reels.json"
  exit 1
fi

if [ ! -f "corpus-coaching.json" ]; then
  echo "ERRORE: corpus-coaching.json non trovato."
  exit 1
fi

echo "1/3 — Ingestione post Instagram (caption)..."
node ingest-instagram.js
echo ""

echo "2/3 — Ingestione reel Instagram (trascrizioni)..."
node ingest-reels.js
echo ""

echo "3/3 — Ingestione corpus coaching originale..."
node ingest-corpus.js
echo ""

echo "======================================"
echo "  Ingestione completata!"
echo "======================================"
