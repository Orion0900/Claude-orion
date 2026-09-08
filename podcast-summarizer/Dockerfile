FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:22-alpine
WORKDIR /app
# ffmpeg lets the OpenAI transcription path split long episodes.
RUN apk add --no-cache ffmpeg
ENV NODE_ENV=production PORT=8787 DATA_DIR=/data
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY --from=build /app/dist ./dist
VOLUME /data
EXPOSE 8787
CMD ["node", "dist/server/index.js"]
