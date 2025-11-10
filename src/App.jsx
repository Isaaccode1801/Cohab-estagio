import React, { useMemo, useState } from "react";
import LeadForm from "./components/LeadForm.jsx";

// ------------------------------------------------------------
// Helpers / Domain logic
// ------------------------------------------------------------
const clamp = (v, min, max) => Math.max(min, Math.min(max, v));

function weekdayFactor(date) {
  const d = new Date(date).getDay(); // 0=Sun..6=Sat
  if (d === 5 || d === 6) return 1.12; // Fri/Sat
  if (d === 0) return 1.05;            // Sun
  return 1.0;                          // Mon-Thu
}

function seasonalFactor(date) {
  const m = new Date(date).getMonth(); // 0..11
  const summer = [11, 0, 1]; // Dec/Jan/Feb
  const winter = [5, 6];     // Jun/Jul
  if (summer.includes(m)) return 1.18;
  if (winter.includes(m)) return 0.95;
  return 1.0;
}

function leadTimeFactor(leadDays) {
  if (leadDays <= 3) return 0.92;
  if (leadDays <= 7) return 0.97;
  if (leadDays >= 45) return 1.06;
  return 1.0;
}

// Event factor default (mantém compatibilidade caso você use events locais)
function eventFactorForDate(dateStr, city, events = []) {
  const d = new Date(dateStr).toISOString().slice(0, 10);
  const e = events.find(
    (ev) => ev.city === city && d >= ev.start && d <= ev.end
  );
  return e ? 1 + (e.factor || 0) : 1.0;
}

function dynamicPriceForDate({ base, date, city, min = 120, max = 1800, events }) {
  const today = new Date();
  const dt = new Date(date);
  const leadDays = Math.max(0, Math.round((dt - today) / 86400000));
  const price =
    base *
    weekdayFactor(dt) *
    seasonalFactor(dt) *
    leadTimeFactor(leadDays) *
    eventFactorForDate(date, city, events);
  return Math.round(clamp(price, min, max));
}

// ------------------------------------------------------------
// Extras: ocupação e receita potencial (30 dias)
// ------------------------------------------------------------
function occupancy30(listing) {
  const days = listing.calendar30 || [];
  const total = days.length || 30;
  const booked = days.filter((d) => d.status === "ocupado").length;
  return total ? booked / total : 0;
}

function revenuePotential30(listing, events) {
  const days = listing.calendar30 || [];
  const base = listing.basePrice;
  let sum = 0;
  days.forEach((d) => {
    const price = dynamicPriceForDate({
      base,
      date: d.date,
      city: listing.city,
      events,
      min: listing.minPrice || 120,
      max: listing.maxPrice || 1800,
    });
    const occupied = d.status === "ocupado" ? 1 : 0;
    sum += occupied * price;
  });
  return Math.round(sum);
}

// ------------------------------------------------------------
// Data (mocks) + loader
// ------------------------------------------------------------
import { useEffect } from "react";

const FALLBACK_EVENTS = [
  { city: "Salvador", title: "Festival de Verão", start: "2025-11-20", end: "2025-11-23", factor: 0.25 },
  { city: "Aracaju",  title: "Corrida de Rua",   start: "2025-11-16", end: "2025-11-16", factor: 0.10 },
];

function makeCalendar30(startDate = new Date()) {
  const out = [];
  for (let i = 0; i < 30; i++) {
    const d = new Date(startDate.getTime() + i * 86400000);
    const iso = d.toISOString().slice(0, 10);
    const status = (i % 5 === 0 || i % 7 === 0) ? "ocupado" : "livre";
    out.push({ date: iso, status });
  }
  return out;
}

const FALLBACK_LISTINGS = [
  { id: "SSA-1203", title: "Studio Vista Mar em Ondina", photo: "https://images.unsplash.com/photo-1505693416388-ac5ce068fe85?q=80&w=1200&auto=format&fit=crop", city: "Salvador", neighborhood: "Ondina", type: "Studio", agency: "ImobX", basePrice: 240, minPrice: 150, maxPrice: 900, calendar30: makeCalendar30() },
  { id: "SSA-4310", title: "2Q Pé na Areia — Barra", photo: "https://images.unsplash.com/photo-1507089947368-19c1da9775ae?q=80&w=1200&auto=format&fit=crop", city: "Salvador", neighborhood: "Barra",  type: "Apartamento", agency: "ImobY", basePrice: 380, minPrice: 220, maxPrice: 1200, calendar30: makeCalendar30() },
  { id: "AJU-2211", title: "Casa 3Q Próx. Orla de Atalaia", photo: "https://images.unsplash.com/photo-1576941089067-2de3c901e126?q=80&w=1200&auto=format&fit=crop", city: "Aracaju",  neighborhood: "Atalaia", type: "Casa", agency: "ImobX", basePrice: 500, minPrice: 260, maxPrice: 1800, calendar30: makeCalendar30() },
];

function useData() {
  const [listings, setListings] = React.useState([]);
  const [events, setEvents] = React.useState([]);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    async function load() {
      try {
        const mode = import.meta.env.VITE_DATA_MODE || "local";
        if (mode === "api") {
          const city = import.meta.env.VITE_CITY || "rio";
          const res = await fetch(`/api/listings?city=${encodeURIComponent(city)}&limit=30`);
          if (!res.ok) throw new Error(`API ${res.status}`);
          const data = await res.json();
          setListings(Array.isArray(data) ? data : []);
          setEvents([]); // se fizer /api/events, carregue aqui
        } else {
          const base = import.meta.env.BASE_URL || "/";
          const [lRes, eRes] = await Promise.all([
            fetch(`${base}data/listings.json`),
            fetch(`${base}data/events.json`)
          ]);
          setListings(lRes.ok ? await lRes.json() : FALLBACK_LISTINGS);
          setEvents(eRes.ok ? await eRes.json() : FALLBACK_EVENTS);
        }
      } catch (e) {
        console.error("load error", e);
        setListings(FALLBACK_LISTINGS);
        setEvents(FALLBACK_EVENTS);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const neighborhoods = React.useMemo(() => Array.from(new Set(listings.map(l => l.neighborhood))), [listings]);
  const types        = React.useMemo(() => Array.from(new Set(listings.map(l => l.type))), [listings]);
  const agencies     = React.useMemo(() => Array.from(new Set(listings.map(l => l.agency))), [listings]);
  const cities       = React.useMemo(() => Array.from(new Set(listings.map(l => l.city))), [listings]);

  return { listings, events, loading, neighborhoods, types, agencies, cities };
}

// ------------------------------------------------------------
// UI building blocks
// ------------------------------------------------------------
function Stat({ label, value }) {
  return (
    <div className="rounded-2xl border p-3 text-sm">
      <div className="text-gray-500">{label}</div>
      <div className="text-xl font-semibold">{value}</div>
    </div>
  );
}

function Card({ listing, range, events }) {
  const { start, end } = range || {};
  const nights = useMemo(() => {
    if (!start || !end) return 0;
    const s = new Date(start);
    const e = new Date(end);
    return Math.max(0, Math.round((e - s) / 86400000));
  }, [range]);

  const suggested = useMemo(() => {
    if (!nights) return 0;
    let sum = 0;
    for (let i = 0; i < nights; i++) {
      const d = new Date(new Date(start).getTime() + i * 86400000)
        .toISOString()
        .slice(0, 10);
      sum += dynamicPriceForDate({
        base: listing.basePrice,
        date: d,
        city: listing.city,
        events,
        min: listing.minPrice,
        max: listing.maxPrice,
      });
    }
    return sum;
  }, [listing, nights, start, events]);

  const occ = occupancy30(listing);
  const adr = Math.round(
    suggested && nights ? suggested / nights : listing.basePrice
  );
  const rev = revenuePotential30(listing, events);

  return (
    <div className="rounded-2xl border overflow-hidden shadow-sm bg-white">
      <img src={listing.photo} alt={listing.title} className="h-40 w-full object-cover" />
      <div className="p-4 space-y-2">
        <div className="text-xs text-gray-500">{listing.city} • {listing.neighborhood} • {listing.type}</div>
        <h3 className="text-lg font-semibold">{listing.title}</h3>
        <div className="flex gap-3">
          <Stat label="Ocupação 30d" value={(occ * 100).toFixed(0) + "%"} />
          <Stat label="ADR sugerido" value={"R$ " + adr} />
          <Stat label="Receita 30d" value={"R$ " + rev} />
        </div>
        {nights > 0 && (
          <div className="text-sm text-gray-700">
            {nights} noites • Total sugerido no período: <b>R$ {suggested}</b>
          </div>
        )}
        <div className="text-xs text-gray-500">Operadora: {listing.agency}</div>
      </div>
    </div>
  );
}

function DateInput({ label, value, onChange }) {
  return (
    <label className="text-sm text-gray-700 flex items-center gap-2">
      <span className="min-w-20">{label}</span>
      <input
        type="date"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="border rounded-lg px-3 py-2"
      />
    </label>
  );
}

// ------------------------------------------------------------
// Screens
// ------------------------------------------------------------
function ExploreScreen() {
  const { listings, events, loading, neighborhoods, types, agencies, cities } = useData();
  const [city, setCity] = useState("");
  const [neighborhood, setNeighborhood] = useState("");
  const [type, setType] = useState("");
  const [agency, setAgency] = useState("");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");

  const filtered = useMemo(() => {
    return listings.filter((l) =>
      (!city || l.city === city) &&
      (!neighborhood || l.neighborhood === neighborhood) &&
      (!type || l.type === type) &&
      (!agency || l.agency === agency)
    );
  }, [listings, city, neighborhood, type, agency]);

  if (loading) return <div>Carregando dados…</div>;

  return (
    <div className="space-y-4">
      <div className="grid md:grid-cols-4 gap-3">
        <select className="border rounded-lg px-3 py-2" value={city} onChange={(e)=>setCity(e.target.value)}>
          <option value="">Cidade (todas)</option>
          {cities.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <select className="border rounded-lg px-3 py-2" value={neighborhood} onChange={(e)=>setNeighborhood(e.target.value)}>
          <option value="">Bairro (todos)</option>
          {neighborhoods.map((n) => <option key={n} value={n}>{n}</option>)}
        </select>
        <select className="border rounded-lg px-3 py-2" value={type} onChange={(e)=>setType(e.target.value)}>
          <option value="">Tipo (todos)</option>
          {types.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
        <select className="border rounded-lg px-3 py-2" value={agency} onChange={(e)=>setAgency(e.target.value)}>
          <option value="">Operadora (todas)</option>
          {agencies.map((a) => <option key={a} value={a}>{a}</option>)}
        </select>
        <div className="flex gap-2">
          <DateInput label="De" value={start} onChange={setStart} />
          <DateInput label="Até" value={end} onChange={setEnd} />
        </div>
      </div>

      <div className="grid md:grid-cols-3 gap-4">
        {filtered.map((l) => (
          <Card key={l.id} listing={l} range={{ start, end }} events={events} />
        ))}
      </div>
    </div>
  );
}

function OwnerScreen() {
  const { listings, events, loading } = useData();

  // 🔹 carrega feriados do backend
// 🔹 carrega feriados do backend
const [holidays, setHolidays] = React.useState([]); // [{date, reason, boost}]

React.useEffect(() => {
  (async () => {
    try {
      const calId = "pt-br.brazilian#holiday@group.v.calendar.google.com";
      const r = await fetch(
        `/api/holidays?days=180&boost=0.2&calendarId=${encodeURIComponent(calId)}`
      );
      const data = await r.json().catch(() => ({}));
      if (!r.ok) {
        console.error("[holidays] backend error:", r.status, data);
        setHolidays([]);
        return;
      }
      console.log("[holidays] carregados:", (data?.items || []).length, data);
      setHolidays(Array.isArray(data?.items) ? data.items : []);
    } catch (e) {
      console.error("[holidays] falha de rede:", e);
      setHolidays([]);
    }
  })();
}, []);


  // acesso O(1) por data
  const holidayByDate = React.useMemo(() => {
    const m = new Map();
    for (const h of holidays) m.set(h.date, h);
    return m;
  }, [holidays]);

  // estados principais
  const [selectedId, setSelectedId] = React.useState(null);
  const [base, setBase] = React.useState(0);

  React.useEffect(() => {
    if (!loading && listings.length > 0 && !selectedId) {
      setSelectedId(listings[0].id);
    }
  }, [loading, listings, selectedId]);

  const selected = React.useMemo(
    () => listings.find(l => l.id === selectedId) || null,
    [listings, selectedId]
  );

  React.useEffect(() => {
    if (selected) setBase(selected.basePrice || 200);
  }, [selected]);

  const days = React.useMemo(
    () => (selected && Array.isArray(selected.calendar30) ? selected.calendar30 : []),
    [selected]
  );

  const rows = React.useMemo(() => {
    if (!selected) return [];

    const refPriceFor = (date) =>
      dynamicPriceForDate({
        base: selected.basePrice,
        date,
        city: selected.city,
        events,
        min: selected.minPrice,
        max: selected.maxPrice,
      });

    return days.map((d) => {
      const holiday = holidayByDate.get(d.date);          // {date, reason, boost}
      const extraFactor = holiday ? (1 + (holiday.boost ?? 0.2)) : 1.0;

      const priceBase = dynamicPriceForDate({
        base: base || selected.basePrice,
        date: d.date,
        city: selected.city,
        events,
        min: selected.minPrice,
        max: selected.maxPrice,
      });

      const price = Math.round(priceBase * extraFactor);

      // probabilidade simples
      const p0 = d.status === "ocupado" ? 0.85 : 0.35;
      const pRef = (refPriceFor(d.date) || price || 1);
      const elasticity = 1.2;
      const priceFactor = Math.pow(pRef / Math.max(price, 1), elasticity);
      const prob = Math.max(0.05, Math.min(0.98, p0 * priceFactor));

      return { ...d, price, prob, reason: holiday?.reason || "", boost: holiday?.boost ?? 0 };
    });
  }, [days, base, selected, events, holidayByDate]);

  const occ = React.useMemo(() => {
    if (!rows.length) return 0;
    const avg = rows.reduce((acc, r) => acc + r.prob, 0) / rows.length;
    return avg;
  }, [rows]);

  const potential = React.useMemo(() => {
    return rows.reduce((acc, r) => acc + r.price * r.prob, 0);
  }, [rows]);

  if (loading) return <div>Carregando dados…</div>;
  if (!listings.length) return <div>Nenhuma unidade encontrada. Verifique public/data/listings.json.</div>;
  if (!selected) return <div>Selecionando unidade…</div>;

  return (
    <div className="space-y-4">
      <div className="grid md:grid-cols-3 gap-3">
        <label className="text-sm text-gray-700">
          Unidade
          <select
            className="border rounded-lg w-full px-3 py-2"
            value={selectedId || ""}
            onChange={(e) => setSelectedId(e.target.value)}
          >
            {listings.map((l) => (
              <option key={l.id} value={l.id}>
                {l.id} — {l.title}
              </option>
            ))}
          </select>
        </label>

        <label className="text-sm text-gray-700">
          Preço Base (R$)
          <input
            type="number"
            className="border rounded-lg w-full px-3 py-2"
            value={base}
            onChange={(e) => setBase(parseInt(e.target.value || 0))}
          />
        </label>

        <div className="grid grid-cols-2 gap-3">
          <Stat label="Ocupação 30d" value={(occ * 100).toFixed(0) + "%"} />
          <Stat label="Receita Potencial 30d" value={"R$ " + potential.toFixed(0)} />
        </div>
      </div>

      <div className="overflow-x-auto rounded-2xl border">
        <table className="w-full text-sm">
<thead className="bg-gray-50">
  <tr>
    <th className="p-2 text-left">Data</th>
    <th className="p-2 text-left">Status</th>
    <th className="p-2 text-left">Preço recomendado</th>
    <th className="p-2 text-left">% Ocupação (sim.)</th>
    <th className="p-2 text-left">Motivo</th>
  </tr>
</thead>

<tbody>
  {rows.map((r) => (
    <tr key={r.date} className="border-t">
      <td className="p-2">
        {r.date}
        {r.reason && (
          <span className="ml-2 inline-block text-xs px-2 py-0.5 rounded bg-yellow-100 text-yellow-800 border border-yellow-200">
            {r.reason} · +{Math.round((r.boost || 0.2) * 100)}%
          </span>
        )}
      </td>
      <td className="p-2 capitalize">{r.status}</td>
      <td className="p-2">R$ {r.price}</td>
      <td className="p-2">{(r.prob * 100).toFixed(0)}%</td>
      <td className="p-2">{r.reason || "-"}</td>
    </tr>
  ))}
</tbody>

        </table>
      </div>

      <div className="text-xs text-gray-500">
        Fórmula: price = base × weekday × season × lead × event × (feriado? +boost : 1) (clamp min/max).
      </div>
    </div>
  );
}

// ------------------------------------------------------------
// App shell
// ------------------------------------------------------------
export default function App() {
  const [page, setPage] = React.useState("explore"); // "explore" | "owner" | "lead"

  React.useEffect(() => {
    const hash = (window.location.hash || "").replace("#", "");
    if (["explore","owner","lead"].includes(hash)) setPage(hash);
  }, []);
  React.useEffect(() => {
    window.location.hash = page;
  }, [page]);

  return (
    <div className="min-h-screen bg-gray-100">
      <header className="sticky top-0 z-10 bg-white/70 backdrop-blur border-b">
        <div className="max-w-6xl mx-auto p-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <img
              src="/cohab-logo.png"
              alt="Cohab Premium"
              className="h-8 w-9 rounded-xl object-contain bg-white"
            />
            <div className="font-bold">Cohab — Temporada</div>
          </div>

          <nav className="flex items-center gap-2">
            <button
              onClick={() => setPage("explore")}
              className={`px-3 py-2 rounded-lg hover:bg-gray-100 ${page==="explore" ? "text-blue-700 font-semibold" : "text-gray-700"}`}
            >
              Explorar
            </button>
            <button
              onClick={() => setPage("owner")}
              className={`px-3 py-2 rounded-lg hover:bg-gray-100 ${page==="owner" ? "text-blue-700 font-semibold" : "text-gray-700"}`}
            >
              Área do Proprietário
            </button>
            <button
              onClick={() => setPage("lead")}
              className={`px-3 py-2 rounded-lg border hover:bg-gray-50 ${page==="lead" ? "border-blue-300" : ""}`}
            >
              Quero anunciar
            </button>
          </nav>
        </div>
      </header>

      <main className="max-w-6xl mx-auto p-4">
        {page === "explore" && <ExploreScreen />}
        {page === "owner"   && <OwnerScreen /> }
        {page === "lead"    && <LeadForm /> }
      </main>

      <footer className="max-w-6xl mx-auto p-4 text-xs text-gray-500">
        Multi-imobiliária: filtre por Operadora em Explorar; cada card exibe a agência responsável.
      </footer>
    </div>
  );
}
