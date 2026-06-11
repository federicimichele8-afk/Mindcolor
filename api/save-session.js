const { createClient } = require("@supabase/supabase-js");

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    const b = req.body || {};
    const user_id = b.user_id || "";
    const conversation_id = b.conversation_id || "";
    const transcript = b.transcript || "";

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
          content: "Analizza questa trascrizione di una sessione di coaching e restituisci SOLO un JSON con questi campi: summary (riassunto in 2-3 frasi), blocco_emerso (il blocco principale emerso), impegno_preso (l azione concreta che si e impegnato a fare), insight (la realizzazione piu importante). Trascrizione: " + transcript
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

    await supabase.from("profiles").update({
      ultimo_blocco: parsed.blocco_emerso || "",
      ultimo_impegno: parsed.impegno_preso || ""
    }).eq("id", user_id);

    return res.status(200).json({ success: true, data: parsed });

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}