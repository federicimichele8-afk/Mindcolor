const { createClient } = require("@supabase/supabase-js");

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    const b = req.body || {};
    const user_id = req.query?.user_id || b.user_id || b.properties?.user_id || "";
    const conversation_id = b.conversation_id || b.data?.conversation_id || "";

    let transcript = "";
    if (b.transcript) {
      transcript = b.transcript;
    } else if (b.properties?.analysis) {
      transcript = b.properties.analysis;
    } else if (b.data?.transcript) {
      transcript = b.data.transcript;
    }

    console.log("user_id:", user_id);
    console.log("transcript length:", transcript.length);

    if (!transcript || transcript.length < 10) {
      return res.status(200).json({ success: true, message: "Nessuna trascrizione disponibile" });
    }

    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

    const anthropicRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 500,
        messages: [{
          role: "user",
          content: "Analizza questa trascrizione di una sessione di coaching. Restituisci SOLO un oggetto JSON valido senza markdown con questi campi: summary (stringa, riassunto in 2-3 frasi), blocco_emerso (stringa, il blocco principale emerso), impegno_preso (stringa, azione concreta entro 24 ore), insight (stringa, realizzazione piu importante). Trascrizione: " + transcript.substring(0, 3000)
        }]
      })
    });

    const anthropicData = await anthropicRes.json();
    const text = anthropicData.content[0].text;
    let parsed = {};
    try {
      const clean = text.replace(/```json|```/g, "").trim();
      parsed = JSON.parse(clean);
    } catch(e) {
      parsed = { summary: text, blocco_emerso: "", impegno_preso: "", insight: "" };
    }

    await supabase.from("session_memory").insert({
      user_id,
      conversation_id,
      summary: parsed.summary || "",
      blocco_emerso: parsed.blocco_emerso || "",
      impegno_preso: parsed.impegno_preso || "",
      insight: parsed.insight || ""
    });

    if (user_id) {
      await supabase.from("profiles").update({
        ultimo_blocco: parsed.blocco_emerso || "",
        ultimo_impegno: parsed.impegno_preso || ""
      }).eq("id", user_id);
    }

    try {
      const voyageRes = await fetch("https://api.voyageai.com/v1/embeddings", {
        method: "POST",
        headers: { "Authorization": "Bearer " + process.env.VOYAGE_API_KEY, "Content-Type": "application/json" },
        body: JSON.stringify({ model: "voyage-3", input: [transcript.substring(0, 2000)], input_type: "document" })
      });
      const voyageData = await voyageRes.json();
      if (voyageData.data) {
        await supabase.from("knowledge_base").insert({
          content: "Sessione coaching: " + (parsed.summary || transcript.substring(0, 500)),
          embedding: voyageData.data[0].embedding,
          metadata: { source: "session", user_id, conversation_id, blocco: parsed.blocco_emerso, insight: parsed.insight }
        });
      }
    } catch(e) { console.log("Embedding sessione fallito:", e.message); }

    return res.status(200).json({ success: true, data: parsed });

  } catch (err) {
    console.log("Errore save-session:", err.message);
    return res.status(500).json({ error: err.message });
  }
}