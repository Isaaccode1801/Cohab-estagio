// api/holidays.js
export default async function handler(req, res) {
  // CORS básico (seguro deixar)
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "GET") {
    return res.status(405).json({ error: "METHOD_NOT_ALLOWED" });
  }

  try {
    const {
      calendarId = "pt-br.brazilian#holiday@group.v.calendar.google.com",
      days = "365",
      boost = "0.2",
    } = req.query || {};

    const key = process.env.GOOGLE_API_KEY;
    if (!key) {
      return res.status(500).json({
        error: "CONFIG",
        message: "Defina GOOGLE_API_KEY nas Environment Variables do Vercel.",
      });
    }

    const now = new Date();
    const timeMin = now.toISOString();
    const timeMax = new Date(now.getTime() + Number(days) * 86400000).toISOString();

    // Monta URL base
    const base = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(
      calendarId
    )}/events`;
    const makeUrl = (pageToken) => {
      const u = new URL(base);
      u.searchParams.set("singleEvents", "true");
      u.searchParams.set("orderBy", "startTime");
      u.searchParams.set("timeMin", timeMin);
      u.searchParams.set("timeMax", timeMax);
      u.searchParams.set("maxResults", "2500");
      u.searchParams.set("key", key);
      if (pageToken) u.searchParams.set("pageToken", pageToken);
      return u.toString();
    };

    let items = [];
    let pageToken = undefined;

    // Paginação da API do Google
    do {
      const url = makeUrl(pageToken);
      const resp = await fetch(url);
      const data = await resp.json();

      if (!resp.ok) {
        return res.status(resp.status).json({
          error: "GOOGLE_ERROR",
          status: resp.status,
          message: data,
        });
      }

      for (const ev of data.items || []) {
        const date =
          ev.start?.date ||
          (ev.start?.dateTime ? ev.start.dateTime.slice(0, 10) : null);
        if (!date) continue;

        items.push({
          date,                          // "YYYY-MM-DD"
          reason: ev.summary || "Feriado",
          boost: Number(boost),          // ex.: 0.2 = +20%
        });
      }

      pageToken = data.nextPageToken;
    } while (pageToken);

    return res.status(200).json({ items });
  } catch (e) {
    console.error("[holidays] fatal:", e);
    return res.status(500).json({ error: "SERVER_ERROR", message: e.message });
  }
}
