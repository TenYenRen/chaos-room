# Dockerfile for Activity: Chaos Room
FROM node:20-alpine

WORKDIR /app

# Install dependencies first for Docker layer caching
COPY package*.json ./
RUN npm install --production

# Copy application source code
COPY . .

# Expose server port
EXPOSE 3000

# Environment defaults
ENV PORT=3000
ENV NODE_ENV=production
ENV ADMIN_PIN=chaos2026

# Start server
CMD ["node", "server.js"]
