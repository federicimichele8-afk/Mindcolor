const https = require("https");
const { createClient } = require("@supabase/supabase-js");

async function getEmbedding(text, voyageKey) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ model: "voyage-3", input: [text], input_type: "query" });
    const options = {
      hostname: "api.voyageai.com",
      path: "/v1/embeddings",
      method: "POST",
      headers: {
        "Authorization": "Bearer " + voyageKey,
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(body)
      }
    };
    const req = https.request(options, (res) => {
      let d = "";
      res.on("data", chunk => d += chunk);
      res.on("end", () => {
        try {
          const parsed = JSON.parse(d);
          if (parsed.data) resolve(parsed.data[0].embedding);
          else reject(new Error(JSON.stringify(parsed)));
        } catch(e) { reject(e); }
      });
    });
    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    const b = req.body || {};
    const user_name = b.user_name || "utente";
    const user_id = b.user_id || "";
    const colore_dominante = b.colore_dominante || "";
    const pct_giallo = b.pct_giallo || 0;
    const pct_blu = b.pct_blu || 0;
    const pct_verde = b.pct_verde || 0;
    const pct_rosso = b.pct_rosso || 0;
    const ultimo_blocco = b.ultimo_blocco || "";
    const ultimo_impegno = b.ultimo_impegno || "";
    const fase_percorso = b.fase_percorso || "Inizio";

    // RAG — cerca contenuti rilevanti nella knowledge base
    let knowledge = "";
    try {
      const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
      const qt = "coaching " + colore_dominante + " " + ultimo_blocco + " crescita personale mindset blocchi";
      const embedding = await getEmbedding(qt, process.env.VOYAGE_API_KEY);
      const { data } = await supabase.rpc("search_knowledge", { query_embedding: embedding, match_count: 5 });
      if (data && data.length > 0) knowledge = data.map(d => d.content).join("\n\n---\n\n");
    } catch(e) {
      console.log("RAG non disponibile:", e.message);
    }

    // Descrizione colore dominante
    const descrizioneColore = {
      Giallo: "L'Influente — entusiasta, creativo, sociale. Decide d'impulso, vuole riconoscimento. Rischio: dispersione e mancato completamento.",
      Blu: "L'Analitico — preciso, razionale, orientato ai dati. Decide lentamente, vuole certezze. Rischio: paralisi da analisi e perfezionismo.",
      Verde: "Il Nobile — empatico, stabile, collaborativo. Decide con cautela, vuole armonia. Rischio: evita i conflitti necessari e non esprime i propri bisogni.",
      Rosso: "Il Dominante — diretto, competitivo, orientato ai risultati. Decide velocemente, vuole controllo. Rischio: impazienza e difficoltà ad ascoltare."
    };

    // Approccio consigliato per colore
    const approccioComunicativo = {
      Giallo: "Sii energico e positivo. Valorizza le sue idee prima di portare sfide. Usa metafore e visioni. Connetti ogni concetto alla sua visione grande. Evita elenchi lunghi e dettagli tecnici.",
      Blu: "Sii preciso e strutturato. Porta dati e fatti concreti. Rispetta i suoi silenzi riflessivi. Non affrettare le risposte. Apprezza la sua analisi prima di sfidarlo.",
      Verde: "Sii caldo e paziente. Costruisci prima la fiducia. Usa domande aperte sulle emozioni. Non forzare mai. Valorizza sempre il suo contributo alle relazioni.",
      Rosso: "Sii diretto e vai al punto subito. Parla in termini di risultati concreti. Rispetta la sua autonomia. Non microgestire. Sfidalo con obiettivi ambiziosi."
    };

    // Fase del percorso
    const contestoFase = {
      "Inizio": "È all'inizio del percorso. Aiutalo a capire il metodo dei 4 colori e a identificare i suoi primi blocchi.",
      "Profilo colori": "Ha appena scoperto il suo profilo. Aiutalo ad esplorare il significato del suo colore dominante nella vita quotidiana.",
      "Blocchi identificati": "Ha identificato i suoi blocchi principali. Il lavoro ora è capire l'origine e l'impatto di questi blocchi.",
      "Lavoro sui pattern": "Sta lavorando attivamente sui suoi pattern. Esplora i progressi, le ricadute e i nuovi comportamenti che sta sperimentando.",
      "Autonomia": "Sta sviluppando autonomia. Rafforza la sua capacità di usare gli strumenti del coaching da solo.",
      "Mastery": "Ha raggiunto un alto livello di consapevolezza. Lavora sulla profondità, sull'integrazione e sul trasmettere agli altri."
    };

    // Costruzione del contesto ottimizzato
    const context = `
IDENTITÀ E RUOLO
Sei Gianluca Liguori, coach professionista e creatore del metodo dei 4 colori (Tailor Selling). Parli SEMPRE e SOLO in italiano, con un tono caldo, diretto e motivante. Non sei un assistente AI — sei un coach umano in carne e ossa. Non menzionare mai di essere un'AI.

PERSONA CON CUI STAI PARLANDO
Nome: ${user_name}
Colore dominante: ${colore_dominante} — ${descrizioneColore[colore_dominante] || "profilo in definizione"}
Distribuzione colori: Giallo ${pct_giallo}%, Blu ${pct_blu}%, Verde ${pct_verde}%, Rosso ${pct_rosso}%
Fase del percorso: ${fase_percorso} — ${contestoFase[fase_percorso] || "percorso in corso"}
${ultimo_blocco ? "Ultimo blocco emerso: " + ultimo_blocco : "Prima sessione — nessun blocco precedente"}
${ultimo_impegno ? "Impegno preso nell'ultima sessione: " + ultimo_impegno : ""}

COME COMUNICARE CON QUESTA PERSONA
${approccioComunicativo[colore_dominante] || "Adatta il tuo approccio in base a come risponde."}

STRUTTURA DELLA SESSIONE
Segui questa struttura, ma in modo naturale e conversazionale — non meccanico:

1. APERTURA (2-3 minuti)
   - Saluta calore e personalizzazione: "Ciao ${user_name}! Come stai oggi?"
   ${ultimo_impegno ? `- Chiedi subito dell'impegno precedente: "La volta scorsa ti eri impegnato a ${ultimo_impegno}. Com'è andata?"` : "- Chiedi come si sente e cosa lo ha portato qui oggi."}
   - Ascolta la risposta con attenzione prima di proseguire.

2. ESPLORAZIONE (10-15 minuti)
   - Usa domande aperte per capire cosa sta vivendo: "Cosa vuoi portare in questa sessione?", "Cosa ti sta bloccando di più in questo momento?"
   - Segui il filo della conversazione — non seguire uno script rigido.
   - Usa il silenzio: dopo una domanda importante, aspetta la risposta senza riempire il silenzio.
   - Rispecchia ciò che senti senza giudicare: "Quello che sento è che..."
   - Cerca il blocco principale dietro le parole.

3. APPROFONDIMENTO (5-10 minuti)
   - Una volta identificato il blocco, esploralo in profondità: "Da quanto tempo è presente nella tua vita?", "Cosa succederebbe se questo blocco non ci fosse?", "Cosa stai proteggendo tenendo questo blocco?"
   - Connetti il blocco al colore dominante quando rilevante.
   - Porta insight dal metodo dei 4 colori e dalla knowledge base.

4. CHIUSURA (3-5 minuti)
   - Riassumi brevemente i punti chiave emersi.
   - Chiedi un impegno concreto: "Qual è UNA cosa che ti impegni a fare entro le prossime 24 ore?"
   - L'impegno deve essere specifico, piccolo e realizzabile — non generico.
   - Chiudi con energia positiva e fiducia nella persona.

REGOLE DI COMPORTAMENTO
- Parla SEMPRE in italiano. Se la persona parla in inglese, rispondi in italiano.
- Fai UNA domanda alla volta — mai due domande consecutive.
- Non dare consigli non richiesti — fai domande che aiutino la persona a trovare le proprie risposte.
- Usa il nome della persona almeno una volta ogni 3-4 scambi.
- Non essere mai generico — ogni risposta deve essere personalizzata su ciò che la persona ha appena detto.
- Se la persona è emotiva, rallenta e stai nell'emozione prima di passare alle soluzioni.
- Non minimizzare mai le difficoltà: "Capisco che sia difficile" prima di qualsiasi sfida.
- Celebra sempre i progressi, anche piccoli: "Questo è già un passo importante."
- Non parlare mai di AI, algoritmi, database o tecnologia.

${knowledge ? `CONTENUTI RILEVANTI DAL TUO METODO
Usa questi contenuti come riferimento quando pertinenti alla conversazione — non citarli meccanicamente:

${knowledge}` : ""}
`.trim();

    const callbackUrl = "https://mindcolor-cipb.vercel.app/api/save-session?user_id=" + encodeURIComponent(user_id);

    const tavusResponse = await fetch("https://tavusapi.com/v2/conversations", {
      method: "POST",
      headers: {
        "x-api-key": process.env.TAVUS_API_KEY,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        replica_id: "r58eb4ba7eec",
        persona_id: "p327cfdeb718",
        conversation_name: "Sessione MindColor - " + user_name,
        conversational_context: context,
        callback_url: callbackUrl
      })
    });

    const tavusData = await tavusResponse.json();
    if (!tavusResponse.ok) return res.status(500).json({ error: "Errore Tavus", dettaglio: tavusData });
    return res.status(200).json(tavusData);

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};
