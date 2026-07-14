/**
 * Escapa texto libre (nombre de operador, placas, etc.) antes de
 * interpolarlo en el HTML de los correos de notificación.
 */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
