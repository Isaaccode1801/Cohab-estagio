// api/listings.js  (ESM)
import Papa from "papaparse";
import { gunzipSync } from "zlib";

// 1) Use uma fonte que você sabe que baixa via HTTPS (teste com amsterdam)
//    Depois troque por RIO/SALVADOR quando você tiver um link HTTPS que funcione.
const CITY_SOURCES = {
  amsterdam:
    "https://data.insideairbnb.com/the-netherlands/north-holland/amsterdam/2023-06-05/visualisations/listings.csv",

  // Ex.: se a sua cidade só tiver gzip:
  // rio: "https://data.insideairbnb.com/brazil/rj/rio-de-janeiro/2020-04-20/visualisations/listings.csv.gz",
};

function pick(row, keys, fallback = "") {
  for (const k of keys) {
    if (row[k] !== undefined && row[k] !== null && String(row[k]).trim() !== "") return row[k];
  }
  return fallback;
}
function parsePrice(str) {
  if (str == null) return 0;
  const cleaned = String(str).replace(/[^0-9.,-]/g, "").replace(/,/g, "");
  const n = parseFloat(cleaned);
  return Number.isFinite(n) ? Math.round(n) : 0;
}
function calendarFromAvailability(availability30) {
  const days = 30;
  const avail = Math.max(0, Math.min(days, parseInt(availability30 || 0, 10)));
  const today = new Date();
  const arr = [];
  for (let i = 0; i < days; i++) {
    const date = new Date(today.getTime() + i * 86400000).toISOString().slice(0, 10);
    arr.push({ date, status: i < avail ? "livre" : "ocupado" });
  }
  return arr;
}

export default async function handler(req, res) {
  // CORS
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();

  try {
    const { city = "amsterdam", limit = "24" } = req.query || {};
    const src = CITY_SOURCES[String(city).toLowerCase()];
    if (!src) {
      return res.status(400).json({
        error: "CITY_NOT_CONFIGURED",
        message: `Defina CITY_SOURCES['${city.toLowerCase()}'] com a URL HTTPS de visualisations/listings.csv (ou .csv.gz).`,
      });
    }

    // 2) Cabeçalhos de “navegador” para evitar 403
    const r = await fetch(src, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119 Safari/537.36",
        Accept: "text/csv,application/octet-stream,*/*",
        "Accept-Encoding": "gzip, deflate, br",
      },
    });

    if (!r.ok) {
      console.error("UPSTREAM_ERROR", r.status, src);
      return res.status(502).json({ error: "UPSTREAM_ERROR", status: r.status, src });
    }

    // 3) Suporte a gzip (quando a cidade só publica .csv.gz)
    const ct = r.headers.get("content-type") || "";
    const isGzip = src.endsWith(".gz") || /gzip/i.test(r.headers.get("content-encoding") || "");
    let csvText;
    if (isGzip) {
      const buf = Buffer.from(await r.arrayBuffer());
      csvText = gunzipSync(buf).toString("utf-8");
    } else {
      csvText = await r.text();
    }

    const parsed = Papa.parse(csvText, { header: true, dynamicTyping: false, skipEmptyLines: true });
    const rows = (parsed.data || []).slice(0, parseInt(limit, 10));

    const mapped = rows.map((row) => {
      const id = pick(row, ["id", "listing_id", "Listing ID", "ID"]);
      const title = pick(row, ["name", "Listing Name"], id ? `Listing ${id}` : "Listing");
      const photo = pick(row, ["picture_url", "Picture URL", "picture_url_https", "Thumbnail URL"], "");
      const cityField = pick(row, ["city", "City"], city);
      const neighborhood = pick(row, ["neighbourhood_cleansed", "neighbourhood", "Neighbourhood"], "");
      const type = pick(row, ["room_type", "Room Type"], "Apartment");
      const price = parsePrice(pick(row, ["price", "Price"], 0));
      const availability30 = pick(row, ["availability_30", "Availability 30"], 0);
      const agency = (Number(id) || 0) % 2 === 0 ? "ImobX" : "ImobY";

      return {
        id: String(id || ""),
        title,
        photo,
        city: cityField || city,
        neighborhood,
        type,
        agency,
        basePrice: price || 250,
        minPrice: Math.max(120, Math.round((price || 250) * 0.6)),
        maxPrice: Math.max(600, Math.round((price || 250) * 3)),
        calendar30: calendarFromAvailability(availability30),
      };
    });

    return res.status(200).json(mapped);
  } catch (err) {
    console.error("SERVER_ERROR:", err?.stack || err);
    return res.status(500).json({ error: "SERVER_ERROR", message: String(err?.message || err) });
  }
}
