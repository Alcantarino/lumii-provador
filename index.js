// index.js — Lumii Provador Lincoln (fix dataURL, MIME e logs)
import express from "express";
import cors from "cors";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { GoogleGenerativeAI } from "@google/generative-ai";

const app = express();
app.use(cors());
app.use(express.json({ limit: "50mb" }));

// paths
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const TEMP_DIR = path.join(__dirname, "assets/temp");
if (!fs.existsSync(TEMP_DIR)) fs.mkdirSync(TEMP_DIR, { recursive: true });

// env
if (!process.env.GEMINI_API_KEY) {
  console.error("GEMINI_API_KEY ausente no ambiente.");
}
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

// helpers
function parseDataUrl(input) {
  if (typeof input !== "string" || !input.length) return { mime: null, data: null };
  const m = input.match(/^data:(image\/[a-z0-9+.-]+);base64,(.+)$/i);
  if (m) return { mime: m[1].toLowerCase(), data: m[2] };
  // sem prefixo -> assume jpeg por padrão
  return { mime: "image/jpeg", data: input };
}

function isValidBase64(b64) {
  try {
    const buf = Buffer.from(b64, "base64");
    return buf.length > 0;
  } catch {
    return false;
  }
}

// health
app.get("/", (_req, res) => {
  res.status(200).send("✅ Lumii provador ativo e rodando");
});

// try-on
app.post("/tryon", async (req, res) => {
  const t0 = Date.now();
  try {
    const { fotoPessoa, fotoRoupa } = req.body || {};
    if (!fotoPessoa || !fotoRoupa) {
      return res.status(400).json({ success: false, message: "Envie as duas imagens (pessoa e roupa)." });
    }

    const pPessoa = parseDataUrl(fotoPessoa);
    const pRoupa  = parseDataUrl(fotoRoupa);

    if (!pPessoa.data || !pRoupa.data) {
      return res.status(400).json({ success: false, message: "Formato de imagem inválido." });
    }
    if (!isValidBase64(pPessoa.data) || !isValidBase64(pRoupa.data)) {
      return res.status(400).json({ success: false, message: "Base64 inválido nas imagens enviadas." });
    }

    console.log("[TRYON] pessoa bytes:", Buffer.from(pPessoa.data, "base64").length, "mime:", pPessoa.mime);
    console.log("[TRYON] roupa  bytes:", Buffer.from(pRoupa.data,  "base64").length, "mime:", pRoupa.mime);

    const prompt =
`Fotografia realista de corpo inteiro.
Aplique fielmente a roupa da segunda imagem sobre a pessoa da primeira imagem, mantendo rosto, corpo, pose, iluminação e fundo.
Ajuste sombras, dobras e reflexos. Retorne somente a imagem final renderizada (sem texto).`;

    const parts = [
      { text: prompt },
      { inlineData: { mimeType: pPessoa.mime, data: pPessoa.data } },
      { inlineData: { mimeType: pRoupa.mime,  data: pRoupa.data  } },
    ];

    const result = await model.generateContent(parts);
    const response = await result.response;

    const imagePart =
      response?.candidates?.[0]?.content?.parts?.find((p) => p.inlineData?.data);

    if (!imagePart) {
      // log curto do motivo
      const safety = response?.candidates?.[0]?.safetyRatings || response?.promptFeedback;
      console.error("[TRYON][NO_IMAGE]", JSON.stringify({ safety }, null, 2).slice(0, 1000));
      return res.status(502).json({
        success: false,
        message: "Não foi possível gerar a imagem (resposta inesperada do modelo)."
      });
    }

    const base64 = imagePart.inlineData.data;
    const filename = `provador_${Date.now()}.jpg`;
    const filepath = path.join(TEMP_DIR, filename);
    fs.writeFileSync(filepath, Buffer.from(base64, "base64"));

    console.log("[TRYON] OK em", Date.now() - t0, "ms");
    return res.json({ success: true, image: `data:image/jpeg;base64,${base64}` });
  } catch (e) {
    console.error("[TRYON][ERROR]", e?.message || e);
    return res.status(500).json({ success: false, message: e?.message || "Erro interno." });
  }
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log(`🚀 Servindo na porta ${PORT}`));