// index.js — Lumii Provador Lincoln (versão final com Base64 e stream corrigidos)
import express from "express";
import cors from "cors";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { GoogleGenerativeAI } from "@google/generative-ai";

const app = express();
app.use(cors());
app.use(express.json({ limit: "50mb" }));

// === PATHS ===
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const TEMP_DIR = path.join(__dirname, "assets/temp");
if (!fs.existsSync(TEMP_DIR)) fs.mkdirSync(TEMP_DIR, { recursive: true });

// === GEMINI ===
if (!process.env.GEMINI_API_KEY) {
  console.error("GEMINI_API_KEY ausente no ambiente.");
}
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

// === HEALTH ===
app.get("/", (_req, res) => {
  res.status(200).send("✅ Lumii Provador ativo e rodando no Cloud Run!");
});

// === TRY-ON ===
app.post("/tryon", async (req, res) => {
  const t0 = Date.now();
  try {
    const { fotoPessoa, fotoRoupa } = req.body || {};
    if (!fotoPessoa || !fotoRoupa) {
      return res.status(400).json({
        success: false,
        message: "Envie as duas imagens (pessoa e roupa).",
      });
    }

    console.log("[TRYON] Recebendo imagens...");
    console.log("Pessoa tamanho:", fotoPessoa.length, "Roupa tamanho:", fotoRoupa.length);

    const prompt = `
Fotografia realista de corpo inteiro.
Aplique fielmente a roupa da segunda imagem sobre a pessoa da primeira imagem,
mantendo rosto, corpo, pose, iluminação e fundo originais.
Ajuste sombras, dobras e reflexos. Retorne somente a imagem final renderizada (sem texto).`;

    // 🔧 CORREÇÃO: remove o prefixo base64
    const pPessoa = (fotoPessoa || "").replace(/^data:image\/\w+;base64,/, "").replace(/\s+/g, "");
    const pRoupa = (fotoRoupa || "").replace(/^data:image\/\w+;base64,/, "").replace(/\s+/g, "");

    // === NOVO MÉTODO: STREAM DO GEMINI ===
    const result = await model.generateContentStream({
      contents: [
        {
          role: "user",
          parts: [
            { text: prompt },
            { inlineData: { mimeType: "image/jpeg", data: pPessoa } },
            { inlineData: { mimeType: "image/jpeg", data: pRoupa } },
          ],
        },
      ],
    });

    let base64 = null;
    for await (const item of result.stream) {
      const part = item?.candidates?.[0]?.content?.parts?.find((p) => p.inlineData?.data);
      if (part?.inlineData?.data) {
        base64 = part.inlineData.data;
        break;
      }
    }

    if (!base64) {
      console.error("[TRYON][NO_IMAGE_STREAM]");
      return res.status(502).json({
        success: false,
        message: "Não foi possível gerar a imagem (stream vazia).",
      });
    }

    const filename = `provador_${Date.now()}.jpg`;
    const filepath = path.join(TEMP_DIR, filename);
    fs.writeFileSync(filepath, Buffer.from(base64, "base64"));

    console.log("[TRYON] OK em", Date.now() - t0, "ms");
    return res.json({ success: true, image: `data:image/jpeg;base64,${base64}` });

  } catch (e) {
    console.error("[TRYON][ERROR]", e?.message || e);
    return res.status(500).json({
      success: false,
      message: e?.message || "Erro interno no servidor.",
    });
  }
});

// === START ===
const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log(`🚀 Servindo na porta ${PORT}`));