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
    if (b.transcript) transcript = b.transcript;
    else if (b.properties?.analysis) transcript = b.properties.analysis;
    else if (b.data?.transcript) transcript = b.data.transcript;

    console.log("user_id:", user_id);
    console.log("transcript length:", transcript.length);

    if (!transcript || transcript.length < 10) {
      return res.status(200).json({ success: true, message: "Nessuna trascrizione disponibile" });
    }

    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
    const today = new Date().toISOString().split("T")[0];

    // ── 1. ANALISI CLAUDE HAIKU ──────────────────────────────────────────────
    const anthropicRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 1500,
        messages: [{
          role: "user",
          content: `Analizza questa trascrizione di una sessione di coaching basata sul metodo dei 4 colori (Giallo=Influente, Blu=Analitico, Verde=Nobile, Rosso=Dominante).

Restituisci SOLO un oggetto JSON valido senza markdown con questi campi:

- summary: stringa, riassunto in 2-3 frasi
- blocco_emerso: stringa, il blocco principale emerso
- impegno_preso: stringa, azione concreta entro 24 ore
- insight: stringa, realizzazione più importante
- vittorie: array di stringhe, eventuali vittorie o successi citati dall'utente (array vuoto se nessuno)
- blocchi_superati: array di stringhe, eventuali blocchi superati (array vuoto se nessuno)
- argomenti: array di stringhe, massimo 5 argomenti principali
- progressi: array di oggetti con campi "sfera" (una tra: business, relazioni, mente, salute, finanze, spiritualita) e "titolo" (stringa breve che descrive il progresso emerso). Includi solo progressi concreti e reali emersi dalla conversazione. Array vuoto se nessuno.
- pattern_colori: oggetto con campi "giallo", "blu", "verde", "rosso" (valori interi da -2 a +2). Indica il delta di ogni colore emerso dai comportamenti descritti nell'utente durante la sessione. Esempio: se l'utente ha mostrato comportamenti impulsivi/entusiasti usa giallo +1, se ha mostrato rigidità analitica usa blu +1, se ha evitato conflitti usa verde +1, se ha agito con decisione usa rosso +1. Usa valori negativi se ha lavorato contro quel pattern. 0 se neutro o non rilevabile.

Trascrizione: ${transcript.substring(0, 3500)}`
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
      parsed = {
        summary: text,
        blocco_emerso: "",
        impegno_preso: "",
        insight: "",
        vittorie: [],
        blocchi_superati: [],
        argomenti: [],
        progressi: [],
        pattern_colori: { giallo: 0, blu: 0, verde: 0, rosso: 0 }
      };
    }

    // Normalizza campi mancanti
    parsed.progressi = parsed.progressi || [];
    parsed.pattern_colori = parsed.pattern_colori || { giallo: 0, blu: 0, verde: 0, rosso: 0 };
    parsed.vittorie = parsed.vittorie || [];
    parsed.blocchi_superati = parsed.blocchi_superati || [];

    // ── 2. SALVA IN SESSIONI ─────────────────────────────────────────────────
    await supabase.from("sessioni").insert({
      user_id,
      data_sessione: today,
      blocco_emerso: parsed.blocco_emerso || "",
      impegno_preso: parsed.impegno_preso || "",
      riassunto: parsed.summary || "",
      note: (parsed.argomenti || []).join(", ")
    });

    // ── 3. SALVA IN SESSION_MEMORY ───────────────────────────────────────────
    await supabase.from("session_memory").insert({
      user_id,
      conversation_id,
      summary: parsed.summary || "",
      blocco_emerso: parsed.blocco_emerso || "",
      impegno_preso: parsed.impegno_preso || "",
      insight: parsed.insight || ""
    });

    // ── 4. AGGIORNA PROFILO — blocco, impegno, fase_percorso ─────────────────
    if (user_id) {
      // Conta sessioni per aggiornare fase_percorso
      const { count: nSessioni } = await supabase
        .from("sessioni")
        .select("*", { count: "exact", head: true })
        .eq("user_id", user_id);

      let fase_percorso = "Inizio";
      if (nSessioni >= 15) fase_percorso = "Mastery";
      else if (nSessioni >= 8) fase_percorso = "Autonomia";
      else if (nSessioni >= 3) fase_percorso = "Lavoro sui pattern";
      else if (nSessioni >= 1) fase_percorso = "Blocchi identificati";
      else fase_percorso = "Profilo colori";

      await supabase.from("profiles").update({
        ultimo_blocco: parsed.blocco_emerso || "",
        ultimo_impegno: parsed.impegno_preso || "",
        fase_percorso
      }).eq("id", user_id);
    }

    // ── 5. SALVA VITTORIE EMERSE ─────────────────────────────────────────────
    if (user_id && parsed.vittorie.length > 0) {
      for (const vittoria of parsed.vittorie) {
        if (!vittoria || vittoria.trim().length < 3) continue;
        await supabase.from("vittorie").insert({
          user_id,
          descrizione: vittoria,
          data_vittoria: today,
          categoria: "Call coaching",
          note: "Emerso automaticamente dalla sessione"
        });
      }
    }

    // ── 6. SALVA BLOCCHI SUPERATI ────────────────────────────────────────────
    if (user_id && parsed.blocchi_superati.length > 0) {
      for (const blocco of parsed.blocchi_superati) {
        if (!blocco || blocco.trim().length < 3) continue;
        await supabase.from("blocchi").insert({
          user_id,
          nome_blocco: blocco,
          stato: "superato",
          data_identificazione: today,
          data_superamento: today,
          note: "Identificato automaticamente dalla sessione"
        });
      }
    }

    // ── 7. SALVA PROGRESSI AUTOMATICI PER SFERA ─────────────────────────────
    const sfereValide = ["business", "relazioni", "mente", "salute", "finanze", "spiritualita"];
    if (user_id && parsed.progressi.length > 0) {
      for (const prog of parsed.progressi) {
        if (!prog.sfera || !prog.titolo) continue;
        const sfera = prog.sfera.toLowerCase().trim();
        if (!sfereValide.includes(sfera)) continue;
        await supabase.from("progressi").insert({
          user_id,
          sfera,
          titolo: prog.titolo,
          note: "Emerso automaticamente dalla sessione del " + today,
          data: today
        });
      }
    }

    // ── 8. EVOLUZIONE COLORI ─────────────────────────────────────────────────
    // Aggiorna le percentuali in base ai pattern comportamentali emersi
    if (user_id) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("pct_giallo, pct_blu, pct_verde, pct_rosso")
        .eq("id", user_id)
        .single();

      if (profile) {
        const delta = parsed.pattern_colori;
        // Applica delta con peso leggero (max ±2 punti per sessione)
        const clamp = (v) => Math.max(0, Math.min(100, v));
        let g = clamp((profile.pct_giallo || 0) + (delta.giallo || 0));
        let b = clamp((profile.pct_blu || 0) + (delta.blu || 0));
        let v = clamp((profile.pct_verde || 0) + (delta.verde || 0));
        let r = clamp((profile.pct_rosso || 0) + (delta.rosso || 0));

        // Normalizza a 100 mantenendo le proporzioni
        const total = g + b + v + r;
        if (total > 0 && total !== 100) {
          g = Math.round((g / total) * 100);
          b = Math.round((b / total) * 100);
          v = Math.round((v / total) * 100);
          r = 100 - g - b - v; // l'ultimo prende il residuo per arrivare esatto a 100
        }

        // Colore dominante aggiornato
        const colori = [
          { nome: "Giallo", val: g },
          { nome: "Blu", val: b },
          { nome: "Verde", val: v },
          { nome: "Rosso", val: r }
        ];
        const dominante = colori.reduce((a, c) => c.val > a.val ? c : a).nome;

        await supabase.from("profiles").update({
          pct_giallo: g,
          pct_blu: b,
          pct_verde: v,
          pct_rosso: r,
          colore_dominante: dominante
        }).eq("id", user_id);

        console.log("Colori aggiornati:", { g, b, v, r, dominante });
      }
    }

    // ── 9. CARICA TRASCRIZIONE NELLA KNOWLEDGE BASE ──────────────────────────
    try {
      const voyageRes = await fetch("https://api.voyageai.com/v1/embeddings", {
        method: "POST",
        headers: {
          "Authorization": "Bearer " + process.env.VOYAGE_API_KEY,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model: "voyage-3",
          input: [transcript.substring(0, 2000)],
          input_type: "document"
        })
      });
      const voyageData = await voyageRes.json();
      if (voyageData.data) {
        await supabase.from("knowledge_base").insert({
          content: "Sessione coaching: " + (parsed.summary || transcript.substring(0, 500)),
          embedding: voyageData.data[0].embedding,
          metadata: {
            source: "session",
            user_id,
            conversation_id,
            blocco: parsed.blocco_emerso,
            insight: parsed.insight
          }
        });
      }
    } catch(e) {
      console.log("Embedding sessione fallito:", e.message);
    }

    return res.status(200).json({ success: true, data: parsed });

  } catch (err) {
    console.log("Errore save-session:", err.message);
    return res.status(500).json({ error: err.message });
  }
};
