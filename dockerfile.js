// JavaScript Document
# Lumii Provador - Dockerfile
FROM node:20
WORKDIR /app
COPY package*.json ./
RUN npm install --omit=dev
COPY . .
CMD ["node", "index.js"]
EXPOSE 8080