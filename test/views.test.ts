// Guards on the rendered markup. Both of these were reported as bugs after the UI
// rebuild, so they are pinned here rather than left to a browser check.

import { describe, expect, it } from 'vitest';
import { FollowupActions, FollowupMenu } from '../src/views/layout';

const render = (node: unknown) => String(node);

describe('follow-up actions', () => {
  const html = render(FollowupActions({ agencyId: 7, hasFollowup: true, back: '/', today: '2026-10-27' }));
  // Everything before <details> is on the row; everything after is inside the menu.
  // Asserting on the whole string would pass even with a preset hidden in the menu,
  // which is exactly the regression this guards against.
  const onTheRow = html.slice(0, html.indexOf('<details'));

  it('shows all three presets as buttons on the row, not hidden in the menu', () => {
    // Chabert asked for Done, Snooze 3 days and Snooze 1 week visible.
    expect(html).toContain('<details');
    for (const label of ['Done', 'Snooze 3 days', 'Snooze 1 week']) {
      expect(onTheRow).toContain(label);
    }
  });

  it('posts the action each row button stands for', () => {
    for (const action of ['done', 'snooze3', 'snooze7']) {
      expect(onTheRow).toContain(`value="${action}"`);
    }
  });

  it('keeps the rest behind the menu', () => {
    expect(html).toContain('Clear follow-up');
    expect(html).toContain('Log a meeting');
    expect(html).toContain('value="reschedule"');
  });

  it('offers only the menu when there is no follow-up to act on', () => {
    const none = render(FollowupActions({ agencyId: 7, hasFollowup: false, back: '/', today: '2026-10-27' }));
    expect(none).not.toContain('value="done"');
    expect(none).not.toContain('value="snooze3"');
    expect(none).toContain('Log a meeting');
  });

  it('repeats the full set in the menu, which is the only control on a desktop table row', () => {
    const menu = render(FollowupMenu({ agencyId: 7, hasFollowup: true, back: '/', today: '2026-10-27' }));
    for (const label of ['Done', 'Snooze 3 days', 'Snooze 1 week', 'Clear follow-up']) {
      expect(menu).toContain(label);
    }
  });
});
