// api/holidays.js  (ESM)
// Lê feriados de um calendário público do Google e devolve [{date, reason, boost}]
import fetch from "node-fetch";

function toISODate(d) {
  return new Date(d).toISOString().slice(0, 10);
}

export default async function handler(req, res) {
  // CORS (se precisar chamar do vite)
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "GET") return res.status(405).json({ error: "METHOD_NOT_ALLOWED" });

  try {
    const {
      calendarId = "pt.brazil#holiday@group.v.calendar.google.com",
      days = "180",
      boost = "0.2",
    } = req.query || {};

    const key = process.env.GOOGLE_API_KEY;
    if (!key) {
      return res.status(500).json({
        error: "MISSING_KEY",
        message: "Defina GOOGLE_API_KEY no .env do servidor.",
      });
    }

    const now = new Date();
    const timeMin = now.toISOString();
    const timeMax = new Date(now.getTime() + Number(days) * 86400000).toISOString();

    const url =
      "https://www.googleapis.com/calendar/v3/calendars/" +
      encodeURIComponent(calendarId) +
      "/events" +
      `?singleEvents=true&orderBy=startTime&timeMin=${encodeURIComponent(timeMin)}` +
      `&timeMax=${encodeURIComponent(timeMax)}&maxResults=2500&key=${encodeURIComponent(key)}`;

    const r = await fetch(url);
    const raw = await r.text();

    if (!r.ok) {
      // Passa o erro da Google para debug
      return res.status(502).json({ error: "GOOGLE_ERROR", message: raw });
    }

    const json = JSON.parse(raw);
    const items = Array.isArray(json.items) ? json.items : [];

    // Normaliza somente all-day (date); ignora eventos com horário (dateTime)
    const out = items
      .map((ev) => {
        const start = ev.start?.date || ev.start?.dateTime;
        if (!start) return null;
        const date = toISODate(start);
        const reason = String(ev.summary || ev.description || "").trim();
        return { date, reason, boost: Number(boost) };
      })
      .filter(Boolean);

    res.status(200).json({ items: out });
  } catch (e) {
    console.error("[holidays] fatal:", e);
    res.status(500).json({ error: "SERVER_ERROR", message: String(e?.message || e) });
  }
}
