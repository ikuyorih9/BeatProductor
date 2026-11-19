/**
 * Salvamento automático do projeto no navegador (localStorage).
 * Falhas (modo privado, cota cheia, armazenamento bloqueado) são silenciosas:
 * o app continua funcionando, apenas sem lembrar o projeto.
 */
import { STORAGE_KEY } from '../config.js';
import { parseProject, serializeProject } from '../core/project.js';

export function loadProject() {
  try {
    return parseProject(window.localStorage.getItem(STORAGE_KEY));
  } catch {
    return null;
  }
}

export function saveProject(settings, sequence) {
  try {
    window.localStorage.setItem(STORAGE_KEY, serializeProject(settings, sequence));
    return true;
  } catch {
    return false;
  }
}

/** Cria uma função de salvamento com atraso (agrupa várias mudanças seguidas). */
export function createAutosave(save, delayMs = 400) {
  let timer = null;
  const flush = () => {
    if (timer !== null) window.clearTimeout(timer);
    timer = null;
    save();
  };
  window.addEventListener('pagehide', () => {
    if (timer !== null) flush();
  });
  return () => {
    if (timer !== null) window.clearTimeout(timer);
    timer = window.setTimeout(flush, delayMs);
  };
}
