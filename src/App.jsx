import React, { useMemo, useState } from "react";
import LeadForm from "./components/LeadForm.jsx";


// --- Quick, single-file React prototype ---
// How to use locally (fast):
// 1) npm create vite@latest temporada-lite -- --template react
// 2) cd temporada-lite && npm install && npm i date-fns
// 3) Replace src/App.jsx with this file's content
// 4) npm run dev
//
// Notes:
// - Pure Tailwind utility classes are used for styling; if you don't want Tailwind,
//   it still looks fine with default styles. (Optional: add Tailwind later.)
// - Mock data is included (listings + simple event calendar) so there's no backend.
// - Two main flows per the challenge: "Explorar" (guest-like search) and
//   "Painel do Proprietário" (owner-first pricing + 30d revenue potential).
// - Multi-agency support via "operadora" filter in both screens.

// ------------------------------------------------------------
// Helpers / Domain logic (transparent, owner-first)
// ------------------------------------------------------------
const clamp = (v, min, max) => Math.max(min, Math.min(max, v));

// very small weekday factor (Fri/Sat slightly higher)
function weekdayFactor(date) {
  const d = new Date(date).getDay(); // 0=Sun..6=Sat
  if (d === 5 || d === 6) return 1.12; // Fri/Sat
  if (d === 0) return 1.05; // Sun
  return 1.0; // Mon-Thu
}

// simple seasonal factor by month (Brazilian summer bump)
function seasonalFactor(date) {
  const m = new Date(date).getMonth(); // 0=Jan..11=Dec
  const summer = [11, 0, 1]; // Dec/Jan/Feb
  const winter = [5, 6]; // Jun/Jul (mild drop)
  if (summer.includes(m)) return 1.18;
  if (winter.includes(m)) return 0.95;
  return 1.0;
}

// lead time factor: closer = small markdown, far = light bump
function leadTimeFactor(leadDays) {
  if (leadDays <= 3) return 0.92;
  if (leadDays <= 7) return 0.97;
  if (leadDays >= 45) return 1.06;
  return 1.0;
}

// Event factor from curated events (per city). For MVP: word‑match on title.
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

// Occupancy estimation (transparent heuristic)
// From a fake 30d availability calendar: count unavailable/occupied as booked.
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
    // Assume we only earn revenue if the day is (or will be) occupied.
    const occupied = d.status === "ocupado" ? 1 : 0; // MVP simplification
    sum += occupied * price;
  });
  return Math.round(sum);
}

// ------------------------------------------------------------
// Data source (JSON in /public/data) — with graceful fallback to mocks
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

// Load from /public/data/*.json so you can swap city/region without code changes
// Expected files:
// public/data/listings.json  -> array of listings (same shape as FALLBACK_LISTINGS)
// public/data/events.json    -> array of events (same shape as FALLBACK_EVENTS)

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
          setListings(lRes.ok ? await lRes.json() : []);
          setEvents(eRes.ok ? await eRes.json() : []);
        }
      } catch (e) {
        console.error("load error", e);
        setListings([]);
        setEvents([]);
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

  // 1) estados SEMPRE declarados no topo (ordem fixa)
  const [selectedId, setSelectedId] = React.useState(null);
  const [base, setBase] = React.useState(0);

  // 2) inicializa seleção quando dados chegarem (não cria hooks novos)
  React.useEffect(() => {
    if (!loading && listings.length > 0 && !selectedId) {
      setSelectedId(listings[0].id);
    }
  }, [loading, listings, selectedId]);

  // 3) item selecionado e sincronismo do preço base
  const selected = React.useMemo(
    () => listings.find(l => l.id === selectedId) || null,
    [listings, selectedId]
  );

  React.useEffect(() => {
    if (selected) setBase(selected.basePrice || 200);
  }, [selected]);

  // 4) dias e linhas calculadas (sempre com fallback)
  const days = React.useMemo(
    () => (selected && Array.isArray(selected.calendar30) ? selected.calendar30 : []),
    [selected]
  );

const rows = React.useMemo(() => {
  if (!selected) return [];
  // preço com base ORIGINAL (referência) – para medir elasticidade
  const refPriceFor = (date) =>
    dynamicPriceForDate({
      base: selected.basePrice, // base original do imóvel
      date,
      city: selected.city,
      events,
      min: selected.minPrice,
      max: selected.maxPrice,
    });

  return days.map((d) => {
    const price = dynamicPriceForDate({
      base: base || selected.basePrice, // base ajustável pelo proprietário
      date: d.date,
      city: selected.city,
      events,
      min: selected.minPrice,
      max: selected.maxPrice,
    });

    // --- Modelo simples de probabilidade (elasticidade-preço) ---
    // 1) probabilidade "base" do dia, inferida do status do calendário original
    //    (ocupado = 0.85, livre = 0.35) – números razoáveis para demo
    const p0 = d.status === "ocupado" ? 0.85 : 0.35;

    // 2) ajuste por diferença de preço vs. referência (quanto ↑ preço, ↓ prob)
    const pRef = refPriceFor(d.date) || price || 1;
    const elasticity = 1.2; // sensibilidade (ajuste se quiser)
    // Ex.: se preço atual > preço ref, fator < 1; se menor, fator > 1
    const priceFactor = Math.pow(pRef / Math.max(price, 1), elasticity);

    // 3) clamp em [0.05, 0.98] para evitar 0/1 gélidos
    const prob = Math.max(0.05, Math.min(0.98, p0 * priceFactor));

    return { ...d, price, prob };
  });
}, [days, base, selected, events]);


const occ = React.useMemo(() => {
  if (!rows.length) return 0;
  const avg = rows.reduce((acc, r) => acc + r.prob, 0) / rows.length;
  return avg; // 0..1
}, [rows]);

const potential = React.useMemo(() => {
  return rows.reduce((acc, r) => acc + r.price * r.prob, 0);
}, [rows]);


  // 5) Renders de carregamento/sem dados — APÓS declarar todos os hooks acima
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
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.date} className="border-t">
            <td className="p-2">{r.date}</td>
            <td className="p-2 capitalize">{r.status}</td>
            <td className="p-2">R$ {r.price}</td>
            <td className="p-2">{(r.prob * 100).toFixed(0)}%</td>
          </tr>
        ))}
      </tbody>
        </table>
      </div>

      <div className="text-xs text-gray-500">
        Fórmula: price = base × weekday × season × lead × event (clamp min/max).
      </div>
    </div>
  );
}


// ------------------------------------------------------------
// App shell
// ------------------------------------------------------------
export default function App() {
  const [page, setPage] = React.useState("explore"); // "explore" | "owner" | "lead"

  // (opcional) abrir direto pela URL: #explore, #owner, #lead
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
            <div className="h-8 w-8 rounded-xl bg-blue-600" />
            <div className="font-bold">Cohab — Temporada Lite</div>
          </div>

          {/* Navegação por personas */}
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
