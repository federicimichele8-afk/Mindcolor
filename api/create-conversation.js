module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { user_name, colore_dominante, pct_giallo, pct_blu, pct_verde, pct_rosso, ultimo_blocco, ultimo_impegno, fase_percorso } = req.body || {};

    const tavusResponse = await fetch('https://tavusapi.com/v2/conversations', {
      method: 'POST',
      headers: {
        'x-api-key': process.env.TAVUS_API_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        replica_id: 'r58eb4ba7eec',
        persona_id: 'p327cfdeb718',
        conversation_name: 'Sessione MindColor - ' + (user_name || 'Utente'),
        conversation_variables: {
          user_name: user_name || 'amico',
          colore_dominante: colore_dominante || 'non definito',
          pct_giallo: pct_giallo || 0,
          pct_blu: pct_blu || 0,
          pct_verde: pct_verde || 0,
          pct_rosso: pct_rosso || 0,
          ultimo_blocco: ultimo_blocco || 'nessuno ancora',
          ultimo_impegno: ultimo_impegno || 'nessuno ancora',
          fase_percorso: fase_percorso || 'Inizio'
        }
      })
    })

    const tavusData = await tavusResponse.json()
    if (!tavusResponse.ok) return res.status(500).json({ error: 'Errore Tavus', dettaglio: tavusData });

    return res.status(200).json(tavusData);

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}