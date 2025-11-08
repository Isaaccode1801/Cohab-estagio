import React from "react";

function Input({ label, ...props }) {
  return (
    <label className="text-sm text-gray-700 block">
      {label}
      <input
        {...props}
        className="mt-1 border rounded-lg w-full px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
      />
    </label>
  );
}

export default function LeadForm() {
  const [form, setForm] = React.useState({
    name: "",
    email: "",
    phone: "",
    city: "Aracaju",
    propertyTitle: "",
  });
  const [status, setStatus] = React.useState(null); // null | "CREATED" | "DUPLICATE" | "ERROR"
  const [message, setMessage] = React.useState("");
  const [loading, setLoading] = React.useState(false);

  function onChange(e) {
    const { name, value } = e.target;
    setForm((f) => ({ ...f, [name]: value }));
  }

function cleanPhone(s) {
  return String(s || "").replace(/\D+/g, "");
}

async function onSubmit(e) {
  e.preventDefault();
  setLoading(true);
  setStatus(null);
  setMessage("");

const name = (form.name || "").trim();
const email = (form.email || "").trim().toLowerCase();
const phoneDigits = String(form.phone || "").replace(/\D+/g, ""); // só dígitos

if (!name) {
  setLoading(false);
  setStatus("ERROR");
  setMessage("Informe seu nome.");
  return;
}
if (!email && phoneDigits.length < 8) { // aceita 8–11 dígitos
  setLoading(false);
  setStatus("ERROR");
  setMessage("Informe e-mail ou telefone (com DDD).");
  return;
}

const payload = {
  name,
  email,                      // pode ser vazio, se tiver telefone
  phone: phoneDigits,         // só dígitos
  city: form.city || "Aracaju",
  propertyTitle: form.propertyTitle || ""
};


try {
  console.log("[LeadForm] payload =>", payload);

  const r = await fetch("/api/leads", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  const data = await r.json().catch(() => ({}));
  console.log("[LeadForm] response =>", r.status, data);

  if (!r.ok) {
    throw new Error(data?.message || `Falha (${r.status})`);
  }

  setStatus(data.status);
  setMessage(
    data.status === "CREATED"
      ? "Lead recebido com sucesso! Em breve nossa equipe entrará em contato."
      : "Você já está em nossa base! Atualizamos seu último contato."
  );

  const prev = JSON.parse(localStorage.getItem("leads") || "[]");
  localStorage.setItem("leads", JSON.stringify([data.lead, ...prev].slice(0, 50)));
} catch (err) {
  setStatus("ERROR");
  setMessage(err.message);
} finally {
  setLoading(false);
}

}


  return (
    <div className="max-w-xl mx-auto bg-white rounded-2xl p-6 shadow-sm border">
      <h2 className="text-xl font-semibold text-gray-800">Quero anunciar meu imóvel</h2>
      <p className="text-sm text-gray-500 mt-1">
        Preencha seus dados e retornaremos com os próximos passos.
      </p>

      <form onSubmit={onSubmit} className="space-y-3 mt-4">
        <Input label="Nome*" name="name" value={form.name} onChange={onChange} required />

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <Input label="E-mail" name="email" type="email" value={form.email} onChange={onChange} />
          <Input label="Telefone/WhatsApp" name="phone" value={form.phone} onChange={onChange} />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <Input label="Cidade" name="city" value={form.city} onChange={onChange} />
          <Input label="Título do imóvel (opcional)" name="propertyTitle" value={form.propertyTitle} onChange={onChange} />
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full mt-2 bg-blue-600 text-white rounded-lg py-2 hover:bg-blue-700 disabled:opacity-60"
        >
          {loading ? "Enviando..." : "Enviar"}
        </button>
      </form>

      {status && (
        <div
          className={
            "mt-4 text-sm p-3 rounded-lg " +
            (status === "CREATED"
              ? "bg-green-50 text-green-700 border border-green-200"
              : status === "DUPLICATE"
              ? "bg-yellow-50 text-yellow-700 border border-yellow-200"
              : "bg-red-50 text-red-700 border border-red-200")
          }
        >
          {message}
        </div>
      )}

      <div className="text-xs text-gray-400 mt-4">
        Ao enviar, você concorda com nossa política de privacidade. Não compartilhamos seus dados com terceiros sem autorização.
      </div>
    </div>
  );
}
