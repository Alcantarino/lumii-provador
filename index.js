// index.js — Lumii Provador (versão final revisada)
import express from "express";
import cors from "cors";
import fs from "fs";
import path from "path";
import { GoogleGenerativeAI } from "@google/generative-ai";

const app = express();
app.use(cors());
app.use(express.json({ limit: "50mb" }));

// === PATHS ===
const TEMP_DIR = path.resolve("./assets/temp");
if (!fs.existsSync(TEMP_DIR)) fs.mkdirSync(TEMP_DIR, { recursive: true });

// === GEMINI ===
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

// === STATUS ===
app.get("/", (_req, res) => {
  res.status(200).send("✅ Lumii Provador ativo e rodando.");
});

// === TRY-ON (Provador IA) ===
app.post("/tryon", async (req, res) => {
  let outputPath = null;
  const t0 = Date.now();

  try {
    const { fotoPessoa, fotoRoupa } = req.body || {};
    if (!fotoPessoa || !fotoRoupa) {
      return res.status(400).json({ success: false, message: "Envie as duas imagens (pessoa e roupa)." });
    }

    // === LIMPAR BASE64 ===
    const pessoaBase64 = fotoPessoa.replace(/^data:image\/[a-zA-Z]+;base64,/, "").trim();
    const roupaBase64  = fotoRoupa.replace(/^data:image\/[a-zA-Z]+;base64,/, "").trim();

    console.log("🧠 Enviando imagens ao Gemini...");

    // === PROMPT ===
    const prompt = `
You are a professional fashion image compositor.
Take the person from the first image as the main subject (base photo).
Take the clothing from the second image and accurately dress it on the person — 
maintaining the exact colors, fabric texture, patterns, and shape from the clothing image.
Preserve the model's body proportions, face, background, pose, and lighting naturally.
Output a single realistic, full-body photograph of the person now wearing that clothing.`;

    // === ESTRUTURA CORRETA ===
    const body = {
      contents: [
        {
          parts: [
            { text: prompt },
            { inline_data: { mime_type: "image/jpeg", data: pessoaBase64 } },
            { inline_data: { mime_type: "image/jpeg", data: roupaBase64 } }
          ]
        }
      ]
    };

    const result = await model.generateContent(body);
    const response = await result.response;

    const imagePart = response?.candidates?.[0]?.content?.parts?.find(p => p.inline_data?.data);

    if (!imagePart) throw new Error("Não foi possível gerar a imagem.");

    const base64 = imagePart.inline_data.data;
    const filename = `provador_${Date.now()}.jpg`;
    outputPath = path.join(TEMP_DIR, filename);
    fs.writeFileSync(outputPath, Buffer.from(base64, "base64"));

    console.log(`✅ Imagem gerada: ${filename} em ${Date.now() - t0}ms`);
    return res.json({ success: true, image: `data:image/jpeg;base64,${base64}` });

  } catch (error) {
    console.error("❌ Erro no provador:", error);
    if (outputPath && fs.existsSync(outputPath)) {
      try { fs.unlinkSync(outputPath); } catch {}
    }
    res.status(500).json({ success: false, message: error.message || "Erro interno desconhecido." });
  }
});

// === START ===
const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log(`🚀 Lumii Provador rodando na porta ${PORT}`));