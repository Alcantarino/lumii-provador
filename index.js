// index.js — Lumii Provador - Lincoln (versão final com limpeza de Base64 e estrutura idêntica ao "modelos")
import express from "express";
import cors from "cors";
import fs from "fs";
import path from "path";
import { GoogleGenerativeAI } from "@google/generative-ai";

const app = express();
app.use(cors());
app.use(express.json({ limit: "50mb" }));

// === CONFIGURAÇÃO GERAL ===
const TEMP_DIR = path.resolve("./assets/temp");
if (!fs.existsSync(TEMP_DIR)) fs.mkdirSync(TEMP_DIR, { recursive: true });

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash-image" });

// === STATUS ===
app.get("/", (req, res) => {
  res.status(200).send("✅ Lumii Provador ativo e rodando!");
});

// === ROTA PRINCIPAL ===
app.post("/tryon", async (req, res) => {
  let outputPath = null;
  try {
    const { fotoPessoa, fotoRoupa } = req.body || {};

    if (!fotoPessoa || !fotoRoupa) {
      return res.status(400).json({ success: false, message: "Envie as duas imagens (pessoa e roupa)." });
    }

    // 🔧 Remover prefixo Base64 (data:image/...;base64,)
    const pessoaBase64 = fotoPessoa.replace(/^data:image\/[a-zA-Z]+;base64,/, "");
    const roupaBase64 = fotoRoupa.replace(/^data:image\/[a-zA-Z]+;base64,/, "");

    // === PROMPT ===
    const prompt = `
Fotografia realista de corpo inteiro.
Aplique fielmente a roupa da segunda imagem sobre a pessoa da primeira,
mantendo rosto, corpo, pose e iluminação naturais.
Cenário neutro, integração perfeita entre pessoa e roupa, realismo máximo.
Retorne apenas a imagem final.`;

    console.log("🧠 Enviando imagens ao Gemini...");

    const result = await model.generateContent([
      { text: prompt },
      { inlineData: { mimeType: "image/jpeg", data: pessoaBase64 } },
      { inlineData: { mimeType: "image/jpeg", data: roupaBase64 } }
    ]);

    const response = await result.response;
    const imagePart = response?.candidates?.[0]?.content?.parts?.find(p => p.inlineData?.data);

    if (!imagePart) throw new Error("Não foi possível gerar a imagem.");

    const generatedImageBase64 = imagePart.inlineData.data;
    const outputFilename = `provador_${Date.now()}.jpg`;
    outputPath = path.join(TEMP_DIR, outputFilename);

    fs.writeFileSync(outputPath, Buffer.from(generatedImageBase64, "base64"));
    console.log(`✅ Imagem gerada: ${outputFilename}`);

    res.status(200).json({
      success: true,
      image: `data:image/jpeg;base64,${generatedImageBase64}`
    });

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