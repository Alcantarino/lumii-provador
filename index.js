// index.js — Lumii Provador Alcantarino (fix inlineData + Base64 puro)
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
const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash-image" });

// === STATUS ===
app.get("/", (_req, res) => {
  res.status(200).send("✅ Lumii Provador ativo!");
});

// === TRY-ON (Provador IA) ===
app.post("/tryon", async (req, res) => {
  let outputPath = null;
  const t0 = Date.now();

  try {
    const { fotoPessoa, fotoRoupa } = req.body || {};
    if (!fotoPessoa || !fotoRoupa) {
      return res.status(400).json({
        success: false,
        message: "Envie as duas imagens (pessoa e roupa)."
      });
    }

    // === REMOVER PREFIXO Base64 ===
    const pessoaBase64 = fotoPessoa.replace(/^data:image\/[a-zA-Z]+;base64,/, "").trim();
    const roupaBase64  = fotoRoupa.replace(/^data:image\/[a-zA-Z]+;base64,/, "").trim();

    console.log("🧠 Enviando imagens ao Gemini...");
    console.log("Pessoa bytes:", Buffer.from(pessoaBase64, "base64").length);
    console.log("Roupa  bytes:", Buffer.from(roupaBase64, "base64").length);

    // === PROMPT técnico (simples e direto, igual AI Studio) ===
    const prompt = `
Generate one realistic full-body photo.
Use the first image as the base person photo.
Use the second image as the clothing to apply.
Preserve exact fabric color, texture, and pattern.
Keep lighting, body, and face natural.
Return only the final image (no text).`;

    // === PARTS no formato correto ===
    const parts = [
      { text: prompt },
      { inlineData: { mimeType: "image/jpeg", data: pessoaBase64 } },
      { inlineData: { mimeType: "image/jpeg", data: roupaBase64 } }
    ];

    // === GERAR ===
    const result = await model.generateContent(parts, {
      generationConfig: { responseMimeType: "image/jpeg" }
    });

    const response = await result.response;
    const imagePart = response?.candidates?.[0]?.content?.parts?.find(p => p.inlineData?.data);

    if (!imagePart) throw new Error("Não foi possível gerar a imagem (sem retorno de inlineData).");

    const base64 = imagePart.inlineData.data;
    const filename = `provador_${Date.now()}.jpg`;
    outputPath = path.join(TEMP_DIR, filename);
    fs.writeFileSync(outputPath, Buffer.from(base64, "base64"));

    console.log(`✅ Imagem gerada: ${filename} (${Date.now() - t0}ms)`);
    return res.json({ success: true, image: `data:image/jpeg;base64,${base64}` });

  } catch (error) {
    console.error("❌ Erro no provador:", error);
    if (outputPath && fs.existsSync(outputPath)) {
      try { fs.unlinkSync(outputPath); } catch {}
    }
    res.status(500).json({
      success: false,
      message: error.message || "Erro interno desconhecido."
    });
  }
});

// === START ===
const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log(`🚀 Lumii Provador rodando na porta ${PORT}`));