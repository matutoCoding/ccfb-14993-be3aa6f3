// 统一线性图标：1.75 线宽、圆角端点、24 视口，默认继承 currentColor
const wrap = (paths: string): string =>
  `<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">${paths}</svg>`

export const icons = {
  vehicle: wrap('<path d="M5 11l1.5-4.5A2 2 0 0 1 8.4 5h7.2a2 2 0 0 1 1.9 1.5L19 11"/><rect x="3" y="11" width="18" height="6" rx="2"/><circle cx="7.5" cy="17.5" r="1.5"/><circle cx="16.5" cy="17.5" r="1.5"/>'),
  surface: wrap('<path d="M3 16c3-6 6-9 9-9s6 3 9 9"/><path d="M3 20h18"/><circle cx="12" cy="8" r="1.2"/>'),
  station: wrap('<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 7h8M8 11h8M8 15h5"/>'),
  analysis: wrap('<path d="M4 19V5"/><path d="M4 19h16"/><rect x="7" y="12" width="3" height="4"/><rect x="12" y="9" width="3" height="7"/><rect x="17" y="6" width="3" height="10"/>'),
  batch: wrap('<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 9h18M8 4v16"/>'),
  settings: wrap('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-2.7 1.1V21a2 2 0 1 1-4 0v-.1A1.6 1.6 0 0 0 7 19.4l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1A1.6 1.6 0 0 0 3 14H3a2 2 0 1 1 0-4h.1A1.6 1.6 0 0 0 4.6 7l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1A1.6 1.6 0 0 0 10 3V3a2 2 0 1 1 4 0v.1A1.6 1.6 0 0 0 17 4.6l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0 1.1 2.7H21a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1z"/>'),
  empty: wrap('<circle cx="12" cy="12" r="9"/><path d="M9 12h6"/>')
}

export type IconName = keyof typeof icons
