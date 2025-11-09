// index.js — Lumii Provador Alcantarino (sanitize Base64 robusto + MIME correto + logs de verificação)
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

// util: extrai mime e base64 puro de um dataURL OU retorna base64 e mime padrão se já vier cru
function parseImage(input) {
  if (typeof input !== "string") return { mime: null, data: null };

  // remove espaços/quebras invisíveis
  const s = input.trim();

  // dataURL completo?
  const m = s.match(/^data:(image\/[a-z0-9+.\-]+);base64,(.+)$/i);
  if (m) {
    // m[1] = mime, m[2] = base64 puro
    return { mime: m[1].toLowerCase(), data: m[2].replace(/\s+/g, "") };
  }

  // não é dataURL: tirar tudo até 'base64,' se tiver sido colado bruto
  const idx = s.toLowerCase().lastIndexOf("base64,");
  if (idx !== -1) {
    const after = s.slice(idx + "base64,".length);
    return { mime: "image/jpeg", data: after.replace(/\s+/g, "") };
  }

  // já é base64 puro (assumir jpeg)
  return { mime: "image/jpeg", data: s.replace(/\s+/g, "") };
}

// === STATUS ===
app.get("/", (_req, res) => {
  res.status(200).send("✅ Lumii Provador ativo!");
});

// === TRY-ON (Provador IA) ===
// === TRY-ON (Provador IA) ===
app.post("/tryon", async (req, res) => {
  let outputPath = null;
  const t0 = Date.now();

  try {
    const { fotoPessoa, fotoRoupa } = req.body || {};
    if (!fotoPessoa || !fotoRoupa) {
      return res.status(400).json({ success: false, message: "Envie as duas imagens (pessoa e roupa)." });
    }

    // === LIMPAR PREFIXO BASE64 ===
    const pessoaBase64 = (fotoPessoa || "").replace(/^data:image\/[a-zA-Z]+;base64,/, "").trim();
    const roupaBase64  = (fotoRoupa  || "").replace(/^data:image\/[a-zA-Z]+;base64,/, "").trim();

    console.log("[TRYON] pessoa bytes:", Buffer.from(pessoaBase64, "base64").length);
    console.log("[TRYON] roupa  bytes:", Buffer.from(roupaBase64, "base64").length);

    // === PROMPT ===
    const prompt = `
Apply the clothing from the second image onto the person in the first image.
Preserve the person’s face, body, pose, lighting and background.
Keep the fabric color, texture and pattern faithful to the original garment.
Return only the final realistic photo.`;

    const result = await model.generateContent([
      { text: prompt },
      { inlineData: { mimeType: "image/jpeg", data: pessoaBase64 } },
      { inlineData: { mimeType: "image/jpeg", data: roupaBase64 } }
    ]);

    const response = await result.response;
    const imagePart = response?.candidates?.[0]?.content?.parts?.find(p => p.inlineData?.data);

    if (!imagePart) throw new Error("Não foi possível gerar a imagem.");

    const base64 = imagePart.inlineData.data;
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