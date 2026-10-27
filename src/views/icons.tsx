// The icon set from the design system: 24px grid, 1.6 stroke, currentColor.
// Inline SVG, because an <img> cannot inherit the colour of the badge it sits in.
//
// These are emitted with raw() rather than JSX: hono wraps the children of an <svg>
// element in a namespace context node, which makes dangerouslySetInnerHTML throw, and
// writing two dozen icons out as JSX elements is a lot of markup for no gain.

import { raw } from 'hono/html';
import type { FC } from 'hono/jsx';

const SHAPES: Record<string, string> = {
  today: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M8 3v4M16 3v4M3 10h18M9 15l2 2 4-4"/>',
  dashboard: '<path d="M3 3v18h18"/><rect x="7" y="11" width="3" height="6" rx="1"/><rect x="12.5" y="7" width="3" height="10" rx="1"/><rect x="18" y="13" width="3" height="4" rx="1"/>',
  agencies: '<path d="M3 21h18M5 21V5a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v16M15 9h2a2 2 0 0 1 2 2v10M9 7h2M9 11h2M9 15h2"/>',
  add: '<circle cx="12" cy="12" r="9"/><path d="M12 8v8M8 12h8"/>',
  import: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M12 3v13M7 8l5-5 5 5"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.6-3.6"/>',
  overdue: '<path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0zM12 9v4M12 17h.01"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M8 3v4M16 3v4M3 10h18"/>',
  done: '<circle cx="12" cy="12" r="9"/><path d="m8.5 12.2 2.4 2.4 4.6-4.6"/>',
  check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
  hot: '<path d="M12 22c4 0 7-2.7 7-6.5 0-2.3-1.1-4.2-2.5-5.8-.4 1.1-1.2 1.9-2 2.2.3-2.5-.8-5.4-3.4-7.9-.4 2.6-2 4-3.3 5.4C6.1 11.2 5 13.2 5 15.5 5 19.3 8 22 12 22z"/>',
  warm: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  cold: '<path d="M12 2v20M4.2 6.5l15.6 11M19.8 6.5 4.2 17.5"/>',
  chevronDown: '<path d="m6 9 6 6 6-6"/>',
  chevronLeft: '<path d="m15 18-6-6 6-6"/>',
  chevronRight: '<path d="m9 18 6-6-6-6"/>',
  website: '<path d="M15 3h6v6M10 14 21 3M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>',
  note: '<path d="M4 4h16v12l-4 4H4zM20 16h-4v4M8 9h8M8 13h5"/>',
  trend: '<path d="M3 17l6-6 4 4 7-7M14 8h6v6"/>',
  filter: '<path d="M3 5h18l-7 8v6l-4 2v-8z"/>',
  close: '<path d="M18 6 6 18M6 6l12 12"/>',
  edit: '<path d="M4 20h4l10.5-10.5a2.1 2.1 0 0 0-3-3L5 17v3z"/>',
  more: '<circle cx="5" cy="12" r="1.3" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.3" fill="currentColor" stroke="none"/><circle cx="19" cy="12" r="1.3" fill="currentColor" stroke="none"/>',
};

export type IconName = keyof typeof SHAPES;

export const Icon: FC<{ name: IconName; lg?: boolean; sm?: boolean }> = ({ name, lg, sm }) => {
  const shape = SHAPES[name];
  if (!shape) return null;
  const style = sm ? ' style="width:13px;height:13px"' : '';
  return raw(`<svg class="i${lg ? ' lg' : ''}"${style} viewBox="0 0 24 24" aria-hidden="true">${shape}</svg>`);
};

// The wordmark: a triangle with a smaller one knocked out of its base, so the notch
// is transparent and the mark sits on any surface.
export const Mark: FC<{ size?: number }> = ({ size = 24 }) =>
  raw(
    `<svg width="${size}" height="${size}" viewBox="0 0 24 24" aria-hidden="true" style="flex:none">` +
      '<path fill="var(--brand)" fill-rule="evenodd" d="M12 2.5 22.5 21H1.5zM12 11.5 7 21h10z"/></svg>',
  );
