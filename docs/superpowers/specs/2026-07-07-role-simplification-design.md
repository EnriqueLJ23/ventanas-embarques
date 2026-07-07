# Simplificación de roles y flujo de ventana — Diseño (2026-07-07)

## Contexto

Con la llegada por QR ya pública (sin login), el detalle de ventana ya no necesita botones de "Confirmar llegada" ni "Iniciar". El negocio pidió además simplificar la UI por rol: Ventas solo necesita el calendario; Carga y Descarga hacen exactamente lo mismo (capturar rollos/motivo de retraso y completar), así que se fusionan en un solo rol.

## Cambios

**1. Flujo de ventana simplificado:** Programada → Llegó a planta (QR) → Completada. Se elimina el paso manual "Iniciar" (`IN_PROGRESS` ya no se activa desde la UI) y su endpoint `/api/windows/:id/start`. "Completar" está disponible desde `ARRIVED`. El cálculo de retraso en `windows.$id.complete.ts` compara `actualEnd - actualArrival` contra `avgLoadTime` (antes usaba `actualStart`, que ya no se captura). El detalle de ventana muestra "Hora real de entrada" y "Hora real de salida".

**2. Rol `ALMACEN` reemplaza a `CARGA`/`DESCARGA`:** migración de Postgres recrea el enum `Role` (no se puede eliminar un valor de enum in-place) y remapea usuarios existentes. El tipo de operación (Carga/Descarga) sigue viviendo en `Window.type`, no en el rol del usuario.

**3. Navegación por rol (`AppSidebar.tsx`):**
- VENTAS: solo "Calendario".
- ALMACEN y GUARDIA: solo "Inicio".
- ADMINISTRADOR: todo, sin cambios.

**4. Restricciones de acceso reales (no solo visuales):**
- `/calendar` ahora requiere rol VENTAS o ADMINISTRADOR (antes cualquier usuario logueado).
- `/` (Inicio) para VENTAS redirige directo a `/calendar`; para ALMACEN muestra la lista de ventanas de hoy (antes filtrada por tipo según el rol CARGA/DESCARGA, ahora sin filtro ya que un solo rol ve ambos tipos).

**5. Indicadores de reportes:** se elimina "Tiempo promedio de espera" (llegada→inicio, ya no aplica). "Tiempo promedio de carga/descarga" ahora mide llegada→fin en vez de inicio→fin. El export a Excel usa la misma base (columna "Llegada real" en vez de "Inicio real").

## Fuera de alcance

- No se restringe `/windows/:id` por rol (Ventas puede seguir viendo el detalle de las ventanas que crea, de forma read-only en la práctica ya que las acciones están gateadas en el backend).
- No se toca el rol GUARDIA en sí (sigue existiendo, sin uso real desde que `/checkin/:id` es público, pero no se elimina).
