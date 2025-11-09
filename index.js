// index.js — Lumii Provador (versão final, validação e corte real de prefixos)
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
if (!process.env.GEMINI_API_KEY) {
  console.error("❌ GEMINI_API_KEY ausente no ambiente!");
}
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash-image" });

// === STATUS ===
app.get("/", (_req, res) => {
  res.status(200).send("✅ Lumii Provador ativo e funcional!");
});

// === UTIL — limpeza segura do Base64 ===
function sanitizeBase64(dataUrl) {
  if (typeof dataUrl !== "string" || !dataUrl.trim()) {
    return { mime: "image/jpeg", base64: "" };
  }

  const trimmed = dataUrl.trim();

  // Captura MIME e remove prefixo
  const match = trimmed.match(/^data:(image\/[a-z0-9.+-]+);base64,(.*)$/i);
  if (match) {
    const mime = match[1].toLowerCase();
    const pure = match[2].replace(/\s+/g, "");
    return { mime, base64: pure };
  }

  // Já é base64 puro
  return { mime: "image/jpeg", base64: trimmed.replace(/\s+/g, "") };
}

// === TRY-ON ===
app.post("/tryon", async (req, res) => {
  let outputPath = null;
  const t0 = Date.now();

  try {
    const { fotoPessoa, fotoRoupa } = req.body || {};

    if (!fotoPessoa || !fotoRoupa) {
      return res.status(400).json({ success: false, message: "Envie as duas imagens (pessoa e roupa)." });
    }

    // Limpeza e validação
    const pessoa = sanitizeBase64(fotoPessoa);
    const roupa  = sanitizeBase64(fotoRoupa);

    if (!pessoa.base64 || !roupa.base64) {
      return res.status(400).json({ success: false, message: "Imagens inválidas ou corrompidas." });
    }

    console.log("🧠 Base64 sanitized:");
    console.log(" - Pessoa MIME:", pessoa.mime, "| Bytes:", Buffer.from(pessoa.base64, "base64").length);
    console.log(" - Roupa  MIME:", roupa.mime,  "| Bytes:", Buffer.from(roupa.base64,  "base64").length);

    const prompt = `
Apply the clothing from the second image onto the person from the first image.
Keep the face, body, pose, lighting, and background natural.
Preserve the garment’s exact color, pattern, and texture fidelity.
Return only the final realistic full-body image.
`;

    const result = await model.generateContent([
      { text: prompt },
      { inlineData: { mimeType: pessoa.mime, data: pessoa.base64 } },
      { inlineData: { mimeType: roupa.mime,  data: roupa.base64  } },
    ]);

    const response = await result.response;
    const imagePart = response?.candidates?.[0]?.content?.parts?.find((p) => p.inlineData?.data);

    if (!imagePart) {
      const textPart = response?.candidates?.[0]?.content?.parts?.find((p) => p.text)?.text;
      console.error("⚠️ Nenhuma imagem retornada. Texto:", textPart || "(vazio)");
      throw new Error("O modelo não retornou imagem.");
    }

    const outputBase64 = imagePart.inlineData.data;
    const filename = `provador_${Date.now()}.jpg`;
    outputPath = path.join(TEMP_DIR, filename);

    fs.writeFileSync(outputPath, Buffer.from(outputBase64, "base64"));
    console.log(`✅ Imagem gerada: ${filename} (${Date.now() - t0}ms)`);

    return res.json({ success: true, image: `data:image/jpeg;base64,${outputBase64}` });

  } catch (error) {
    console.error("❌ Erro no provador:", error);
    if (outputPath && fs.existsSync(outputPath)) {
      try { fs.unlinkSync(outputPath); } catch {}
    }
    return res.status(500).json({ success: false, message: error.message || "Erro interno desconhecido." });
  }
});

// === START ===
const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log(`🚀 Lumii Provador rodando na porta ${PORT}`));