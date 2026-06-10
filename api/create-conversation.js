{\rtf1\ansi\ansicpg1252\cocoartf2822
\cocoatextscaling0\cocoaplatform0{\fonttbl\f0\fswiss\fcharset0 Helvetica;}
{\colortbl;\red255\green255\blue255;}
{\*\expandedcolortbl;;}
\paperw11900\paperh16840\margl1440\margr1440\vieww12740\viewh19140\viewkind0
\pard\tx566\tx1133\tx1700\tx2267\tx2834\tx3401\tx3968\tx4535\tx5102\tx5669\tx6236\tx6803\pardirnatural\partightenfactor0

\f0\fs24 \cf0 const https = require("https");\
const \{ createClient \} = require("@supabase/supabase-js");\
\
async function getEmbedding(text, voyageKey) \{\
  return new Promise((resolve, reject) => \{\
    const body = JSON.stringify(\{ model: "voyage-3", input: [text], input_type: "query" \});\
    const options = \{\
      hostname: "api.voyageai.com",\
      path: "/v1/embeddings",\
      method: "POST",\
      headers: \{ "Authorization": "Bearer " + voyageKey, "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body) \}\
    \};\
    const req = https.request(options, (res) => \{\
      let d = "";\
      res.on("data", chunk => d += chunk);\
      res.on("end", () => \{\
        try \{\
          const parsed = JSON.parse(d);\
          if (parsed.data) resolve(parsed.data[0].embedding);\
          else reject(new Error(JSON.stringify(parsed)));\
        \} catch(e) \{ reject(e); \}\
      \});\
    \});\
    req.on("error", reject);\
    req.write(body);\
    req.end();\
  \});\
\}\
\
module.exports = async function handler(req, res) \{\
  res.setHeader("Access-Control-Allow-Origin", "*");\
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");\
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");\
  if (req.method === "OPTIONS") return res.status(200).end();\
  if (req.method !== "POST") return res.status(405).json(\{ error: "Method not allowed" \});\
\
  try \{\
    const body = req.body || \{\};\
    const user_name = body.user_name || "utente";\
    const colore_dominante = body.colore_dominante || "";\
    const pct_giallo = body.pct_giallo || 0;\
    const pct_blu = body.pct_blu || 0;\
    const pct_verde = body.pct_verde || 0;\
    const pct_rosso = body.pct_rosso || 0;\
    const ultimo_blocco = body.ultimo_blocco || "";\
    const ultimo_impegno = body.ultimo_impegno || "";\
    const fase_percorso = body.fase_percorso || "Inizio";\
\
    let knowledge = "";\
    try \{\
      const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);\
      const queryText = "coaching " + colore_dominante + " " + ultimo_blocco + " mindset";\
      const embedding = await getEmbedding(queryText, process.env.VOYAGE_API_KEY);\
      const \{ data \} = await supabase.rpc("search_knowledge", \{ query_embedding: embedding, match_count: 3 \});\
      if (data && data.length > 0) \{\
        knowledge = data.map(function(d) \{ return d.content; \}).join("\\n\\n");\
      \}\
    \} catch(e) \{\
      console.log("RAG non disponibile:", e.message);\
    \}\
\
    const context = "Stai parlando con " + user_name + ".\\n" +\
      "Colore dominante: " + colore_dominante + " (Giallo " + pct_giallo + "%, Blu " + pct_blu + "%, Verde " + pct_verde + "%, Rosso " + pct_rosso + "%).\\n" +\
      "Ultima sessione - blocco emerso: " + (ultimo_blocco || "nessuno ancora") + ".\\n" +\
      "Impegno preso: " + (ultimo_impegno || "nessuno") + ".\\n" +\
      "Fase del percorso: " + fase_percorso + ".\\n" +\
      (knowledge ? "\\nCONTENUTI RILEVANTI DAL METODO DI GIANLUCA:\\n" + knowledge : "") +\
      "\\n\\nParla SEMPRE e SOLO in italiano. Mai in inglese.";\
\
    const tavusResponse = await fetch("https://tavusapi.com/v2/conversations", \{\
      method: "POST",\
      headers: \{ "x-api-key": process.env.TAVUS_API_KEY, "Content-Type": "application/json" \},\
      body: JSON.stringify(\{\
        replica_id: "r58eb4ba7eec",\
        persona_id: "p327cfdeb718",\
        conversation_name: "Sessione MindColor - " + user_name,\
        conversational_context: context\
      \})\
    \});\
\
    const tavusData = await tavusResponse.json();\
    if (!tavusResponse.ok) return res.status(500).json(\{ error: "Errore Tavus", dettaglio: tavusData \});\
    return res.status(200).json(tavusData);\
\
  \} catch (err) \{\
    return res.status(500).json(\{ error: err.message \});\
  \}\
\}}