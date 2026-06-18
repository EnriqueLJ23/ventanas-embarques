#!/bin/sh
set -e

echo "▶ Aplicando migraciones de base de datos..."
npx prisma migrate deploy

echo "▶ Iniciando servidor..."
exec node_modules/.bin/react-router-serve ./build/server/index.js
