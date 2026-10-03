FROM node:22-bookworm-slim
WORKDIR /app
COPY package.json ./
COPY server ./server
COPY js ./js
COPY css ./css
COPY img ./img
COPY scripts ./scripts
COPY *.html ./
COPY data/shop.json ./data/shop.json
ENV NODE_ENV=production
ENV DATA_DIR=/app/data
EXPOSE 3000
CMD ["node", "server/index.js"]
