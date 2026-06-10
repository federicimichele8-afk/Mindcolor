module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  try {
    const { user_name, colore_dominante, pct_giallo, pct_blu, pct_verde, pct_rosso, ultimo_blocco, ultimo_impegno, fase_percorso } = req.body || {};
    const context = 'Stai parlando con ' + (user_name || 'un utente') + '. Colore dominante: ' + (colore_dominante || 'non definito') + ' (Giallo ' + (pct_giallo||0) + '%, Blu ' + (pct_blu||0) + '%, Verde ' + (pct_verde||0) + '%, Rosso ' + (pct_rosso||0) + '%). Ultima sessione: ' + (ultimo_blocco || 'nessuna') + '. Impegno: ' + (ultimo_impegno || 'nessuno') + '. Fase: ' + (fase_percorso || 'Inizio') + '. Parla SEMPRE in italiano. Mai in inglese.';
    const tavusResponse = await fetch('https://tavusapi.com/v2/conversations', {
      method: 'POST',
      headers: { 'x-api-key': process.env.TAVUS_API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ replica_id: 'r58eb4ba7eec', persona_id: 'p327cfdeb718', conversation_name: 'Sessione MindColor - ' + (user_name || 'Utente'), conversational_context: context })
    });
    const tavusData = await tavusResponse.json();
    if (!tavusResponse.ok) return res.status(500).json({ error: 'Errore Tavus', dettaglio: tavusData });
    return res.status(200).json(tavusData);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
