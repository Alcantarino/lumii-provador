// index.js — Lumii Provador Lincoln Alcantarino (igual à estrutura do “modelos”, 2 imagens, Base64 saneado)
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
  console.error("GEMINI_API_KEY ausente no ambiente.");
}
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash-image" });

// === UTIL: limpa DataURL e retorna { mime, data } ===
function parseImage(input) {
  if (typeof input !== "string" || !input.trim()) {
    return { mime: null, data: null };
  }
  const s = input.trim();

  // dataURL completo?
  const m = s.match(/^data:(image\/[a-z0-9+.\-]+);base64,(.+)$/i);
  if (m) {
    return { mime: m[1].toLowerCase(), data: m[2].replace(/\s+/g, "") };
  }

  // caso tenha sido colado algo contendo "...base64,XXXX"
  const idx = s.toLowerCase().lastIndexOf("base64,");
  if (idx !== -1) {
    const after = s.slice(idx + "base64,".length);
    return { mime: "image/jpeg", data: after.replace(/\s+/g, "") };
  }

  // já é base64 puro
  return { mime: "image/jpeg", data: s.replace(/\s+/g, "") };
}

// === STATUS ===
app.get("/", (_req, res) => {
  res.status(200).send("Lumii Provador ativo!");
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

    // Limpa e detecta MIME corretamente
    const pPessoa = parseImage(fotoPessoa);
    const pRoupa  = parseImage(fotoRoupa);

    if (!pPessoa.data || !pRoupa.data) {
      return res.status(400).json({ success: false, message: "Formato de imagem inválido." });
    }

    // Sanidade: garantir que de fato ficou só o base64 cru
    if (pPessoa.data.startsWith("data:") || pRoupa.data.startsWith("data:")) {
      return res.status(400).json({ success: false, message: "Envie DataURL completo; o servidor remove o prefixo internamente." });
    }

    // Logs de tamanho para confirmar limpeza
    console.log("[TRYON] pessoa bytes:", Buffer.from(pPessoa.data, "base64").length, "mime:", pPessoa.mime);
    console.log("[TRYON] roupa  bytes:", Buffer.from(pRoupa.data,  "base64").length, "mime:", pRoupa.mime);

    const prompt =
      "Apply the clothing from the second image onto the person from the first image. " +
      "Keep face, body, pose, lighting and background unchanged. " +
      "Preserve the garment's exact color, texture and print. Return only the final realistic photo.";

    // Forma correta do SDK (@google/generative-ai): parts com inlineData (camelCase)
    const result = await model.generateContent([
      { text: prompt },
      { inlineData: { mimeType: pPessoa.mime, data: pPessoa.data } },
      { inlineData: { mimeType: pRoupa.mime,  data: pRoupa.data  } },
    ]);

    const response = await result.response;

    // Busca a imagem retornada
    const imagePart = response?.candidates?.[0]?.content?.parts?.find((p) => p.inlineData?.data);
    if (!imagePart) {
      const txt = response?.candidates?.[0]?.content?.parts?.find((p) => p.text)?.text;
      console.error("[TRYON][NO_IMAGE] Texto retornado:", txt || "(vazio)");
      throw new Error("Não foi possível gerar a imagem (resposta sem imagem do modelo).");
    }

    const base64 = imagePart.inlineData.data;
    const filename = `provador_${Date.now()}.jpg`;
    outputPath = path.join(TEMP_DIR, filename);
    fs.writeFileSync(outputPath, Buffer.from(base64, "base64"));

    console.log(`Imagem gerada: ${filename} em ${Date.now() - t0}ms`);
    return res.json({ success: true, image: `data:image/jpeg;base64,${base64}` });
  } catch (error) {
    console.error("Erro no provador:", error?.message || error);
    if (outputPath && fs.existsSync(outputPath)) {
      try { fs.unlinkSync(outputPath); } catch {}
    }
    return res.status(500).json({ success: false, message: error?.message || "Erro interno desconhecido." });
  }
});

// === START ===
const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log(`Lumii Provador rodando na porta ${PORT}`));