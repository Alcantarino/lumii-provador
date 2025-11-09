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

    // parse robusto
    const p = parseImage(fotoPessoa);
    const r = parseImage(fotoRoupa);

    if (!p.data || !r.data) {
      return res.status(400).json({ success: false, message: "Formato de imagem inválido." });
    }

    // valida base64 decodificando (evita erro TYPE_BYTES)
    let bufP, bufR;
    try { bufP = Buffer.from(p.data, "base64"); } catch { /* noop */ }
    try { bufR = Buffer.from(r.data, "base64"); } catch { /* noop */ }
    if (!bufP?.length || !bufR?.length) {
      return res.status(400).json({ success: false, message: "Base64 inválido nas imagens enviadas." });
    }

    // logs de verificação: NÃO devem conter 'data:image'
    console.log("[TRYON] pessoa mime:", p.mime, "bytes:", bufP.length, "head:", p.data.slice(0, 30));
    console.log("[TRYON] roupa  mime:", r.mime, "bytes:", bufR.length, "head:", r.data.slice(0, 30));

    // PROMPT minimalista (mesma lógica do AI Studio)
    const prompt = `
Generate one realistic full-body photo.
Use the first image as the base person photo.
Use the second image as the clothing to apply.
Preserve exact fabric color, texture, and pattern.
Keep lighting, body, and face natural.
Return only the final image (no text).`;

    // PARTS no formato correto (inlineData camelCase) e COM base64 puro
    const parts = [
      { text: prompt },
      { inlineData: { mimeType: p.mime || "image/jpeg", data: p.data } },
      { inlineData: { mimeType: r.mime || "image/jpeg", data: r.data } }
    ];

    const result = await model.generateContent(parts, {
      generationConfig: { responseMimeType: "image/jpeg" }
    });

    const response = await result.response;

    // localizar a imagem retornada
    const imagePart = response?.candidates?.[0]?.content?.parts?.find(x => x?.inlineData?.data);
    if (!imagePart) {
      const txt = response?.candidates?.[0]?.content?.parts?.find(x => x?.text)?.text;
      console.error("[TRYON][NO_IMAGE] returned text:", (txt || "").slice(0, 400));
      throw new Error("Não foi possível gerar a imagem (sem inlineData).");
    }

    const base64Out = imagePart.inlineData.data;
    const filename = `provador_${Date.now()}.jpg`;
    outputPath = path.join(TEMP_DIR, filename);
    fs.writeFileSync(outputPath, Buffer.from(base64Out, "base64"));

    console.log(`✅ Imagem gerada: ${filename} (${Date.now() - t0}ms)`);
    return res.json({ success: true, image: `data:image/jpeg;base64,${base64Out}` });

  } catch (error) {
    console.error("❌ Erro no provador:", error?.message || error);
    if (outputPath && fs.existsSync(outputPath)) {
      try { fs.unlinkSync(outputPath); } catch {}
    }
    return res.status(500).json({
      success: false,
      message: error?.message || "Erro interno desconhecido."
    });
  }
});

// === START ===
const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log(`🚀 Lumii Provador rodando na porta ${PORT}`));