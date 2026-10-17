import { useEffect, useMemo, useState } from 'react';
import { DesignView } from './DesignView';
import { getBrand, generateStream } from './api';
import type { BrandKit, DesignSpec } from './types';

const EXAMPLES = [
  'Promote Xero as easy accounting for small businesses — get paid faster.',
  'Announce a free 30-day trial, friendly and confident.',
  'Payroll made simple, for cafe and salon owners.',
  'Switch to Xero and be up and running in under 4 hours.',
];

export default function App() {
  const [kit, setKit] = useState<BrandKit>();
  const [prompt, setPrompt] = useState('');
  const [variations, setVariations] = useState(4);
  const [presetId, setPresetId] = useState('square_1080');
  const [designs, setDesigns] = useState<DesignSpec[]>([]);
  const [status, setStatus] = useState<'idle' | 'thinking' | 'rendering'>('idle');
  const [error, setError] = useState('');

  useEffect(() => {
    getBrand('xero').then(setKit).catch(() => setError('Could not reach the server. Is it running on :8787?'));
  }, []);

  const busy = status !== 'idle';
  const logo = useMemo(() => kit?.assets.find((a) => a.category === 'logo' && a.variant === 'midnight'), [kit]);

  async function run(p = prompt) {
    if (!p.trim() || busy) return;
    setError('');
    setDesigns([]);
    setStatus('thinking');
    try {
      await generateStream(
        { brandId: 'xero', prompt: p, variations, presetId },
        {
          onSpecs: (specs) => {
            setDesigns(specs);
            setStatus('rendering');
          },
          onImage: ({ specId, layerId, src, error }) =>
            setDesigns((prev) =>
              prev.map((d) =>
                d.id !== specId
                  ? d
                  : { ...d, layers: d.layers.map((l) => (l.id === layerId ? { ...l, src, status: error ? 'error' : 'ready' } : l)) },
              ),
            ),
          onDone: () => setStatus('idle'),
          onError: (e) => {
            setError(e.error);
            setStatus('idle');
          },
        },
      );
    } catch (e: any) {
      setError(e?.message || String(e));
      setStatus('idle');
    }
  }

  return (
    <div className="app">
      <header className="top">
        <div className="brandmark">
          Brandwright
          <span className="tag">version control for brand design</span>
        </div>
        {kit && (
          <div className="genome">
            {logo && <img src={logo.src} alt="" />}
            <span>
              <b>{kit.name}</b> genome · {kit.assets.length} assets · {kit.colors.length} colours
            </span>
          </div>
        )}
      </header>

      <section className="composer">
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="Describe the ad you want…  e.g.  “Create 4 images promoting easy invoicing for small businesses”"
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) run();
          }}
        />
        <div className="chips">
          {EXAMPLES.map((x) => (
            <button key={x} className="chip" disabled={busy} onClick={() => { setPrompt(x); run(x); }}>
              {x}
            </button>
          ))}
        </div>
        <div className="controls">
          <label>
            Variations
            <select value={variations} onChange={(e) => setVariations(+e.target.value)}>
              {[1, 2, 3, 4, 6].map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
          </label>
          <label>
            Size
            <select value={presetId} onChange={(e) => setPresetId(e.target.value)}>
              {kit?.presets?.map((p) => (
                <option key={p.id} value={p.id}>{p.label}</option>
              ))}
            </select>
          </label>
          <button className="go" disabled={busy} onClick={() => run()}>
            {status === 'thinking' ? 'Designing…' : status === 'rendering' ? 'Rendering…' : 'Generate'}
          </button>
        </div>
      </section>

      {error && <div className="err">{error}</div>}

      {status === 'thinking' && (
        <div className="gallery">
          {Array.from({ length: variations }).map((_, i) => (
            <div key={i} className="card">
              <div className="dv-shimmer" style={{ width: 340, height: 340, borderRadius: 16 }} />
            </div>
          ))}
        </div>
      )}

      {status === 'idle' && !designs.length && !error && (
        <div className="empty">
          <h1>Make on-brand ads in seconds.</h1>
          <p>Type a brief or tap an example above. Brandwright designs editable, on-brand variations — every colour, font, logo and shape pulled from the live brand genome.</p>
        </div>
      )}

      {designs.length > 0 && (
        <div className="gallery">
          {designs.map((d) => (
            <div key={d.id} className="card">
              <DesignView spec={d} kit={kit} width={340} />
              <div className="meta">
                <b>{d.name}</b>
                {d.note && <span>{d.note}</span>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
