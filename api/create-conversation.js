const https = require('https');
const { createClient } = require('@supabase/supabase-js');

async function getEmbedding(text, voyageKey) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ model: 'voyage-3', input: [text], input_type: 'query' });
    const options = {
      hostname: 'api.voyageai.com',
      path: '/v1/embeddings',
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + voyageKey, 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }
    };
    const req = https.request(options, (res) => {
      let d = '';
      res.on('data', chunk => d += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(d);
          if (parsed.data) resolve(parsed.data[0].embedding);
          else reject(new Error(JSON.stringify(parsed)));
        } catch(e) { reject(e); }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { user_name, colore_dominante, pct_giallo, pct_blu, pct_verde, pct_rosso, ultimo_blocco, ultimo_impegno, fase_percorso } = req.body || {};

    let knowledge = '';
    try {
      const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
      const query = `coaching ${colore_dominante || ''} ${ultimo_blocco || ''} min
cat > ~/Documents/Mindcolor/api/create-conversation.js << 'FINE'
const https = require('https');
const { createClient } = require('@supabase/supabase-js');

async function getEmbedding(text, voyageKey) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ model: 'voyage-3', input: [text], input_type: 'query' });
    const options = {
      hostname: 'api.voyageai.com',
      path: '/v1/embeddings',
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + voyageKey, 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }
    };
    const req = https.request(options, (res) => {
      let d = '';
      res.on('data', chunk => d += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(d);
          if (parsed.data) resolve(parsed.data[0].embedding);
          else reject(new Error(JSON.stringify(parsed)));
        } catch(e) { reject(e); }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { user_name, colore_dominante, pct_giallo, pct_blu, pct_verde, pct_rosso, ultimo_blocco, ultimo_impegno, fase_percorso } = req.body || {};

    let knowledge = '';
    try {
      const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
      const query = `coaching ${colore_dominante || ''} ${ultimo_blocco || ''} mindset`;
      const embedding = await getEmbedding(query, process.env.VOYAGE_API_KEY);
      const { data } = await supabase.rpc('search_knowledge', { query_embedding: embedding, match_count: 3 });
      if (data && data.length > 0) {
        knowledge = data.map(d => d.content).join('\n\n');
      }
    } catch(e) {
      console.log('RAG non disponibile:', e.message);
    }

    const context = `Stai parlando con ${user_name || 'un utente'}.
Colore dominante: ${colore_dominante || 'non definito'} (Giallo ${pct_giallo||0}%, Blu ${pct_blu||0}%, Verde ${pct_verde||0}%, Rosso ${pct_rosso||0}%).
Ultima sessione - blocco emerso: ${ultimo_blocco || 'nessuno ancora'}.
Impegno preso: ${ultimo_impegno || 'nessuno'}.
Fase del percorso: ${fase_percorso || 'Inizio'}.
${knowledge ? '\nCONTENUTI RILEVANTI DAL METODO DI GIANLUCA:\n' + knowledge : ''}

Parla SEMPRE e SOLO in italiano. Mai in inglese.`;

    const tavusResponse = await fetch('https://tavusapi.com/v2/conversations', {
      method: 'POST',
      headers: { 'x-api-key': process.env.TAVUS_API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        replica_id: 'r58eb4ba7eec',
        persona_id: 'p327cfdeb718',
        conversation_name: 'Sessione MindColor - ' + (user_name || 'Utente'),
        conversational_context: context
      })
    });

    const tavusData = await tavusResponse.json();
    if (!tavusResponse.ok) return res.status(500).json({ error: 'Errore Tavus', dettaglio: tavusData });
    return res.status(200).json(tavusData);

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
