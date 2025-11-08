// index.js — Lumii Provador Lincoln (Cloud Run versão final)
import express from "express";
import cors from "cors";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { GoogleGenerativeAI } from "@google/generative-ai";

const app = express();
app.use(cors());
app.use(express.json({ limit: "50mb" }));

// === Configuração de diretórios ===
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const TEMP_DIR = path.join(__dirname, "assets/temp");
if (!fs.existsSync(TEMP_DIR)) fs.mkdirSync(TEMP_DIR, { recursive: true });

// === Configuração do modelo Gemini ===
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

// === Rotas ===
app.get("/", (req, res) => {
  res.status(200).send("✅ Lumii Provador ativo e rodando no Cloud Run!");
});

app.post("/tryon", async (req, res) => {
  try {
    const { fotoPessoa, fotoRoupa } = req.body;
    if (!fotoPessoa || !fotoRoupa)
      return res.status(400).json({ success: false, message: "Faltam imagens." });

    const prompt = `
Fotografia realista de corpo inteiro.
Aplique fielmente a roupa fornecida sobre a pessoa enviada, mantendo textura, forma e iluminação originais.
Cenário neutro, iluminação suave.`;

    const result = await model.generateContent([
      { text: prompt },
      { inlineData: { mimeType: "image/png", data: fotoPessoa } },
      { inlineData: { mimeType: "image/png", data: fotoRoupa } },
    ]);

    const response = await result.response;
    const imagePart = response.candidates?.[0]?.content?.parts?.find(p => p.inlineData);
    if (!imagePart) throw new Error("Não foi possível gerar a imagem.");

    const base64 = imagePart.inlineData.data;
    const filename = `provador_${Date.now()}.png`;
    const filepath = path.join(TEMP_DIR, filename);
    fs.writeFileSync(filepath, Buffer.from(base64, "base64"));

    res.json({ success: true, image: `data:image/png;base64,${base64}` });
  } catch (e) {
    console.error(e);
    res.status(500).json({ success: false, message: e.message });
  }
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log(`🚀 Servidor ativo na porta ${PORT}`));