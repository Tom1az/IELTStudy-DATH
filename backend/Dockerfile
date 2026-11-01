# Node runs the .ts files directly, so there is no build step. Keep the version in step with
# ../.node-version.
FROM node:26.12.1-slim
ENV NODE_ENV=production
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY src ./src
USER node
EXPOSE 3000
CMD ["node", "src/server.ts"]
