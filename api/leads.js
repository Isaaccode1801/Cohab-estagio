// api/leads.js (ESM)
// Função serverless: capta lead, deduplica (email/telefone) e retorna status.
// Opcional: encaminha para um CRM via webhook (LEADS_WEBHOOK_URL no .env).

// Se quiser forçar Node runtime (em plataformas que têm edge), descomente:
// export const config = { runtime: "nodejs" };

const memory = {
  // “CRM” em memória (reseta a cada reinício).
  // Mapeia chaves canônicas (e:email / p:phone) -> lead
  leadsByKey: new Map(),
};

function normEmail(s) {
  return String(s || "").trim().toLowerCase();
}
function normPhone(s) {
  return String(s || "").replace(/\D+/g, "");
}
function dedupeKey({ email, phone }) {
  const e = normEmail(email);
  const p = normPhone(phone);
  return e && p ? `e:${e}|p:${p}` : e ? `e:${e}` : p ? `p:${p}` : "";
}

async function parseBody(req) {
  try {
    // 1) algumas plataformas já entregam req.body como objeto/string
    if (req.body) {
      if (typeof req.body === "string") return req.body ? JSON.parse(req.body) : {};
      if (typeof req.body === "object") return req.body;
    }
    // 2) fallback: ler stream
    const chunks = [];
    for await (const ch of req) chunks.push(ch);
    const raw = Buffer.concat(chunks).toString("utf8");
    return raw ? JSON.parse(raw) : {};
  } catch (e) {
    console.log("[leads] parseBody error:", e?.message || e);
    return {};
  }
}

async function forwardToWebhook(payload) {
  const url = process.env.LEADS_WEBHOOK_URL;
  if (!url) return { forwarded: false };
  try {
    const r = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    return { forwarded: true, status: r.status };
  } catch {
    // não quebra o fluxo se o CRM externo falhar
    return { forwarded: false };
  }
}

export default async function handler(req, res) {
  // CORS
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();

  if (req.method !== "POST") {
    return res.status(405).json({ error: "METHOD_NOT_ALLOWED" });
  }

  const body = await parseBody(req);
  console.log("[leads] incoming:", body);

  const name = String(body?.name || "").trim();
  const email = normEmail(body?.email);
  const phone = normPhone(body?.phone);
  const city  = String(body?.city || "").trim() || "Aracaju";
  const propertyTitle = String(body?.propertyTitle || "").trim();
  const source = String(body?.source || "site").trim();

  if (!name) {
    return res.status(400).json({ error: "INVALID_INPUT", message: "Informe seu nome." });
  }
  if (!email && !phone) {
    return res.status(400).json({ error: "INVALID_INPUT", message: "Informe e-mail ou telefone." });
  }

  // chaves atômicas (dedupe por email OU telefone)
  const eKey = email ? `e:${email}` : null;
  const pKey = phone ? `p:${phone}` : null;

  const existing = memory.leadsByKey.get(eKey) || memory.leadsByKey.get(pKey);
  const now = new Date().toISOString();

  if (existing) {
    // atualiza último contato e campos básicos (idempotência)
    existing.name = name || existing.name;
    if (email) existing.email = email;
    if (phone) existing.phone = phone;
    existing.city = city;
    existing.propertyTitle = propertyTitle;
    existing.lastContactAt = now;

    const forwarded = await forwardToWebhook({ ...existing, duplicate: true, lastContactAt: now });
    return res.status(200).json({ status: "DUPLICATE", lead: existing, forwarded });
  }

  // cria novo “registro CRM”
  const id = `L${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const lead = {
    id,
    name,
    email,
    phone,
    city,
    propertyTitle,
    source,
    createdAt: now,
    lastContactAt: now,
  };

  // guarda sob todas as chaves disponíveis
  if (eKey) memory.leadsByKey.set(eKey, lead);
  if (pKey) memory.leadsByKey.set(pKey, lead);

  const forwarded = await forwardToWebhook({ ...lead, duplicate: false });

  return res.status(201).json({ status: "CREATED", lead, forwarded });
}
