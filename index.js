// index.js — Lumii Provador (estrutura idêntica ao "modelos", ajustado para 2 imagens)
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
const model = genAI.getGenerativeModel({ model: "gemini-2.0-pro-vision" });

// === STATUS ===
app.get("/", (_req, res) => res.status(200).send("✅ Lumii Provador ativo!"));

// === TRY-ON (Provador IA) — versão com diagnóstico completo ===
// === TRY-ON (Provador IA) — versão final 100% limpa ===
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

    // === LIMPEZA COMPLETA DO BASE64 ===
    function cleanBase64(dataUrl) {
      if (!dataUrl || typeof dataUrl !== "string") return "";
      return dataUrl
        .replace(/^data:image\/[a-zA-Z0-9+.-]+;base64,/, "") // remove prefixo
        .replace(/\s/g, ""); // remove quebras e espaços
    }

    const pessoaBase64 = cleanBase64(fotoPessoa);
    const roupaBase64  = cleanBase64(fotoRoupa);

    // === DEBUG: confirmar limpeza ===
    console.log("[TRYON] pessoa prefixo removido?", !fotoPessoa.includes("data:image/"));
    console.log("[TRYON] roupa prefixo removido?", !fotoRoupa.includes("data:image/"));
    console.log("[TRYON] pessoa bytes:", Buffer.from(pessoaBase64, "base64").length);
    console.log("[TRYON] roupa  bytes:", Buffer.from(roupaBase64,  "base64").length);

    // === PROMPT ===
    const prompt =
      "Apply the clothing from the second image onto the person from the first image. " +
      "Preserve face, body, pose, lighting, and background exactly. " +
      "Keep the garment’s real color, texture, and pattern. Return only the final realistic photo.";

    // === ENVIA PARA GEMINI ===
    const result = await model.generateContent([
      { text: prompt },
      { inlineData: { mimeType: "image/jpeg", data: pessoaBase64 } },
      { inlineData: { mimeType: "image/jpeg", data: roupaBase64 } },
    ]);

    const response = await result.response;

    // === CAPTURA IMAGEM GERADA ===
    const imagePart = response?.candidates?.[0]?.content?.parts?.find(p => p.inlineData?.data);
    if (!imagePart) {
      const text = response?.candidates?.[0]?.content?.parts?.find(p => p.text)?.text;
      console.error("[TRYON][NO_IMAGE]", text || "(sem texto)");
      throw new Error("Modelo não retornou imagem.");
    }

    const base64 = imagePart.inlineData.data;
    const filename = `provador_${Date.now()}.jpg`;
    outputPath = path.join(TEMP_DIR, filename);
    fs.writeFileSync(outputPath, Buffer.from(base64, "base64"));

    console.log(`✅ Imagem gerada: ${filename} em ${Date.now() - t0}ms`);
    return res.json({
      success: true,
      image: `data:image/jpeg;base64,${base64}`,
    });

  } catch (error) {
    console.error("❌ Erro no provador:", error?.message || error);
    if (outputPath && fs.existsSync(outputPath)) {
      try { fs.unlinkSync(outputPath); } catch {}
    }
    return res.status(500).json({
      success: false,
      message: error?.message || "Erro interno.",
    });
  }
});

// === START ===
const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log(`🚀 Lumii Provador rodando na porta ${PORT}`));