# Portainer/GitHub Deploy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make this repo deployable as a Portainer standalone-Docker stack built directly from GitHub, and push the repo to the existing GitHub remote, without breaking local development.

**Architecture:** One `docker-compose.yml` serves both local dev (`docker compose up --build`) and the Portainer stack (Stack → "Repository" method, same file). Runtime secrets move out of the Docker image and into environment variables — resolved from the local `.env` file for dev, and typed into Portainer's stack environment-variable editor for production. Port `5432` stays published in the repo (local dev needs it); in Portainer it gets removed manually, once, in the stack's compose editor before first deploy.

**Tech Stack:** Docker, Docker Compose, Portainer CE (standalone), Nginx Proxy Manager, GitHub.

## Global Constraints

- Do not commit real secret values (passwords, client secrets, session secrets) into any git-tracked file — only variable names and placeholders belong in `.env.example`.
- `docker-compose.yml` must stay a single file usable for both local dev and the Portainer stack (per user decision — no `docker-compose.prod.yml`).
- Local dev workflow (`npm run dev` on host + `docker compose up` for Postgres) must keep working after these changes.
- Production domain for OAuth/redirect purposes is `https://windows.tq1.com.mx`.

---

### Task 1: Stop baking `.env` into the Docker image

**Files:**
- Modify: `Dockerfile:48-52`

**Interfaces:**
- Consumes: nothing new
- Produces: an image that reads all config from container environment variables at runtime instead of a baked-in `.env` file — Task 2 relies on this (it wires those env vars through `docker-compose.yml`).

- [ ] **Step 1: Remove the `.env` copy from the Dockerfile**

Current lines 48-52:

```dockerfile
COPY --from=builder /app/package.json ./package.json

# Variables de entorno embebidas en la imagen
COPY --from=builder /app/.env ./.env

# Entrypoint: runs DB migrations then starts the server
```

Replace with:

```dockerfile
COPY --from=builder /app/package.json ./package.json

# Entrypoint: runs DB migrations then starts the server
```

- [ ] **Step 2: Verify the image builds without a `.env` file present**

```bash
mv .env .env.bak
docker build -t scheduler-verify .
mv .env.bak .env
```

Expected: `docker build` completes successfully (`Successfully tagged scheduler-verify:latest` or equivalent final `naming to docker.io/library/scheduler-verify` line), with no `COPY failed: file not found` error. This confirms the build no longer depends on a local `.env`, which matters because `.env` will not exist when Portainer clones the repo from GitHub.

- [ ] **Step 3: Commit**

```bash
git add Dockerfile
git commit -m "fix: stop baking .env into the Docker image"
```

---

### Task 2: Pass environment variables through docker-compose.yml, drop hardcoded Postgres password

**Files:**
- Modify: `docker-compose.yml`
- Modify: `.env` (local only — not committed, already gitignored)

**Interfaces:**
- Consumes: image built in Task 1 (no longer reads a baked `.env`)
- Produces: `app` service that receives `DATABASE_URL`, `SESSION_SECRET`, `MICROSOFT_CLIENT_ID`, `MICROSOFT_CLIENT_SECRET`, `MICROSOFT_TENANT_ID`, `MICROSOFT_REDIRECT_URI`, `MAIL_SENDER`, `ARRIVAL_NOTIFICATION_EMAIL` as container env vars at runtime; `postgres` service password now driven by `POSTGRES_PASSWORD` — Task 3's `.env.example` documents these same names.

- [ ] **Step 1: Replace `docker-compose.yml` with this content**

```yaml
services:

  app:
    build: .
    container_name: app-template-app
    ports:
      - "3025:3000"
    environment:
      DATABASE_URL: ${DATABASE_URL}
      SESSION_SECRET: ${SESSION_SECRET}
      MICROSOFT_CLIENT_ID: ${MICROSOFT_CLIENT_ID}
      MICROSOFT_CLIENT_SECRET: ${MICROSOFT_CLIENT_SECRET}
      MICROSOFT_TENANT_ID: ${MICROSOFT_TENANT_ID}
      MICROSOFT_REDIRECT_URI: ${MICROSOFT_REDIRECT_URI}
      MAIL_SENDER: ${MAIL_SENDER}
      ARRIVAL_NOTIFICATION_EMAIL: ${ARRIVAL_NOTIFICATION_EMAIL}
    depends_on:
      postgres:
        condition: service_healthy
    restart: unless-stopped

  postgres:
    image: postgres:16-alpine
    container_name: app-template-postgres
    ports:
      - "5432:5432"
    environment:
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
      POSTGRES_DB: app_template
    volumes:
      - postgres_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres -d app_template"]
      interval: 5s
      timeout: 5s
      retries: 10
    restart: unless-stopped

volumes:
  postgres_data:
```

Note: `5432:5432` stays published here on purpose — see Architecture above. It gets removed only inside Portainer's stack editor in Task 5, never in this file.

- [ ] **Step 2: Add `POSTGRES_PASSWORD` to your local `.env`**

Open `.env` and add a line `POSTGRES_PASSWORD=...` set to the same password that's already embedded in your local `DATABASE_URL` (so the `postgres` container keeps accepting the connection string the app already uses). Don't change `DATABASE_URL` itself — it already points at `postgres:5432`, which is correct for both the `app` container and, via the published port, for `npm run dev` on the host (through your existing `postgres` hosts-file mapping / Docker Desktop localhost passthrough).

- [ ] **Step 3: Verify the stack still builds and serves locally**

```bash
docker compose config --quiet
docker compose up --build -d
curl -I http://localhost:3025
docker compose logs app --tail 30
docker compose down
```

Expected: `docker compose config --quiet` prints nothing (valid, all variables resolved). `curl -I` returns an HTTP response (e.g. `HTTP/1.1 200 OK` or a redirect to `/login`), not a connection error. The log tail shows `▶ Aplicando migraciones de base de datos...` followed by `▶ Iniciando servidor...` with no crash.

- [ ] **Step 4: Commit**

```bash
git add docker-compose.yml
git commit -m "fix: inject env vars into app container, parameterize Postgres password"
```

(`.env` is gitignored and stays local — nothing to add there.)

---

### Task 3: Add `.env.example` as the variable reference for Portainer

**Files:**
- Create: `.env.example`

**Interfaces:**
- Consumes: variable names from Task 2's `docker-compose.yml`
- Produces: a git-tracked template used to fill in Portainer's stack environment-variable editor (Task 5) — no secret values.

- [ ] **Step 1: Create `.env.example`**

```bash
DATABASE_URL="postgresql://postgres:CHANGE_ME@postgres:5432/app_template"
SESSION_SECRET="CHANGE_ME"
POSTGRES_PASSWORD="CHANGE_ME"

MICROSOFT_CLIENT_ID="CHANGE_ME"
MICROSOFT_CLIENT_SECRET="CHANGE_ME"
MICROSOFT_TENANT_ID="CHANGE_ME"

# Local dev: http://localhost:3025/auth/callback
# Production (Portainer): https://windows.tq1.com.mx/auth/callback
MICROSOFT_REDIRECT_URI="CHANGE_ME"

MAIL_SENDER="no-reply@tq1.com.mx"

# Persona que recibe el aviso de "Unidad ingresó a planta"
ARRIVAL_NOTIFICATION_EMAIL="CHANGE_ME"
```

Note: `POSTGRES_PASSWORD` must match the password embedded in `DATABASE_URL` — they are two independent variables (Compose does not expand `${POSTGRES_PASSWORD}` inside another `.env` value), so whoever sets these (locally or in Portainer) has to keep them in sync by hand.

- [ ] **Step 2: Verify it's not accidentally ignored**

```bash
git check-ignore -v .env.example || echo "not ignored, good"
```

Expected: `not ignored, good` (the `.dockerignore` entry for `.env.example` only affects the Docker build context, not git).

- [ ] **Step 3: Commit**

```bash
git add .env.example
git commit -m "docs: add .env.example as the env var reference for Portainer"
```

---

### Task 4: Keep the nested git worktree and local Claude settings out of git

**Files:**
- Modify: `.gitignore`

**Interfaces:**
- Consumes: nothing
- Produces: a git status where `.claude/worktrees/` and `.claude/settings.local.json` never show as trackable — Task 5's push relies on this so the second worktree's full source tree doesn't get committed as plain duplicated files.

- [ ] **Step 1: Append to `.gitignore`**

Current content:

```
.DS_Store
.env
/node_modules/

# React Router
/.react-router/
/build/

/generated/prisma
```

New content:

```
.DS_Store
.env
/node_modules/

# React Router
/.react-router/
/build/

/generated/prisma

# Nested git worktree — has its own .git file, not meant to be tracked as plain files
.claude/worktrees/
.claude/settings.local.json
```

- [ ] **Step 2: Verify the worktree disappears from git status**

```bash
git status --short
```

Expected: `.claude/` no longer appears as `?? .claude/` in the raw form that would include the worktree — instead you should see `.claude/settings.json` (if untracked) listed individually, or nothing under `.claude/` if it's already tracked, but never a bare `.claude/` line that would sweep in `worktrees/`.

- [ ] **Step 3: Commit**

```bash
git add .gitignore
git commit -m "chore: exclude nested git worktree and local Claude settings from git"
```

---

### Task 5: Push to the existing GitHub repo

**Files:**
- None (git operations only)

**Interfaces:**
- Consumes: all commits from Tasks 1-4
- Produces: `master` branch pushed to `https://github.com/EnriqueLJ23/ventanas-embarques.git`, ready to be used as the source for a Portainer "Repository" stack.

- [ ] **Step 1: Add the remote**

```bash
git remote add origin https://github.com/EnriqueLJ23/ventanas-embarques.git
git remote -v
```

Expected: `origin` listed for both `fetch` and `push`.

- [ ] **Step 2: Check what the remote already has**

```bash
git ls-remote origin
```

Expected: either empty output (brand-new empty repo — proceed to Step 3 as-is), or a `refs/heads/...` list. If the remote already has commits that aren't ancestors of local `master` (e.g. an auto-generated README), stop and decide with the user whether to merge (`git pull origin main --allow-unrelated-histories`) or force-push — do not force-push without explicit confirmation.

- [ ] **Step 3: Stage and review remaining project files before the first push**

```bash
git add CLAUDE.md PROMPT_CLAUDE_CODE.md .wolf docs/superpowers/plans/2026-06-18-shipment-window-scheduler.md .claude/settings.json
git status --short
```

Expected: only intended files staged — no `.env`, no `node_modules`, no `.claude/worktrees/`. Show this list to the user before committing/pushing if anything looks unexpected.

- [ ] **Step 4: Commit and push**

```bash
git commit -m "chore: add remaining project docs and tooling config"
git push -u origin master
```

Expected: push succeeds, GitHub shows the `master` branch with the latest commit.

---

### Task 6: Configure the Portainer stack (manual, outside the repo)

**Files:**
- None (Portainer UI + Nginx Proxy Manager UI)

**Interfaces:**
- Consumes: `.env.example` (Task 3) as the variable checklist, pushed repo (Task 5)
- Produces: a running production stack reachable at `https://windows.tq1.com.mx`.

- [ ] **Step 1: Create the Stack in Portainer**

Portainer → Stacks → Add stack → Build method **Repository** → Repository URL `https://github.com/EnriqueLJ23/ventanas-embarques.git`, Reference `refs/heads/master`, Compose path `docker-compose.yml`.

- [ ] **Step 2: Load environment variables**

In the stack's "Environment variables" section, add every variable from `.env.example` with real production values. Use a newly generated `SESSION_SECRET` and a strong `POSTGRES_PASSWORD` (don't reuse the local dev ones). Set `MICROSOFT_REDIRECT_URI=https://windows.tq1.com.mx/auth/callback`. Keep `DATABASE_URL`'s password in sync with `POSTGRES_PASSWORD`.

- [ ] **Step 3: Remove the Postgres port publish before deploying**

In the stack's compose editor (after it loads the file from the repo, before clicking Deploy), delete the `ports: ["5432:5432"]` lines under the `postgres` service. This is a one-time manual edit — the repo keeps that port for local dev, per the Architecture note above.

- [ ] **Step 4: Deploy and verify**

Click "Deploy the stack". In Portainer, check both containers reach a healthy/running state, and check the `app` container logs for `▶ Iniciando servidor...` with no crash.

- [ ] **Step 5: Configure Nginx Proxy Manager**

Add a Proxy Host: Domain `windows.tq1.com.mx`, Forward Hostname/IP `<IP del host Docker>`, Forward Port `3025`. SSL tab → request a new Let's Encrypt certificate, enable "Force SSL". DNS A record is already confirmed pointing at this server.

- [ ] **Step 6: Register the production redirect URI in Entra ID**

In the Azure AD App Registration for `MICROSOFT_CLIENT_ID`, add `https://windows.tq1.com.mx/auth/callback` under Authentication → Redirect URIs. Without this, login will fail with an `AADSTS50011` redirect URI mismatch error.

- [ ] **Step 7: End-to-end check**

Visit `https://windows.tq1.com.mx`, confirm the certificate is valid, log in via Microsoft, and confirm the app loads past the dashboard.
