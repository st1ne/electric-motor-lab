/** Small DOM helpers for the vanilla UI. */

type Attrs = Record<string, string | number | boolean | undefined>;

/**
 * Create an element: h('button.seg.active', { 'aria-pressed': true }, 'Label', child).
 * The tag may carry `.class` suffixes; boolean attributes are set when true.
 */
export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K | `${K}.${string}`,
  attrs: Attrs = {},
  ...children: (Node | string | null | undefined)[]
): HTMLElementTagNameMap[K] {
  const [name, ...classes] = tag.split('.');
  const el = document.createElement(name as K);
  if (classes.length) el.className = classes.join(' ');
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === false) continue;
    el.setAttribute(k, v === true ? '' : String(v));
  }
  for (const c of children) {
    if (c === null || c === undefined) continue;
    el.append(c);
  }
  return el;
}

/** Set text only when it changed (avoids layout work and screen-reader chatter). */
export function setText(el: Element, text: string): void {
  if (el.textContent !== text) el.textContent = text;
}

export function setHtml(el: Element, html: string): void {
  if (el.innerHTML !== html) el.innerHTML = html;
}
