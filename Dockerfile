# Lumii Provador — Dockerfile oficial
FROM node:18-alpine

# Define o diretório de trabalho dentro do container
WORKDIR /app

# Copia os arquivos de dependências e instala apenas o necessário para produção
COPY package*.json ./
RUN npm install --production

# Copia o restante do código do projeto
COPY . .

# Expõe a porta usada pelo Express
EXPOSE 8080

# Comando padrão para iniciar o servidor
CMD ["node", "index.js"]
