/** Utilitários de DOM. */

/** Busca um elemento por id e falha cedo (com mensagem clara) se não existir. */
export function byId(id) {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Elemento #${id} não encontrado no HTML`);
  return element;
}

/** Cria um elemento com classes e atributos opcionais. */
export function createElement(tag, className = '', attributes = {}) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  for (const [name, value] of Object.entries(attributes)) {
    if (name === 'text') element.textContent = value;
    else element.setAttribute(name, value);
  }
  return element;
}
