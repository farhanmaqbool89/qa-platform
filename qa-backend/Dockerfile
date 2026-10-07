# Multi-architecture Playwright image (supports both ARM64 and AMD64)
FROM mcr.microsoft.com/playwright:v1.50.0-noble

WORKDIR /app

# Set production environment
ENV NODE_ENV=production
ENV PORT=3000

# Install dependencies
COPY package*.json ./
RUN npm ci --omit=dev

# Copy application source code
COPY . .

# Generate Prisma Client
RUN npx prisma generate

# Ensure artifact storage directories exist
RUN mkdir -p artifacts/accessibility_scans tmp_runs data

EXPOSE 3000

# Start production server
CMD ["node", "index.js"]
