# ── Stage 1: Build ───────────────────────────────────────────────
# Installs ALL deps (dev+prod), generates Prisma client, builds the app,
# then prunes devDeps so the final image stays lean.
FROM node:20-alpine AS builder

WORKDIR /app

# Native build tools needed by some npm packages
RUN apk add --no-cache python3 make g++

COPY package*.json ./

# Install everything (dev + prod) for the build step
RUN npm ci

# Copy source
COPY . .

# Generate the Prisma client for the linux/alpine target
RUN npx prisma generate

# Build the React Router app (Vite + Tailwind + SCSS)
RUN npm run build

# Remove devDependencies — prisma & dotenv survive because they are now
# in "dependencies" (not only devDependencies)
RUN npm prune --omit=dev

# ── Stage 2: Production runner ───────────────────────────────────
FROM node:20-alpine AS runner

WORKDIR /app

# tzdata: sin él, alpine ignora la variable TZ y el proceso corre en UTC
# (rompe el filtro por día del calendario y las horas de los correos)
RUN apk add --no-cache tzdata

ENV NODE_ENV=production
ENV PORT=3000

# Pruned node_modules includes the generated Prisma client (.prisma/)
COPY --from=builder /app/node_modules ./node_modules

# Built server + client assets
COPY --from=builder /app/build ./build

# Prisma schema + migration files (needed by `prisma migrate deploy`)
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/prisma.config.ts ./prisma.config.ts

# package.json is read by react-router-serve at startup
COPY --from=builder /app/package.json ./package.json

# Entrypoint: runs DB migrations then starts the server
COPY docker-entrypoint.sh ./docker-entrypoint.sh
RUN chmod +x ./docker-entrypoint.sh

EXPOSE 3000

ENTRYPOINT ["./docker-entrypoint.sh"]
