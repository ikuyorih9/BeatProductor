/** Comunicação com o backend (FastAPI). */
import { describeApiError, filenameFromDisposition } from '../core/export.js';

const EXPORT_TIMEOUT_MS = 120_000;

function apiUrl(path) {
  return new URL(path, document.baseURI).toString();
}

/**
 * Envia a sequência para renderização e devolve o arquivo gerado.
 * @returns {Promise<{ blob: Blob, filename: string }>}
 * @throws {Error} com mensagem pronta para exibir ao usuário
 */
export async function requestExport(payload) {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), EXPORT_TIMEOUT_MS);
  let response;
  try {
    response = await fetch(apiUrl('api/export'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
  } catch (error) {
    if (error.name === 'AbortError') throw new Error('O servidor demorou demais para gerar o áudio.');
    throw new Error('Servidor indisponível. Inicie o Beat Productor com scripts/run.ps1 (ou run.sh).');
  } finally {
    window.clearTimeout(timer);
  }

  if (!response.ok) {
    let body = null;
    try {
      body = await response.json();
    } catch {
      // corpo não-JSON (ex.: servidor estático sem a API)
    }
    if (response.status === 404 || response.status === 405 || response.status === 501) {
      throw new Error('API de exportação não encontrada. Abra o app pelo servidor do Beat Productor (scripts/run).');
    }
    throw new Error(describeApiError(response.status, body));
  }

  const blob = await response.blob();
  const extension = payload.format ?? 'mp3';
  const filename = filenameFromDisposition(response.headers.get('Content-Disposition'), `beat-productor.${extension}`);
  return { blob, filename };
}

/** Dispara o download de um Blob no navegador. */
export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  link.remove();
  // Mantém a URL viva tempo suficiente para o navegador iniciar o download.
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
