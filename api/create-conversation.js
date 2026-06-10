import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
)

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
    const { user_id } = req.body || {};

    if (!user_id) {
      return res.status(400).json({ error: 'user_id mancante' });
    }

    // 1. Prendi profilo utente
    const { data: profilo, error: profiloError } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user_id)
      .single()

    if (profiloError || !profilo) {
      return res.status(404).json({ error: 'Profilo non trovato' });
    }

    // 2. Prendi ultima sessione
    const { data: sessioni } = await supabase
      .from('sessioni')
      .select('*')
      .eq('user_id', user_id)
      .order('created_at', { ascending: false })
      .limit(1)

    const ultimaSessione = sessioni?.[0] || null

    // 3. Determina fase del percorso
    const { count: numSessioni } = await supabase
      .from('sessioni')
      .select('id', { count: 'exact' })
      .eq('user_id', user_id)

    let fase_percorso = 'Inizio'
    if (numSessioni >= 2) fase_percorso = 'Profilo colori definito'
    if (numSessioni >= 5) fase_percorso = 'Blocchi identificati'
    if (numSessioni >= 10) fase_percorso = 'Lavoro sui pattern'
    if (numSessioni >= 20) fase_percorso = 'Autonomia crescente'
    if (numSessioni >= 30) fase_percorso = 'Mastery'

    // 4. Crea conversazione Tavus
    const tavusResponse = await fetch('https://tavusapi.com/v2/conversations', {
      method: 'POST',
      headers: {
        'x-api-key': process.env.TAVUS_API_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        replica_id: 'r58eb4ba7eec',
        persona_id: 'p327cfdeb718',
        conversation_name: 'Sessione MindColor - ' + (profilo.nome || 'Utente'),
        conversation_variables: {
          user_name: profilo.nome || 'amico',
          colore_dominante: profilo.colore_dominante || 'non definito',
          pct_giallo: profilo.pct_giallo || 0,
          pct_blu: profilo.pct_blu || 0,
          pct_verde: profilo.pct_verde || 0,
          pct_rosso: profilo.pct_rosso || 0,
          ultimo_blocco: ultimaSessione?.blocco_emerso || 'nessuno ancora',
          ultimo_impegno: ultimaSessione?.impegno_preso || 'nessuno ancora',
          fase_percorso: fase_percorso
        }
      })
    })

    const tavusData = await tavusResponse.json()

    if (!tavusResponse.ok) {
      return res.status(500).json({ error: 'Errore Tavus', dettaglio: tavusData });
    }

    return res.status(200).json(tavusData);

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
