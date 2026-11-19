/**
 * Montagem e pré-validação do pedido de exportação (contrato em docs/API.md).
 * Módulo puro: os mesmos limites do backend são checados aqui para dar
 * uma mensagem clara ANTES de chamar o servidor.
 */
import { VOLUME } from '../config.js';
import { ticksToSeconds } from './timing.js';
import { volumeToGain } from './volume.js';

export const EXPORT_LIMITS = Object.freeze({ MAX_TOTAL_SECONDS: 600, MAX_EVENTS: 5000 });

/**
 * @returns {{ ok: true, payload: object } | { ok: false, error: string }}
 */
export function buildExportPayload(sequence, { bpm, loop, loops, volumes = {} }, format = 'mp3') {
  // gain = volume do mixer na curva perceptiva (100 % → 1). A calibração entre instrumentos é feita no servidor.
  const events = sequence.toEvents(bpm).map((event) => ({
    ...event,
    gain: Math.round(volumeToGain(volumes[event.instrument] ?? VOLUME.DEFAULT) * 10000) / 10000,
  }));
  if (events.length === 0) {
    return { ok: false, error: 'Adicione pelo menos uma nota antes de exportar.' };
  }
  if (events.length > EXPORT_LIMITS.MAX_EVENTS) {
    return { ok: false, error: `Sequência com notas demais (${events.length}; máximo ${EXPORT_LIMITS.MAX_EVENTS}).` };
  }

  // Uma passada vai até o FIM da música (fim da última nota ou pausa), igual ao play.
  const length = ticksToSeconds(sequence.endTick(), bpm);
  const repetitions = loop ? loops : 1;
  const total = length * repetitions;
  if (total > EXPORT_LIMITS.MAX_TOTAL_SECONDS) {
    return {
      ok: false,
      error: `O áudio teria ${Math.round(total)} s (máximo ${EXPORT_LIMITS.MAX_TOTAL_SECONDS} s). `
        + 'Reduza os loops ou os compassos, ou aumente o BPM.',
    };
  }

  return { ok: true, payload: { bpm, length, loop, loops, format, events } };
}

/** Extrai uma mensagem legível da resposta de erro do FastAPI. */
export function describeApiError(status, body) {
  const detail = body && body.detail;
  if (Array.isArray(detail) && detail.length > 0) {
    const first = detail[0];
    const message = String(first.msg ?? 'dados inválidos').replace(/^Value error,\s*/i, '');
    const where = Array.isArray(first.loc) ? first.loc.filter((part) => part !== 'body').join('.') : '';
    return where ? `${message} (${where})` : message;
  }
  if (typeof detail === 'string' && detail) return detail;
  return `O servidor respondeu com erro ${status}.`;
}

/** Nome do arquivo a partir do cabeçalho Content-Disposition. */
export function filenameFromDisposition(header, fallback) {
  const match = /filename="?([^";]+)"?/i.exec(header ?? '');
  return match ? match[1] : fallback;
}
