# Deploy a Portainer vía GitHub — Diseño (2026-07-07)

## Contexto

El proyecto (React Router v7 SSR + Postgres/Prisma, dockerizado) se va a desplegar en un
servidor con Portainer (Docker standalone, sin Swarm), detrás de una instancia existente de
Nginx Proxy Manager (NPM) que ya maneja TLS/Let's Encrypt para otros servicios. El dominio
`windows.tq1.com.mx` ya está registrado y su registro DNS tipo A ya apunta a la IP pública del
servidor. El código se sube a un repo de GitHub ya existente:
`https://github.com/EnriqueLJ23/ventanas-embarques.git`. Portainer construirá la imagen
directamente desde ese repo (Stack → método "Repository"), sin GitHub Actions ni registry
externo.

## Problema encontrado

El `Dockerfile` actual copia `.env` completo dentro de la imagen final
(`COPY --from=builder /app/.env ./.env`). `.env` está en `.gitignore`, así que al clonar desde
GitHub ese archivo no existe → el build de Portainer fallaría en ese paso. Además, hornear
secretos en capas de imagen es mala práctica de por sí. `docker-compose.yml` tampoco declara
ninguna variable de entorno para el servicio `app`; hoy todo depende del `.env` horneado.

## Cambios

### Dockerfile
Eliminar la línea `COPY --from=builder /app/.env ./.env`. Los env vars llegan en runtime,
inyectados por Portainer.

### docker-compose.yml
- `app`: agregar bloque `environment` que referencia `${VAR}` para cada variable necesaria
  (Portainer las resuelve desde su editor de variables del stack).
- `postgres`: password fijo `"1234"` → `${POSTGRES_PASSWORD}`.
- `DATABASE_URL` del `app` construida contra el servicio interno `postgres` (nombre DNS del
  compose network), usando `${POSTGRES_PASSWORD}`.
- El mapeo `5432:5432` de `postgres` **se mantiene en el repo** — `DATABASE_URL` usa el hostname
  `postgres`, que solo resuelve dentro de la red de Docker; el flujo local de `npm run dev`
  (proceso en el host, fuera de Docker) depende de ese puerto publicado para alcanzar la base de
  datos. Un único `docker-compose.yml` sirve para dev y para el stack de Portainer.
- En Portainer, **después de que el stack se cree desde el repo**, editar el compose directamente
  en el editor de Portainer para borrar la línea `ports: ["5432:5432"]` del servicio `postgres`
  antes de desplegar — la base de datos de producción no debe quedar expuesta al host/internet.
  Este ajuste vive solo en Portainer (no en git): como no hay webhook de auto-redeploy
  configurado (ver "Fuera de alcance"), un futuro `git pull` manual del stack no lo revierte
  sin que el usuario lo note.
- `app` mantiene `3025:3000` publicado al host, como el usuario ya viene operando con NPM (en
  vez de unir contenedores a la red Docker de NPM — decisión explícita del usuario por
  practicidad; NPM seguirá apuntando a `IP-DEL-HOST:3025`).

### `.env.example`
Actualizar la plantilla (sin secretos, si trackeada en git) con todas las variables requeridas,
incluyendo `MICROSOFT_REDIRECT_URI=https://windows.tq1.com.mx/auth/callback` y
`POSTGRES_PASSWORD`. Sirve como referencia al llenar el editor de variables de Portainer.

### `.gitignore`
Agregar:
- `.claude/worktrees/` — es un git worktree real anidado dentro del árbol del proyecto
  (`.claude/worktrees/shipment-window-scheduler`, rama `worktree-shipment-window-scheduler`).
  Sin excluirlo, quedaría trackeado como archivos planos duplicados.
- `.claude/settings.local.json` — configuración local por convención.

## Fuera del repo (pasos externos, no código)

1. **Portainer**: crear Stack con método "Repository" apuntando al repo de GitHub, rama
   `master`, path `docker-compose.yml`. Cargar las variables de entorno (de `.env.example`) en
   el editor de Portainer, con valores de producción — `SESSION_SECRET` nuevo y fuerte (no
   reusar el de desarrollo), `POSTGRES_PASSWORD` fuerte,
   `MICROSOFT_REDIRECT_URI=https://windows.tq1.com.mx/auth/callback`. Antes de desplegar, borrar
   en el editor de Portainer la línea `ports: ["5432:5432"]` del servicio `postgres` (ver sección
   docker-compose.yml arriba).
2. **Nginx Proxy Manager**: nuevo Proxy Host, dominio `windows.tq1.com.mx`, forward a
   `IP-DEL-HOST:3025`, SSL con Let's Encrypt, Force SSL habilitado.
3. **Azure AD / Entra ID**: agregar `https://windows.tq1.com.mx/auth/callback` como Redirect URI
   en el App Registration usado por `MICROSOFT_CLIENT_ID` — si no, el login OAuth fallará en
   producción.

## Push a GitHub

- Configurar `origin` → `https://github.com/EnriqueLJ23/ventanas-embarques.git`.
- Revisar qué queda trackeado antes del primer commit (evitar `.env`, worktree duplicado,
  `node_modules`, `build/`).
- Commit y push de la rama `master`.

## Fuera de alcance

- CI/CD con GitHub Actions o registry externo (GHCR/Docker Hub) — el usuario prefiere que
  Portainer construya directamente desde el repo.
- Unir el contenedor `app` a la red Docker de NPM — el usuario prefiere seguir publicando el
  puerto al host, como ya lo hace con otros servicios.
- Webhook de auto-redeploy de Portainer — no solicitado; puede añadirse después sin cambios de
  arquitectura.
