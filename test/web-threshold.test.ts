import { expect, it } from 'vitest';
import { diffText, isMeaningful } from '../src/web';

it('treats a single new case-study title as a real change', () => {
  const before = 'Shopify store for a sneaker brand with custom product configurator';
  const after = 'New: headless Shopify Plus replatform for an outdoor retailer\n' + before;
  expect(isMeaningful(diffText(before, after))).toBe(true);
});
