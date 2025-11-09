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

// === TRY-ON ===
// === TRY-ON (Provador IA) — versão com diagnóstico completo ===
app.post("/tryon", async (req, res) => {
  let outputPath = null;
  const t0 = Date.now();

  // helper: extrai mime e base64 puro
  function splitDataURL(s) {
    if (typeof s !== "string") return { mime: null, b64: null };
    const m = s.match(/^data:(image\/[a-z0-9.+-]+);base64,(.+)$/i);
    if (m) return { mime: m[1].toLowerCase(), b64: m[2].replace(/\s+/g, "") };
    // se veio sem prefixo, assume jpeg
    return { mime: "image/jpeg", b64: s.replace(/\s+/g, "") };
  }

  try {
    const { fotoPessoa, fotoRoupa } = req.body || {};
    if (!fotoPessoa || !fotoRoupa) {
      return res.status(400).json({ success: false, message: "Envie as duas imagens (pessoa e roupa)." });
    }

    const p = splitDataURL(fotoPessoa);
    const r = splitDataURL(fotoRoupa);

    // valida base64 decodificável
    let sizeP = 0, sizeR = 0;
    try { sizeP = Buffer.from(p.b64, "base64").length; } catch {}
    try { sizeR = Buffer.from(r.b64, "base64").length; } catch {}

    if (!p.b64 || !r.b64 || sizeP === 0 || sizeR === 0) {
      return res.status(400).json({
        success: false,
        message: "Base64 inválido nas imagens.",
        debug: { mimePessoa: p.mime, mimeRoupa: r.mime, sizePessoa: sizeP, sizeRoupa: sizeR }
      });
    }

    console.log("[TRYON] bytes:", { pessoa: sizeP, roupa: sizeR, mimePessoa: p.mime, mimeRoupa: r.mime });

    const prompt =
      "Apply the clothing from the second image onto the person from the first image. " +
      "Preserve face, body, pose, lighting and background. " +
      "Keep exact garment color, texture and print. Return only the final realistic photo.";

    // chamada no formato do SDK (parts com inlineData)
    const result = await model.generateContent([
      { text: prompt },
      { inlineData: { mimeType: p.mime, data: p.b64 } },
      { inlineData: { mimeType: r.mime, data: r.b64 } },
    ]);

    const response = await result.response;

    // LOG COMPLETO (cortado para não explodir log)
    try {
      const safePreview = JSON.stringify(response, null, 2);
      console.log("[TRYON][RAW_RESPONSE]", safePreview.length > 5000 ? safePreview.slice(0, 5000) + "…(cut)" : safePreview);
    } catch {}

    // extrai imagem
    const imagePart = response?.candidates?.[0]?.content?.parts?.find((x) => x?.inlineData?.data);
    if (!imagePart) {
      const debug = {
        finishReason: response?.candidates?.[0]?.finishReason,
        promptFeedback: response?.promptFeedback,
        safetyRatings: response?.candidates?.[0]?.safetyRatings,
        textReturn: response?.candidates?.[0]?.content?.parts?.find((x) => x?.text)?.text
      };
      console.error("[TRYON][NO_IMAGE]", JSON.stringify(debug, null, 2));
      return res.status(502).json({
        success: false,
        message: "Modelo não retornou imagem.",
        debug
      });
    }

    const base64 = imagePart.inlineData.data;
    const filename = `provador_${Date.now()}.jpg`;
    outputPath = path.join(TEMP_DIR, filename);
    fs.writeFileSync(outputPath, Buffer.from(base64, "base64"));

    console.log(`✅ Gerado ${filename} em ${Date.now() - t0}ms`);
    return res.json({ success: true, image: `data:image/jpeg;base64,${base64}` });
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