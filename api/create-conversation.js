export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { userName } = req.body || {};
    
    const response = await fetch('https://tavusapi.com/v2/conversations', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': 'f5802a9d02fc4c7a9eb65bacf8d98d55'
      },
      body: JSON.stringify({
        persona_id: 'p327cfdeb718',
        conversation_name: 'Sessione MindColor - ' + (userName || 'Utente'),
        conversational_context: 'Stai parlando con ' + (userName || 'un utente') + '. Parla SEMPRE in italiano. Non usare mai l\'inglese.'
      })
    });

    const data = await response.json();
    return res.status(200).json(data);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
