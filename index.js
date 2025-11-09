//Lincoln Alcantarino
import express from "express";
import cors from "cors";
import fs from "fs";
import path from "path";
import fetch from "node-fetch";

const app = express();
app.use(cors());
app.use(express.json({ limit: "50mb" }));

const TEMP_DIR = path.resolve("./assets/temp");
if (!fs.existsSync(TEMP_DIR)) fs.mkdirSync(TEMP_DIR, { recursive: true });

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent";

function cleanBase64(dataUrl) {
  if (!dataUrl || typeof dataUrl !== "string") return "";
  return dataUrl.replace(/^data:image\/[a-zA-Z0-9+.-]+;base64,/, "").replace(/\s/g, "");
}

app.get("/", (_req, res) => res.status(200).send("✅ Lumii Provador ativo!"));

app.post("/tryon", async (req, res) => {
  let outputPath = null;
  const t0 = Date.now();

  try {
    const { fotoPessoa, fotoRoupa } = req.body || {};
    if (!fotoPessoa || !fotoRoupa)
      return res.status(400).json({ success: false, message: "Envie as duas imagens (pessoa e roupa)." });

    const pessoaBase64 = cleanBase64(fotoPessoa);
    const roupaBase64 = cleanBase64(fotoRoupa);

    const prompt = `
Apply the clothing from the second image onto the person from the first image.
Preserve face, body, pose, lighting, and background exactly.
Keep the garment’s real color, texture, and pattern.
Return only the final realistic photo.`;

    const body = {
      contents: [
        {
          parts: [
            { text: prompt },
            { inlineData: { mimeType: "image/jpeg", data: pessoaBase64 } },
            { inlineData: { mimeType: "image/jpeg", data: roupaBase64 } },
          ],
        },
      ],
    };

    const response = await fetch(`${GEMINI_URL}?key=${GEMINI_API_KEY}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    const json = await response.json();

    const imagePart =
      json?.candidates?.[0]?.content?.parts?.find((p) => p.inlineData?.data);

    if (!imagePart) {
      console.error("[TRYON][NO_IMAGE]", json);
      throw new Error("Não foi possível gerar a imagem (sem retorno de imagem).");
    }

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

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log(`🚀 Lumii Provador rodando na porta ${PORT}`));