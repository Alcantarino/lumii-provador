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
// === TRY-ON (Provador IA) — envia somente Base64 cru ===
app.post("/tryon", async (req, res) => {
  let outputPath = null;
  const t0 = Date.now();

  try {
    const { fotoPessoa, fotoRoupa } = req.body || {};
    if (!fotoPessoa || !fotoRoupa) {
      return res.status(400).json({ success: false, message: "Envie as duas imagens (pessoa e roupa)." });
    }

    // Remove o prefixo "data:image/...;base64," e guarda o MIME correto
    const mPessoa = (fotoPessoa.match(/^data:(image\/[a-z0-9.+-]+);base64,/i) || [])[1] || "image/jpeg";
    const mRoupa  = (fotoRoupa .match(/^data:(image\/[a-z0-9.+-]+);base64,/i) || [])[1] || "image/jpeg";

    const pessoaBase64 = fotoPessoa.replace(/^data:image\/[a-z0-9.+-]+;base64,/i, "").trim();
    const roupaBase64  = fotoRoupa .replace(/^data:image\/[a-z0-9.+-]+;base64,/i, "").trim();

    // Sanidade extra: se ainda vier com "data:", dispara erro claro
    if (pessoaBase64.startsWith("data:") || roupaBase64.startsWith("data:")) {
      return res.status(400).json({ success: false, message: "Formato inválido: envie DataURL completo; o servidor limpa o prefixo internamente." });
    }

    // Log curto (tamanhos em bytes) para validar que limpou
    console.log("[TRYON] pessoa bytes:", Buffer.from(pessoaBase64, "base64").length, "mime:", mPessoa);
    console.log("[TRYON] roupa  bytes:", Buffer.from(roupaBase64,  "base64").length, "mime:", mRoupa);

    const prompt =
      "Apply the clothing from the second image onto the person from the first image. " +
      "Keep face, body, pose, lighting and background unchanged. " +
      "Preserve the garment’s exact color, texture and print. Return only the final realistic photo.";

    // Forma correta do SDK: array de parts com inlineData (camelCase)
    const result = await model.generateContent([
      { text: prompt },
      { inlineData: { mimeType: mPessoa, data: pessoaBase64 } },
      { inlineData: { mimeType: mRoupa,  data: roupaBase64  } },
    ]);

    const response = await result.response;

    // Procura a imagem retornada
    const imagePart = response?.candidates?.[0]?.content?.parts?.find(p => p.inlineData?.data);
    if (!imagePart) {
      const textMsg = response?.candidates?.[0]?.content?.parts?.find(p => p.text)?.text;
      console.error("[TRYON][NO_IMAGE] Texto:", textMsg || "(vazio)");
      throw new Error("Não foi possível gerar a imagem (resposta sem imagem do modelo).");
    }

    const base64 = imagePart.inlineData.data;
    const filename = `provador_${Date.now()}.jpg`;
    outputPath = path.join(TEMP_DIR, filename);
    fs.writeFileSync(outputPath, Buffer.from(base64, "base64"));

    console.log(`✅ Imagem gerada: ${filename} em ${Date.now() - t0}ms`);
    return res.json({ success: true, image: `data:image/jpeg;base64,${base64}` });

  } catch (error) {
    console.error("❌ Erro no provador:", error?.message || error);
    if (outputPath && fs.existsSync(outputPath)) {
      try { fs.unlinkSync(outputPath); } catch {}
    }
    return res.status(500).json({ success: false, message: error?.message || "Erro interno desconhecido." });
  }
});

// === START ===
const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log(`🚀 Lumii Provador rodando na porta ${PORT}`));