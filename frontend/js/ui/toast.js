/** Mensagens temporárias (feedback ao usuário). */
import { byId, createElement } from './dom.js';

const DURATION_MS = { info: 2600, success: 3200, error: 6000 };

export function showToast(message, type = 'info') {
  const area = byId('toast-area');
  const toast = createElement('div', `toast toast-${type}`, { role: type === 'error' ? 'alert' : 'status', text: message });
  area.appendChild(toast);
  window.setTimeout(() => toast.remove(), DURATION_MS[type] ?? DURATION_MS.info);
}
