import { afterEach, describe, expect, it, vi } from 'vitest';
import { AiUnavailableError, generateJson } from '../src/ai';

const env = { GEMINI_API_KEY: 'k', GEMINI_MODEL: 'm' };
const ok = (obj: unknown) => new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: 'thinking...', thought: true }, { text: JSON.stringify(obj) }] } }] }), { status: 200 });

afterEach(() => vi.unstubAllGlobals());

describe('generateJson', () => {
  it('drops the thinking setting when the model rejects it, and ignores thought parts', async () => {
    const bodies: any[] = [];
    vi.stubGlobal('fetch', vi.fn(async (_u: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body));
      bodies.push(body);
      if (body.generationConfig.thinkingConfig) return new Response(JSON.stringify({ error: { message: 'Unknown field thinkingLevel' } }), { status: 400 });
      return ok({ a: 1 });
    }));
    expect(await generateJson(env, 'p', {})).toEqual({ a: 1 });
    expect(bodies.map((b) => !!b.generationConfig.thinkingConfig)).toEqual([true, false]);
  });

  it('retries once on a server timeout code, then gives a clear message', async () => {
    const f = vi.fn(async () => new Response('', { status: 524 }));
    vi.stubGlobal('fetch', f);
    await expect(generateJson(env, 'p', {})).rejects.toThrow(/busy or slow/);
    expect(f).toHaveBeenCalledTimes(2);
  });

  it('succeeds when the retry works', async () => {
    let n = 0;
    vi.stubGlobal('fetch', vi.fn(async () => (n++ === 0 ? new Response('', { status: 503 }) : ok({ b: 2 }))));
    expect(await generateJson(env, 'p', {})).toEqual({ b: 2 });
  });

  it('reports a missing key', async () => {
    await expect(generateJson({ GEMINI_MODEL: 'm' }, 'p', {})).rejects.toBeInstanceOf(AiUnavailableError);
  });
});
