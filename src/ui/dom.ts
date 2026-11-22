// 极简 DOM 构建辅助
import { icons } from './icons'

type ElMap = HTMLElementTagNameMap

export const h = <K extends keyof ElMap>(
  tag: K,
  attrs: Record<string, string> = {},
  ...children: (Node | string)[]
): ElMap[K] => {
  const el = document.createElement(tag)
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') el.className = v
    else el.setAttribute(k, v)
  }
  for (const c of children) {
    el.append(c instanceof Node ? c : document.createTextNode(c))
  }
  return el
}

export const pageHead = (title: string, desc: string): HTMLElement =>
  h('div', { class: 'page-head' }, h('h1', {}, title), h('p', {}, desc))

export const empty = (title: string, sub: string): HTMLElement =>
  h('div', { class: 'empty card' }, h('span', { class: 'empty-ico' }, icons.empty), h('div', { class: 't' }, title), h('div', { class: 's' }, sub))

export const clearNode = (node: HTMLElement): void => {
  node.innerHTML = ''
}

export const num = (input: HTMLInputElement, fallback: number): number => {
  const v = parseFloat(input.value)
  return Number.isFinite(v) ? v : fallback
}

export const fmt = (v: number, digits = 3): string => {
  if (!Number.isFinite(v)) return '-'
  return v.toFixed(digits)
}

export const verdictLabel: Record<string, string> = {
  pass: '合格',
  fail: '超标',
  marginal: '临界'
}
