// api/leads.js
import { createClient } from "@supabase/supabase-js";

// garanta que estas variáveis existem (.env local + dotenv no seu server)
const { SUPABASE_URL, SUPABASE_SERVICE_ROLE } = process.env;
if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE) {
  console.error("[leads] ENV faltando: SUPABASE_URL / SUPABASE_SERVICE_ROLE");
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE, {
  auth: { persistSession: false }
});

async function parseBody(req) {
  try {
    if (req.body) {
      if (typeof req.body === "string") return JSON.parse(req.body || "{}");
      if (typeof req.body === "object") return req.body;
    }
    const chunks = [];
    for await (const ch of req) chunks.push(ch);
    const raw = Buffer.concat(chunks).toString("utf8");
    return raw ? JSON.parse(raw) : {};
  } catch (e) {
    console.log("[leads] parseBody error:", e?.message || e);
    return {};
  }
}

const normEmail = (s) => String(s || "").trim().toLowerCase();
const normPhone = (s) => String(s || "").replace(/\D+/g, "");

export default async function handler(req, res) {
  // CORS
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "METHOD_NOT_ALLOWED" });

  try {
    const body = await parseBody(req);

    const name = String(body?.name || "").trim();
    const email = normEmail(body?.email);
    const phone = normPhone(body?.phone);
    const city  = String(body?.city || "Aracaju").trim();
    const propertyTitle = String(body?.propertyTitle || "").trim();
    const source = String(body?.source || "site");

    if (!name) return res.status(400).json({ error: "INVALID_INPUT", message: "Informe seu nome." });
    if (!email && !phone) {
      return res.status(400).json({ error: "INVALID_INPUT", message: "Informe e-mail ou telefone." });
    }

    // monta OR apenas com filtros existentes
    const ors = [];
    if (email) ors.push(`email_norm.eq.${email}`);
    if (phone) ors.push(`phone_norm.eq.${phone}`);

    // 1) buscar existente
    const query = supabase
      .from("leads")
      .select("id, name, email, phone, city, property_title, created_at, last_contact_at")
      .limit(1);

    if (ors.length) query.or(ors.join(","));

    const { data: found, error: findErr } = await query;

    if (findErr) {
      console.error("[leads] find error:", findErr); // <— veja o detalhe no console
      return res.status(500).json({ error: "SERVER_ERROR", message: "Falha ao consultar leads." });
    }

    if (Array.isArray(found) && found.length > 0) {
      const id = found[0].id;
      const { data: upd, error: updErr } = await supabase
        .from("leads")
        .update({
          name, email, phone, city,
          property_title: propertyTitle,
          last_contact_at: new Date().toISOString(),
        })
        .eq("id", id)
        .select()
        .single();

      if (updErr) {
        console.error("[leads] update error:", updErr);
        return res.status(500).json({ error: "SERVER_ERROR", message: "Falha ao atualizar lead." });
      }
      return res.status(200).json({ status: "DUPLICATE", lead: upd, forwarded: { forwarded: false } });
    }

    // 2) inserir novo
    const { data: ins, error: insErr } = await supabase
      .from("leads")
      .insert({
        name, email, phone, city,
        property_title: propertyTitle,
        source
      })
      .select()
      .single();

    if (insErr) {
      // colisão de unique (condição de corrida) → trata como DUPLICATE
      const txt = `${insErr?.message || ""} ${insErr?.details || ""}`.toLowerCase();
      if (txt.includes("duplicate") || txt.includes("already exists") || insErr?.code === "23505") {
        const { data: again } = await supabase
          .from("leads")
          .select("*")
          .or(ors.join(","))
          .limit(1)
          .single();
        return res.status(200).json({ status: "DUPLICATE", lead: again, forwarded: { forwarded: false } });
      }
      console.error("[leads] insert error:", insErr);
      return res.status(500).json({ error: "SERVER_ERROR", message: "Falha ao criar lead." });
    }

    return res.status(201).json({ status: "CREATED", lead: ins, forwarded: { forwarded: false } });
  } catch (e) {
    console.error("[leads] fatal:", e);
    return res.status(500).json({ error: "SERVER_ERROR", message: String(e?.message || e) });
  }
}
