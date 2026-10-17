import type { DesignSpec, BrandKit } from './types';

export const getBrand = (id: string): Promise<BrandKit> => fetch(`/api/brand/${id}`).then((r) => r.json());

export async function editDesign(body: { brandId: string; spec: DesignSpec; instruction: string }): Promise<DesignSpec> {
  const r = await fetch('/api/edit', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const j = await r.json();
  if (!r.ok) throw new Error(j.error || 'edit failed');
  return j.spec;
}

export async function regenImage(body: { prompt: string; w: number; h: number; take?: number }): Promise<{ url: string }> {
  const r = await fetch('/api/image', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const j = await r.json();
  if (!r.ok) throw new Error(j.error || 'image failed');
  return j;
}

interface StreamHandlers {
  onStatus?: (d: { stage: string }) => void;
  onSpecs: (specs: DesignSpec[]) => void;
  onImage: (d: { specId: string; layerId: string; src?: string; error?: boolean }) => void;
  onDone?: () => void;
  onError?: (d: { error: string }) => void;
}

/** POST + Server-Sent-Events: layout arrives first, images stream in as they finish. */
export async function generateStream(
  body: { brandId: string; prompt: string; variations: number; presetId: string },
  h: StreamHandlers,
) {
  const res = await fetch('/api/generate/stream', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.body) throw new Error('no stream');
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    const frames = buf.split('\n\n');
    buf = frames.pop() || '';
    for (const f of frames) {
      const ev = /event: (.*)/.exec(f)?.[1];
      const dataLine = f.split('\n').find((l) => l.startsWith('data: '));
      if (!ev || !dataLine) continue;
      const data = JSON.parse(dataLine.slice(6));
      if (ev === 'specs') h.onSpecs(data.specs);
      else if (ev === 'image') h.onImage(data);
      else if (ev === 'status') h.onStatus?.(data);
      else if (ev === 'done') h.onDone?.();
      else if (ev === 'error') h.onError?.(data);
    }
  }
}
