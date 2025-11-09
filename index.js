// index.js â€” Lumii Provador - Lincoln (versÃ£o final com limpeza de Base64 e estrutura idÃªntica ao "modelos")
import express from "express";
import cors from "cors";
import fs from "fs";
import path from "path";
import { GoogleGenerativeAI } from "@google/generative-ai";

const app = express();
app.use(cors());
app.use(express.json({ limit: "50mb" }));

// === CONFIGURAÃ‡ÃƒO GERAL ===
const TEMP_DIR = path.resolve("./assets/temp");
if (!fs.existsSync(TEMP_DIR)) fs.mkdirSync(TEMP_DIR, { recursive: true });

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash-image" });

// === STATUS ===
app.get("/", (req, res) => {
  res.status(200).send("âœ… Lumii Provador ativo e rodando!");
});

// === Lincoln ===
// === TRY-ON (Provador IA) ===
// OBS: garanta que o 'model' foi criado com o modelo de imagem:
// const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash-image" });

app.post("/tryon", async (req, res) => {
  let outputPath = null;
  const t0 = Date.now();

  try {
    const { fotoPessoa, fotoRoupa } = req.body || {};
    if (!fotoPessoa || !fotoRoupa) {
      return res.status(400).json({ success: false, message: "Envie as duas imagens (pessoa e roupa)." });
    }

    // Limpeza: aceita dataURL (data:image/...;base64,...) ou base64 puro
    const pessoaBase64 = String(fotoPessoa).replace(/^data:image\/[a-zA-Z0-9.+-]+;base64,/, "").replace(/\s+/g, "");
    const roupaBase64  = String(fotoRoupa ).replace(/^data:image\/[a-zA-Z0-9.+-]+;base64,/, "").replace(/\s+/g, "");

    // Sanidade rápida
    if (!pessoaBase64 || !roupaBase64) {
      return res.status(400).json({ success: false, message: "Imagens inválidas (base64 vazio)." });
    }

    console.log("[TRYON] pessoa bytes:", Buffer.from(pessoaBase64, "base64").length);
    console.log("[TRYON] roupa  bytes:",  Buffer.from(roupaBase64,  "base64").length);

    // Instrução fixa (sem input do usuário). Curta e direta.
    const instruction = "Apply the clothing from image #2 onto the person in image #1, photorealistic, keep face/body/pose/lighting/background. Return image only.";

    const result = await model.generateContent([
      { text: instruction },
      { inlineData: { mimeType: "image/jpeg", data: pessoaBase64 } },
      { inlineData: { mimeType: "image/jpeg", data: roupaBase64  } }
    ]);

    const response = await result.response;
    const imagePart = response?.candidates?.[0]?.content?.parts?.find(p => p.inlineData?.data);

    if (!imagePart) {
      const txt = response?.candidates?.[0]?.content?.parts?.find(p => p.text)?.text;
      console.error("[TRYON][NO_IMAGE]", txt || "(sem texto)");
      throw new Error("Não foi possível gerar a imagem (modelo não retornou imagem).");
    }

    const generatedImageBase64 = imagePart.inlineData.data;
    const outputFilename = `provador_${Date.now()}.jpg`;
    outputPath = path.join(TEMP_DIR, outputFilename);
    fs.writeFileSync(outputPath, Buffer.from(generatedImageBase64, "base64"));

    console.log(`✅ Imagem gerada: ${outputFilename} em ${Date.now() - t0}ms`);
    return res.status(200).json({ success: true, image: `data:image/jpeg;base64,${generatedImageBase64}` });

  } catch (error) {
    console.error("❌ Erro no provador:", error?.message || error);
    if (outputPath && fs.existsSync(outputPath)) { try { fs.unlinkSync(outputPath); } catch {} }
    return res.status(500).json({ success: false, message: error?.message || "Erro interno desconhecido." });
  }
});

// === START ===
const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log(`🚀 Lumii Provador rodando na porta ${PORT}`));