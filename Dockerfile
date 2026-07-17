FROM node:20-slim
WORKDIR /app
COPY client/package.json client/package-lock.json client/
RUN cd client && npm ci --no-audit --no-fund
COPY client/ client/
RUN cd client && npm run build
COPY server/package.json server/package-lock.json server/
RUN cd server && npm ci --omit=dev --no-audit --no-fund
COPY server/ server/
ENV NODE_ENV=production PORT=8787
EXPOSE 8787
CMD ["node", "server/index.js"]
