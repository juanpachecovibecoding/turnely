FROM node:20-slim

# System dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    git \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy dependency specifications
COPY package*.json ./

# Install dependencies clean
RUN npm install --omit=dev

# Copy project source
COPY . .

# Ensure data directory exists
RUN mkdir -p data/auth

# Port configuration
EXPOSE 3000

ENV PORT=3000
ENV NODE_ENV=production

CMD ["node", "server.js"]
