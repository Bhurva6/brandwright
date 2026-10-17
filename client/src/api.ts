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

async function post<T>(path: string, body: unknown): Promise<T> {
  const r = await fetch(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const j = await r.json();
  if (!r.ok) throw new Error(j.error || path + ' failed');
  return j;
}

export const runCritic = (body: { brandId: string; spec: DesignSpec }) => post<{ score: CriticScore }>('/api/critic', body);
export const runRemix = (body: { brandId: string; refId: string; n: number; presetId?: string }) => post<{ specs: DesignSpec[] }>('/api/remix', body);
export const runAdapt = (body: { brandId: string; spec: DesignSpec; presetId: string }) => post<{ spec: DesignSpec }>('/api/adapt', body);
export const runReskin = (body: { spec: DesignSpec; toBrandId: string }) => post<{ spec: DesignSpec }>('/api/reskin', body);
export const runAutofix = (body: { brandId: string; spec: DesignSpec }) =>
  post<{ improved: boolean; before: CriticScore; after?: CriticScore; spec: DesignSpec }>('/api/autofix', body);
export const runRefresh = (body: { brandId: string; spec: DesignSpec; n: number }) => post<{ specs: DesignSpec[] }>('/api/refresh', body);

export interface CriticScore {
  total: number;
  dimensions: Record<string, number>;
  findings: { dimension: string; severity: string; message: string; layerId?: string }[];
  insight?: string;
  pass: boolean;
}

interface StreamHandlers {
  onStatus?: (d: { stage: string }) => void;
  onSpecs: (specs: DesignSpec[]) => void;
  onImage: (d: { specId: string; layerId: string; src?: string; error?: boolean }) => void;
  onScore?: (d: { specId: string; score: CriticScore }) => void;
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
      else if (ev === 'score') h.onScore?.(data);
      else if (ev === 'status') h.onStatus?.(data);
      else if (ev === 'done') h.onDone?.();
      else if (ev === 'error') h.onError?.(data);
    }
  }
}
