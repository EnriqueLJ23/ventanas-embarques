# Rol Guardia, destinatarios por usuario y fix de búsqueda Entra ID — Diseño (2026-07-07)

## Contexto

El usuario reportó que el flujo de negocio de programación de citas (ver `docs/superpowers/plans/2026-07-03-flow-completion-admin-rework-users.md`) parecía incompleto. Una investigación línea por línea confirmó que casi todo lo pedido ya está implementado (campos de Operador/Placas/Tipo de operación en la creación de ventana, correo de llegada, escalación de retrasos a 15/30/45/60 min, catálogo de motivos de retraso, los 17 indicadores de reportes). Los gaps reales encontrados y confirmados con el usuario son los cuatro cubiertos por este documento. Además, el buscador de usuarios de Entra ID (`UserSearchCombobox`) tiene el input bloqueado y no permite escribir.

## 1. Fix: buscador de Entra ID bloqueado

**Causa raíz:** `UserSearchCombobox` (`app/components/admin/UserSearchCombobox.tsx`) envuelve el `Input` en un `PopoverTrigger` y el panel de resultados en `PopoverContent` (Radix `Popover`, con `Portal` propio). Este combobox siempre se usa dentro de un `Dialog` modal (`CrudFormDialog`). Radix `Dialog` modal atrapa el foco del teclado en su propio `FocusScope`; el `Popover` porta su contenido a `document.body` como nodo hermano y también gestiona foco al abrir/cerrar. Cuando el estado `open` del Popover cambia en cada tecleo (el debounce resuelve el fetch y llama `setOpen(true)`), ambos mecanismos de foco compiten, lo que se percibe como "no puedo escribir en el input".

**Fix:** eliminar el uso de `Popover`/`PopoverContent` en este componente. El panel de resultados se reemplaza por un `<div>` normal, posicionado con `absolute` respecto a un contenedor `relative` que envuelve el `Input`, mostrado/ocultado con el mismo estado `open` que ya existe. Sin portal, sin `FocusScope` propio — el input queda en el flujo de foco normal del `Dialog`. El comportamiento visual (loading / sin resultados / lista de resultados / mensaje de directorio no disponible) se mantiene igual.

Este cambio es local a `UserSearchCombobox.tsx` y no afecta el uso de `Popover` en cualquier otro lugar de la app (no se toca `ui/popover.tsx` ni `ui/dialog.tsx`).

## 2. Rol GUARDIA

**Modelo:** se agrega `GUARDIA` al enum `Role` en `prisma/schema.prisma` (migración nueva).

**Acceso:**
- `/admin/usuarios`: el `Select` de rol ya es una lista derivada de `ROLES`/`ROLE_LABELS` en `app/routes/admin/users.tsx` — se agrega `GUARDIA: "Guardia"` a ambas listas. Sin cambios estructurales.
- `/checkin/:id` (`app/routes/checkin.tsx:15`): `requireUser(request, ["CARGA", "DESCARGA", "ADMINISTRADOR"])` pasa a incluir `"GUARDIA"`. La página ya es una card simple mobile-first — no requiere cambios de UI.
- El QR generado (`app/lib/qr.ts` → `buildCheckinUrl`) ya apunta a `/checkin/:id`; un guardia solo necesita una cuenta con este rol y la cámara del teléfono para abrir el enlace del QR. No se crea una ruta nueva de escaneo.

**Landing (`_root.tsx`):** se agrega una rama para `role === "GUARDIA"` que muestra únicamente el mensaje "Escanea el código QR de la unidad para registrar su llegada." (sin lista de ventanas, sin accesos a otras secciones).

**Sidebar (`AppSidebar.tsx`):** el guardia no debe ver "Calendario" (no le corresponde crear/ver citas), solo un "Inicio" reducido. Se filtra `operationItems` para excluir "Calendario" cuando `role === "GUARDIA"`.

## 3. Destinatarios de notificación por usuario del sistema

**Modelo:** en `NotificationRecipient` (`prisma/schema.prisma`), se reemplaza el campo `email: String` por `userId: Int` con relación a `User`, y el índice único pasa de `[event, email]` a `[event, userId]`. Migración de Prisma incluida; como no hay recipients sembrados por defecto (`seed.ts` no inserta ninguno), no hay datos existentes que migrar.

**API (`app/routes/api/notification-recipients.ts`):**
- `POST` recibe `{ event, userId }` en vez de `{ event, email }`.
- `loader` incluye `user: { select: { id, name, email, active } }` para poder mostrar nombre/correo en la tabla admin.

**UI (`app/routes/admin/notifications.tsx`):**
- El `loader` también carga `prisma.user.findMany({ where: { active: true }, orderBy: { name: "asc" } })`.
- El `Input` de correo libre se reemplaza por un `Select` de usuarios activos (mostrando `"{name} — {email}"`), igual patrón que el `Select` de rol ya usado en otros diálogos de admin (sin combobox de búsqueda, sin riesgo del bug de la sección 1).
- La tabla de destinatarios muestra nombre + correo del usuario relacionado en vez del campo `email` plano.

**Server (`app/lib/notificationRecipients.server.ts`):** `getRecipientEmails(event)` hace `include: { user: true }`, filtra `active: true` Y `user.active: true`, y devuelve `user.email`.

## 4. Fix cosmético en reportes

`app/routes/reports.tsx:221` usa `row.category` como `key` en la tabla "Retrasos por motivo", pero `computeRetrasos()` (`app/lib/reportIndicators.ts`) devuelve objetos con `id`, no `category`. Se corrige a `row.id`.

## Verificación

Antes de dar por cerrado el trabajo, se levanta el entorno de desarrollo local y se navega manualmente: creación de ventana (confirmar que el select Carga/Descarga se ve y funciona), creación de un usuario Guardia y acceso a `/checkin/:id` con ese rol, alta de un destinatario de notificación seleccionando un usuario del sistema, y uso del buscador de Entra ID dentro del diálogo de nuevo usuario para confirmar que el input ya permite escribir.

## Fuera de alcance

- No se modela "Embarques"/"Almacén" como departamentos — el admin asigna destinatarios individualmente por usuario y evento.
- No se cambia el punto del flujo en que se captura el motivo de retraso (sigue siendo al completar la ventana).
- No se agrega un lector de QR con cámara embebido en la app — se asume que el guardia usa la app de cámara del teléfono para abrir el enlace del QR.
- No se investiga ni corrige la causa raíz de por qué el ambiente de Portainer podría no mostrar el select de Tipo de operación (posible imagen desactualizada); solo se confirma que el código fuente sí lo tiene.
