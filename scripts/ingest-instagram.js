// ingest-instagram.js
// Indicizza i post Instagram di Gianluca nella knowledge_base di Supabase
// Uso: node ingest-instagram.js
// Richiede: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, VOYAGE_API_KEY nel .env

require('dotenv').config();
const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');

const INSTAGRAM_JSON = './instagram-posts.json'; // rinomina il file scaricato da Apify
const BATCH_SIZE = 10; // quanti embedding fare per volta (rate limit Voyage AI)
const SLEEP_MS = 1000; // pausa tra batch

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

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
  console.log('Carico il file JSON...');
  const raw = fs.readFileSync(INSTAGRAM_JSON, 'utf8');
  const posts = JSON.parse(raw);
  console.log('Post totali nel file:', posts.length);

  // Filtra solo post con caption utile (min 50 caratteri)
  const validi = posts.filter(p => {
    const caption = (p.caption || '').trim();
    return caption.length >= 50;
  });
  console.log('Post con caption utile (>=50 char):', validi.length);

  // Verifica quali sono già indicizzati
  const { data: esistenti } = await supabase
    .from('knowledge_base')
    .select('metadata')
    .eq('metadata->>source', 'instagram');

  const urlEsistenti = new Set(
    (esistenti || []).map(r => r.metadata?.url).filter(Boolean)
  );
  console.log('Già indicizzati:', urlEsistenti.size);

  const daIndicizzare = validi.filter(p => !urlEsistenti.has(p.url));
  console.log('Da indicizzare:', daIndicizzare.length);

  if (daIndicizzare.length === 0) {
    console.log('Nessun nuovo post da indicizzare. Fine.');
    return;
  }

  let successi = 0;
  let errori = 0;

  // Processa in batch
  for (let i = 0; i < daIndicizzare.length; i += BATCH_SIZE) {
    const batch = daIndicizzare.slice(i, i + BATCH_SIZE);
    console.log(`Batch ${Math.floor(i/BATCH_SIZE)+1}/${Math.ceil(daIndicizzare.length/BATCH_SIZE)} — post ${i+1}-${Math.min(i+BATCH_SIZE, daIndicizzare.length)}`);

    try {
      // Prepara i testi per l'embedding
      const testi = batch.map(p => {
        const caption = (p.caption || '').trim();
        const hashtags = (p.hashtags || []).join(' ');
        // Costruisce un testo ricco: caption + hashtags (utili per il RAG)
        return `${caption}\n\nArgomenti: ${hashtags}`.substring(0, 2000);
      });

      // Genera embeddings
      const embeddings = await getEmbedding(testi);

      // Salva in Supabase
      for (let j = 0; j < batch.length; j++) {
        const p = batch[j];
        const caption = (p.caption || '').trim();

        const { error } = await supabase.from('knowledge_base').insert({
          content: `Post Instagram di Gianluca Liguori:\n\n${caption}`,
          embedding: embeddings[j],
          metadata: {
            source: 'instagram',
            url: p.url || '',
            type: p.type || 'Video',
            timestamp: p.timestamp || '',
            hashtags: (p.hashtags || []).slice(0, 10),
            likes: p.likesCount || 0
          }
        });

        if (error) {
          console.error('Errore salvataggio post', p.url, ':', error.message);
          errori++;
        } else {
          successi++;
        }
      }

      // Pausa tra batch per rispettare rate limit
      if (i + BATCH_SIZE < daIndicizzare.length) {
        await sleep(SLEEP_MS);
      }

    } catch (err) {
      console.error('Errore batch:', err.message);
      errori += batch.length;
    }
  }

  console.log('\n--- RISULTATO ---');
  console.log('Indicizzati con successo:', successi);
  console.log('Errori:', errori);
  console.log('Totale knowledge base Instagram:', successi + urlEsistenti.size);
}

main().catch(err => {
  console.error('Errore fatale:', err.message);
  process.exit(1);
});
