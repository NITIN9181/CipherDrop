FROM node:22-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install --legacy-peer-deps

COPY astro.config.mjs ./
COPY tsconfig.json ./
COPY public/ ./public/
COPY src/ ./src/

ENV NODE_ENV=production
RUN npm run build

EXPOSE 4321

ENV HOST=0.0.0.0
ENV PORT=4321

CMD ["node", "./dist/server/entry.mjs"]
