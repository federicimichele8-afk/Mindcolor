// ingest-corpus.js
// Indicizza il corpus di coaching originale nella knowledge_base di Supabase
// Uso: node ingest-corpus.js
// Richiede: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, VOYAGE_API_KEY nel .env

require('dotenv').config();
const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');

const CORPUS_FILE = './corpus-coaching.json';
const BATCH_SIZE = 10;
const SLEEP_MS = 1000;

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
  console.log('Carico il corpus...');
  const raw = fs.readFileSync(CORPUS_FILE, 'utf8');
  const corpus = JSON.parse(raw);
  console.log('Testi nel corpus:', corpus.length);

  // Verifica quali sono già indicizzati
  const { data: esistenti } = await supabase
    .from('knowledge_base')
    .select('metadata')
    .eq('metadata->>source', 'corpus');

  const titoliEsistenti = new Set(
    (esistenti || []).map(r => r.metadata?.titolo).filter(Boolean)
  );
  console.log('Già indicizzati:', titoliEsistenti.size);

  const daIndicizzare = corpus.filter(c => !titoliEsistenti.has(c.titolo));
  console.log('Da indicizzare:', daIndicizzare.length);

  if (daIndicizzare.length === 0) {
    console.log('Corpus già completamente indicizzato. Fine.');
    return;
  }

  let successi = 0;
  let errori = 0;

  for (let i = 0; i < daIndicizzare.length; i += BATCH_SIZE) {
    const batch = daIndicizzare.slice(i, i + BATCH_SIZE);
    console.log(`Batch ${Math.floor(i/BATCH_SIZE)+1}/${Math.ceil(daIndicizzare.length/BATCH_SIZE)}`);

    try {
      const testi = batch.map(c => `${c.titolo}\n\n${c.testo}`);
      const embeddings = await getEmbedding(testi);

      for (let j = 0; j < batch.length; j++) {
        const c = batch[j];
        const { error } = await supabase.from('knowledge_base').insert({
          content: `${c.titolo}\n\n${c.testo}`,
          embedding: embeddings[j],
          metadata: {
            source: 'corpus',
            titolo: c.titolo,
            blocco: c.blocco
          }
        });

        if (error) {
          console.error('Errore:', c.titolo, error.message);
          errori++;
        } else {
          console.log('OK:', c.titolo);
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
