//Lincoln Alcantarino
// index.js — Lumii Provador (parser Base64 robusto + logs de diagnóstico)
import express from "express";
import cors from "cors";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { GoogleGenerativeAI } from "@google/generative-ai";

const app = express();
app.use(cors());
app.use(express.json({ limit: "50mb" }));

// --- health & debug ---
app.get("/", (_req, res) => {
  res.status(200).send("✅ Lumii Provador ativo!");
});

// === ROTA DE DIAGNÓSTICO ===
// Aceita GET/POST em /_echo para inspecionar payload e ambiente.
function summarizePart(label, val) {
  if (typeof val !== "string") return `${label}: (não é string)`;
  const head = val.slice(0, 40);
  const hasPrefix = /^data:image\/[a-z0-9.+-]+;base64,/i.test(val);
  const cleaned = val.replace(/^data:image\/[a-z0-9.+-]+;base64,/i, "");
  const bytes = Buffer.from(cleaned, "base64").length;
  return `${label}: head="${head.replace(/\n/g,"")}" | hasPrefix=${hasPrefix} | bytes(base64)=${bytes}`;
}

app.all("/_echo", express.json({ limit: "50mb" }), (req, res) => {
  const info = {
    method: req.method,
    hasBody: !!req.body,
    keys: req.body ? Object.keys(req.body) : [],
    env: {
      hasGeminiKey: !!process.env.GEMINI_API_KEY,
      node: process.version,
    },
    notes: []
  };

  try {
    const { fotoPessoa, fotoRoupa } = req.body || {};
    if (fotoPessoa) info.notes.push(summarizePart("fotoPessoa", fotoPessoa));
    if (fotoRoupa)  info.notes.push(summarizePart("fotoRoupa",  fotoRoupa));
  } catch (e) {
    info.notes.push("erro ao analisar body: " + (e?.message || e));
  }

  res.status(200).json(info);
});
												 
app.all("/_echo", (req, res) => {
  res.json({
    ok: true,
    method: req.method,
    path: req.path,
    headers: req.headers,
    bodyType: typeof req.body,
    bodyIsBuffer: Buffer.isBuffer(req.body),
    ts: new Date().toISOString(),
  });
});

// Paths
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const TEMP_DIR = path.join(__dirname, "assets/temp");
if (!fs.existsSync(TEMP_DIR)) fs.mkdirSync(TEMP_DIR, { recursive: true });

// Gemini
if (!process.env.GEMINI_API_KEY) {
  console.error("[BOOT] GEMINI_API_KEY ausente no ambiente.");
}
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
// Model com suporte a imagens
const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

// === Util: parser robusto de imagem ===
// Aceita: DataURL completo OU base64 puro (com/sem quebras)
// Retorna: { mimeType, data } onde `data` é base64 puro sem prefixo.
function parseImageInput(input, fallbackMime = "image/jpeg") {
  if (typeof input !== "string" || !input.trim()) {
    return { mimeType: null, data: null, rawHead: "" };
  }
  // Remover BOM/quebras invisíveis e espaços
  let s = input.replace(/\r?\n|\r/g, "").trim();

  // Guardar começo para log
  const rawHead = s.slice(0, 60);

  // DataURL?
  const m = s.match(/^data:(image\/[a-z0-9+.\-]+);base64,(.+)$/i);
  if (m) {
    const mime = m[1].toLowerCase();
    const pure = m[2].replace(/\s+/g, "");
    return { mimeType: mime, data: pure, rawHead };
  }

  // Às vezes vem "...base64,XXXX" colado sem "data:image"
  const idx = s.toLowerCase().lastIndexOf("base64,");
  if (idx !== -1) {
    const after = s.slice(idx + "base64,".length);
    return { mimeType: fallbackMime, data: after.replace(/\s+/g, ""), rawHead };
  }

  // Já é base64 puro
  return { mimeType: fallbackMime, data: s.replace(/\s+/g, ""), rawHead };
}

function validBase64(b64) {
  try {
    const buf = Buffer.from(b64, "base64");
    return buf.length > 0 && Number.isFinite(buf.length);
  } catch {
    return false;
  }
}

// Health
app.get("/", (_req, res) => {
  res.status(200).send("✅ Lumii Provador ativo!");
});

// DEBUG: ecoa o que o servidor receberia (sem chamar o Gemini)
app.post("/_echo", (req, res) => {
  const { fotoPessoa, fotoRoupa } = req.body || {};
  const p = parseImageInput(fotoPessoa);
  const r = parseImageInput(fotoRoupa);
  return res.json({
    ok: true,
    pessoa: {
      head: p.rawHead,
      mime: p.mimeType,
      bytes: p.data ? Buffer.from(p.data, "base64").length : 0,
      hasDataPrefix: (fotoPessoa || "").trim().startsWith("data:")
    },
    roupa: {
      head: r.rawHead,
      mime: r.mimeType,
      bytes: r.data ? Buffer.from(r.data, "base64").length : 0,
      hasDataPrefix: (fotoRoupa || "").trim().startsWith("data:")
    }
  });
});

// === HEALTH CHECK ===
app.get("/_echo", (req, res) => {
  res.json({ ok: true, message: "Lumii Provador ativo" });
});
	
// TRY-ON
app.post("/tryon", async (req, res) => {
  const t0 = Date.now();
  let outputPath = null;

  try {
    const { fotoPessoa, fotoRoupa } = req.body || {};
    if (!fotoPessoa || !fotoRoupa) {
      return res.status(400).json({ success: false, message: "Envie as duas imagens (pessoa e roupa)." });
    }

    // Parse + logs de diagnóstico
    const p = parseImageInput(fotoPessoa);
    const r = parseImageInput(fotoRoupa);

    console.log("[TRYON] pessoa IN  head:", p.rawHead);
    console.log("[TRYON] roupa  IN  head:", r.rawHead);

    if (!p.data || !r.data) {
      return res.status(400).json({ success: false, message: "Formato de imagem inválido (sem dados base64)." });
    }

    // Se ainda restou 'data:' após o parse, algo veio corrompido — aborta limpo
    if (p.data.startsWith("data:") || r.data.startsWith("data:")) {
      return res.status(400).json({
        success: false,
        message: "Imagem inválida: o servidor espera base64 puro (sem 'data:image/...;base64,')."
      });
    }

    const pessoaBytes = Buffer.from(p.data, "base64").length;
    const roupaBytes  = Buffer.from(r.data, "base64").length;
    console.log("[TRYON] pessoa bytes:", pessoaBytes, "mime:", p.mimeType);
    console.log("[TRYON] roupa  bytes:", roupaBytes,  "mime:", r.mimeType);

    if (!validBase64(p.data) || !validBase64(r.data)) {
      return res.status(400).json({ success: false, message: "Base64 inválido nas imagens enviadas." });
    }

    // Prompt enxuto e objetivo
    const prompt =
      "Apply the clothing from the second image onto the person in the first image. " +
      "Keep face, body, pose, lighting and background unchanged. " +
      "Preserve the garment’s exact color, texture and print. Return only the final realistic photo.";

    // Chamada ao Gemini — inlineData com base64 PURO e mimeType correto
    const result = await model.generateContent([
      { text: prompt },
      { inlineData: { mimeType: p.mimeType || "image/jpeg", data: p.data } },
      { inlineData: { mimeType: r.mimeType || "image/jpeg", data: r.data } }
    ]);

    const response = await result.response;

    // Extrair imagem retornada
    const imagePart = response?.candidates?.[0]?.content?.parts?.find(q => q?.inlineData?.data);
    if (!imagePart) {
      const textMsg = response?.candidates?.[0]?.content?.parts?.find(q => q.text)?.text;
      console.error("[TRYON][NO_IMAGE] Texto:", textMsg || "(vazio)");
      throw new Error("Não foi possível gerar a imagem (resposta sem imagem do modelo).");
    }

    const base64 = imagePart.inlineData.data;
    const filename = `provador_${Date.now()}.jpg`;
    outputPath = path.join(TEMP_DIR, filename);
    fs.writeFileSync(outputPath, Buffer.from(base64, "base64"));

    console.log(`✅ Imagem gerada: ${filename} em ${Date.now() - t0}ms`);
    return res.json({ success: true, image: `data:image/jpeg;base64,${base64}` });

  } catch (err) {
    console.error("❌ Erro no provador:", err?.message || err);
    if (outputPath && fs.existsSync(outputPath)) {
      try { fs.unlinkSync(outputPath); } catch {}
    }
    return res.status(500).json({ success: false, message: err?.message || "Erro interno." });
  }
});

// Start
const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log(`🚀 Lumii Provador rodando na porta ${PORT}`));