// api/leads.js
import { createClient } from "@supabase/supabase-js";

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();

  if (req.method !== "POST") {
    return res.status(405).json({ error: "METHOD_NOT_ALLOWED" });
  }

  try {
    const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
      return res.status(500).json({
        error: "CONFIG_ERROR",
        message: "Faltam variáveis SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY",
      });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    const body = req.body && typeof req.body === "string"
      ? JSON.parse(req.body)
      : req.body;

    const { name, email, phone, city, propertyTitle } = body || {};

    // validação mínima
    if (!name || (!email && !phone)) {
      return res.status(400).json({
        error: "INVALID_INPUT",
        message: "Informe nome e ao menos e-mail ou telefone.",
      });
    }

    const { data, error } = await supabase
      .from("leads")
      .insert([{ name, email, phone, city, propertyTitle }])
      .select();

    if (error) throw error;

    return res.status(200).json({
      success: true,
      lead: data?.[0],
    });
  } catch (e) {
    console.error("[api/leads] error:", e);
    return res.status(500).json({
      error: "SERVER_ERROR",
      message: e.message,
    });
  }
}
