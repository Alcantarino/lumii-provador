// index.js — Lumii Provador Alcantarino (REST fix definitivo — Base64 puro, igual ao módulo "modelos")
import express from "express";
import cors from "cors";
import fs from "fs";
import path from "path";
import fetch from "node-fetch";

const app = express();
app.use(cors());
app.use(express.json({ limit: "50mb" }));

// === PATHS ===
const TEMP_DIR = path.resolve("./assets/temp");
if (!fs.existsSync(TEMP_DIR)) fs.mkdirSync(TEMP_DIR, { recursive: true });

// === CONFIG ===
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
if (!GEMINI_API_KEY) {
  console.error("❌ GEMINI_API_KEY ausente no ambiente!");
}

// === STATUS ===
app.get("/", (_req, res) => {
  res.status(200).send("✅ Lumii Provador ativo!");
});

// === FUNÇÃO AUXILIAR ===
function sanitizeImage(dataUrl) {
  if (typeof dataUrl !== "string") return { mime: "image/jpeg", data: "" };
  const trimmed = dataUrl.trim();
  const match = trimmed.match(/^data:(image\/[a-z0-9.+-]+);base64,(.*)$/i);
  if (match) {
    return { mime: match[1].toLowerCase(), data: match[2].replace(/\s+/g, "") };
  }
  return { mime: "image/jpeg", data: trimmed.replace(/\s+/g, "") };
}

// === TRY-ON ===
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

    const pessoa = sanitizeImage(fotoPessoa);
    const roupa = sanitizeImage(fotoRoupa);

    console.log("🧠 Sanitized:", pessoa.mime, roupa.mime);
    console.log("Bytes pessoa:", Buffer.from(pessoa.data, "base64").length);
    console.log("Bytes roupa:", Buffer.from(roupa.data, "base64").length);

    const prompt = `
Apply the clothing from the second image onto the person from the first image.
Keep the face, body, pose, and lighting natural.
Preserve the garment's exact color, pattern, and texture fidelity.
Return only the final realistic full-body photo.
`;

    const body = {
      contents: [
        {
          parts: [
            { text: prompt },
            { inline_data: { mime_type: pessoa.mime, data: pessoa.data } },
            { inline_data: { mime_type: roupa.mime, data: roupa.data } }
          ]
        }
      ]
    };

    // 🔥 Chamando REST API diretamente, sem SDK (garante Base64 puro)
    const response = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image:generateContent",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": GEMINI_API_KEY
        },
        body: JSON.stringify(body)
      }
    );

    const result = await response.json();

    const imagePart =
      result?.candidates?.[0]?.content?.parts?.find(p => p.inline_data?.data);

    if (!imagePart) {
      const textPart =
        result?.candidates?.[0]?.content?.parts?.find(p => p.text)?.text;
      console.error("[NO_IMAGE]", textPart || "(sem texto)");
      throw new Error("Não foi possível gerar a imagem (sem retorno visual).");
    }

    const base64 = imagePart.inline_data.data;
    const filename = `provador_${Date.now()}.jpg`;
    outputPath = path.join(TEMP_DIR, filename);
    fs.writeFileSync(outputPath, Buffer.from(base64, "base64"));

    console.log(`✅ Imagem gerada com sucesso: ${filename} (${Date.now() - t0}ms)`);
    return res.json({ success: true, image: `data:image/jpeg;base64,${base64}` });

  } catch (error) {
    console.error("❌ Erro no provador:", error);
    if (outputPath && fs.existsSync(outputPath)) {
      try { fs.unlinkSync(outputPath); } catch {}
    }
    return res
      .status(500)
      .json({ success: false, message: error.message || "Erro interno." });
  }
});

// === START ===
const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log(`🚀 Lumii Provador rodando na porta ${PORT}`));