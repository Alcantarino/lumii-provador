// index.js — Lumii Provador (com correção Base64 direta)
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
const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash-image" });

// === HEALTH ===
app.get("/", (_req, res) => {
  res.status(200).send("✅ Lumii Provador ativo e rodando");
});

// === TRY-ON ===
app.post("/tryon", async (req, res) => {
  const t0 = Date.now();
  try {
    const { fotoPessoa, fotoRoupa } = req.body || {};
    if (!fotoPessoa || !fotoRoupa) {
      return res.status(400).json({ success: false, message: "Envie as duas imagens (pessoa e roupa)." });
    }

    console.log("[TRYON] Recebendo imagens...");
    console.log("Pessoa tamanho:", fotoPessoa.length, "Roupa tamanho:", fotoRoupa.length);

    const prompt = `
Fotografia realista de corpo inteiro.
Aplique fielmente a roupa da segunda imagem sobre a pessoa da primeira imagem,
mantendo rosto, corpo, pose, iluminação e fundo originais.
Ajuste sombras, dobras e reflexos. Retorne somente a imagem final renderizada (sem texto).`;

    // 🔧 LINHAS CORRIGIDAS — remove o prefixo data:image/...;base64,
    const parts = [
      { text: prompt },
      { inlineData: { mimeType: "image/jpeg", data: (fotoPessoa || "").replace(/^data:image\/\w+;base64,/, "").replace(/\s+/g, "") } },
      { inlineData: { mimeType: "image/jpeg", data: (fotoRoupa  || "").replace(/^data:image\/\w+;base64,/, "").replace(/\s+/g, "") } }
    ];

    const result = await model.generateContent(parts, {
      generationConfig: { responseMimeType: "image/jpeg" }
    });

    const response = await result.response;
    const imagePart = response?.candidates?.[0]?.content?.parts?.find(p => p.inlineData?.data);

    if (!imagePart) {
      const reason = response?.promptFeedback || response?.candidates?.[0]?.finishReason;
      console.error("[TRYON][NO_IMAGE]", JSON.stringify(reason, null, 2));
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

// === START ===
const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log(`🚀 Servindo na porta ${PORT}`));