// ingest-reels.js
// Indicizza le trascrizioni dei reel Instagram di Gianluca nella knowledge_base
// Uso: node ingest-reels.js
// Richiede: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, VOYAGE_API_KEY nel .env

require('dotenv').config();
const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');

const REELS_JSON = './instagram-reels.json';
const BATCH_SIZE = 10;
const SLEEP_MS = 1000;

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// Parole chiave che indicano trascrizione musicale invece di parlato di Gianluca
const KEYWORDS_MUSICA = [
  'spirit lead me', 'calm down do your best', 'higher than the mountains',
  'footsteps', 'lyrics', 'chorus', 'verse', 'let me walk upon the waters',
  'seeking god above', 'become one in the eyes'
];

function isMusica(transcript) {
  const t = transcript.toLowerCase();
  return KEYWORDS_MUSICA.some(k => t.includes(k));
}

async function getEmbedding(texts) {
  const res = await fetch('https://api.voyageai.com/v1/embeddings', {
    method: 'POST',
    headers: {
      'Authorization': 'Bearer ' + process.env.VOYAGE_API_KEY,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: 'voyage-3',
      input: texts,
      input_type: 'document'
    })
  });
  const data = await res.json();
  if (!data.data) throw new Error('Voyage AI error: ' + JSON.stringify(data));
  return data.data.map(d => d.embedding);
}

async function main() {
  console.log('Carico il file JSON reel...');
  const raw = fs.readFileSync(REELS_JSON, 'utf8');
  const reels = JSON.parse(raw);
  console.log('Reel totali:', reels.length);

  // Filtra reel con trascrizione utile (lunga e non musicale)
  const validi = reels.filter(r => {
    const t = (r.transcript || '').trim();
    if (!t || t.length < 100) return false;
    if (isMusica(t)) return false;
    return true;
  });
  console.log('Reel con trascrizione parlata utile:', validi.length);

  // Verifica quali sono già indicizzati
  const { data: esistenti } = await supabase
    .from('knowledge_base')
    .select('metadata')
    .eq('metadata->>source', 'instagram_reel');

  const urlEsistenti = new Set(
    (esistenti || []).map(r => r.metadata?.url).filter(Boolean)
  );
  console.log('Già indicizzati:', urlEsistenti.size);

  const daIndicizzare = validi.filter(r => !urlEsistenti.has(r.url));
  console.log('Da indicizzare:', daIndicizzare.length);

  if (daIndicizzare.length === 0) {
    console.log('Nessun nuovo reel da indicizzare. Fine.');
    return;
  }

  let successi = 0;
  let errori = 0;

  for (let i = 0; i < daIndicizzare.length; i += BATCH_SIZE) {
    const batch = daIndicizzare.slice(i, i + BATCH_SIZE);
    console.log(`Batch ${Math.floor(i/BATCH_SIZE)+1}/${Math.ceil(daIndicizzare.length/BATCH_SIZE)}`);

    try {
      const testi = batch.map(r => {
        const transcript = (r.transcript || '').trim();
        const caption = (r.caption || '').trim();
        // Combina trascrizione + caption per un embedding più ricco
        const testo = caption
          ? `${caption}\n\nTrascrizione: ${transcript}`.substring(0, 2000)
          : transcript.substring(0, 2000);
        return testo;
      });

      const embeddings = await getEmbedding(testi);

      for (let j = 0; j < batch.length; j++) {
        const r = batch[j];
        const transcript = (r.transcript || '').trim();
        const caption = (r.caption || '').trim();

        const { error } = await supabase.from('knowledge_base').insert({
          content: `Reel di Gianluca Liguori:\n\n${caption ? caption + '\n\n' : ''}${transcript}`,
          embedding: embeddings[j],
          metadata: {
            source: 'instagram_reel',
            url: r.url || '',
            timestamp: r.timestamp || '',
            hashtags: (r.hashtags || []).slice(0, 10),
            likes: r.likesCount || 0,
            views: r.videoViewCount || 0
          }
        });

        if (error) {
          console.error('Errore reel', r.url, ':', error.message);
          errori++;
        } else {
          successi++;
        }
      }

      if (i + BATCH_SIZE < daIndicizzare.length) await sleep(SLEEP_MS);

    } catch (err) {
      console.error('Errore batch:', err.message);
      errori += batch.length;
    }
  }

  console.log('\n--- RISULTATO ---');
  console.log('Indicizzati:', successi);
  console.log('Errori:', errori);
}

main().catch(err => {
  console.error('Errore fatale:', err.message);
  process.exit(1);
});
