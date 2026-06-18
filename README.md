# App Template

A production-ready full-stack starter: React Router v7 + Microsoft Entra ID login + email sending via MS Graph + Postgres/Prisma, fully dockerized.

## Features

- 🔒 Login with Microsoft Entra ID (MSAL, OAuth code flow)
- 🗄️ Postgres + Prisma (`@prisma/adapter-pg`)
- 📧 Generic `sendEmail` helper via MS Graph `sendMail`
- 🐳 Dockerized (multi-stage build + docker-compose with Postgres healthcheck)
- ⚡️ React Router v7 nested layouts, SSR, HMR
- 🎉 TailwindCSS v4 + shadcn (`components.json` configured, no components preinstalled — run `npx shadcn add <component>` as needed)

## Getting Started

### Development

```bash
npm install
npm run dev
```

Configure Entra ID app registration values and `SESSION_SECRET` in `.env` (see existing variables: `MICROSOFT_CLIENT_ID`, `MICROSOFT_CLIENT_SECRET`, `MICROSOFT_TENANT_ID`, `MICROSOFT_REDIRECT_URI`, `MAIL_SENDER`).

### Docker

```bash
docker compose up --build
```

This builds the app image, starts Postgres, runs `prisma migrate deploy`, and serves the app on `http://localhost:3010`.

## Building for Production

```bash
npm run build
```
