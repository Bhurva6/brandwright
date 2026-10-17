import { useEffect, useMemo, useState } from 'react';
import { DesignView, FluidDesignView } from './DesignView';
import { getBrand, generateStream, runRemix } from './api';
import { useStore } from './store';
import Editor from './Editor';
import { Coachmarks, HOME_STEPS } from './Coachmarks';

interface RefAd { id: string; src: string; label: string; structure: string }

interface BrandListing { id: string; name: string; colors: { token: string; value: string }[] }

function applyBrandChrome(k: { colors: { value: string; roles?: string[] }[] }) {
  const accent = k.colors.find((c) => c.roles?.includes('cta')) || k.colors.find((c) => c.roles?.includes('accent'));
  if (accent) {
    document.documentElement.style.setProperty('--accent', accent.value);
    document.documentElement.style.setProperty('--accent-ink', accent.value);
  }
}

export function ScoreBadge({ score, size = 'md' }: { score?: { total: number; pass: boolean; insight?: string }; size?: 'sm' | 'md' }) {
  if (!score) return null;
  const pct = Math.round(score.total * 100);
  const tone = pct >= 70 ? 'good' : pct >= 50 ? 'mid' : 'low';
  return (
    <span className={`lens ${tone} ${size}`} title={score.insight || 'Performance Lens score'}>
      ⚡ {pct}
    </span>
  );
}

export default function App() {
  const kit = useStore((s) => s.kit);
  const view = useStore((s) => s.view);
  const designs = useStore((s) => s.designs);
  const scores = useStore((s) => s.scores);
  const st = useStore;

  const [prompt, setPrompt] = useState('');
  const [variations, setVariations] = useState(4);
  const [presetId, setPresetId] = useState('square_1080');
  const [status, setStatus] = useState<'idle' | 'thinking' | 'rendering'>('idle');
  const [error, setError] = useState('');
  const [brands, setBrands] = useState<BrandListing[]>([]);
  const [refs, setRefs] = useState<RefAd[]>([]); // xero: curated image refs
  const [specRefs, setSpecRefs] = useState<any[]>([]); // other brands: live spec refs
  const [remixing, setRemixing] = useState('');

  useEffect(() => {
    fetch('/api/brands').then((r) => r.json()).then(setBrands).catch(() => {});
    switchBrand('xero');
  }, []);

  // each brand brings its own reference library
  useEffect(() => {
    setRefs([]);
    setSpecRefs([]);
    if (!kit) return;
    if (kit.id === 'xero') {
      fetch('/refs/manifest.json').then((r) => r.json()).then((j) => setRefs(j.refs)).catch(() => {});
    } else {
      fetch(`/brand/${kit.id}/refs.json`).then((r) => (r.ok ? r.json() : { refs: [] })).then((j) => setSpecRefs(j.refs || [])).catch(() => {});
    }
  }, [kit?.id]);

  const [ingesting, setIngesting] = useState(false);
  const fileInputRef = useMemo(() => ({ current: null as HTMLInputElement | null }), []);

  async function ingestFolderFiles(list: FileList) {
    const imgs = Array.from(list)
      .filter((f) => /\.(png|jpe?g|svg|webp)$/i.test(f.name) && f.size < 3_000_000)
      .slice(0, 60);
    if (!imgs.length) { setError('No usable images in that folder.'); return; }
    const folderName = (imgs[0] as any).webkitRelativePath?.split('/')[0] || 'New Brand';
    const name = window.prompt('Brand name for this genome:', folderName.replace(/[-_]/g, ' '));
    if (!name) return;
    setIngesting(true);
    setError('');
    try {
      const files = await Promise.all(
        imgs.map(async (f) => ({
          path: (f as any).webkitRelativePath || f.name,
          data: btoa(new Uint8Array(await f.arrayBuffer()).reduce((s, b) => s + String.fromCharCode(b), '')),
        })),
      );
      const r = await fetch('/api/ingest', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name, files }) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || 'ingest failed');
      const bs = await fetch('/api/brands').then((x) => x.json());
      setBrands(bs);
      switchBrand(j.kit.id);
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setIngesting(false);
    }
  }

  async function remix(src: { refId?: string; spec?: any; key: string }) {
    if (busy || remixing || !kit) return;
    setRemixing(src.key);
    setError('');
    try {
      const { specs } = await runRemix({ brandId: kit.id, refId: src.refId, spec: src.spec, n: 3, presetId } as any);
      st.getState().setDesigns(specs);
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setRemixing('');
    }
  }

  function switchBrand(id: string) {
    getBrand(id)
      .then((k) => {
        st.getState().setKit(k);
        st.getState().setDesigns([]);
        applyBrandChrome(k); // brand-adaptive chrome: accents follow the genome
        setError('');
      })
      .catch(() => setError('Could not reach the server. Is it running on :8787?'));
  }

  const busy = status !== 'idle';
  const EXAMPLES: string[] = (kit as any)?.examples || [];
  // header chip sits on a white ground — never show the white logo variant there
  const logo = useMemo(() => {
    const logos = kit?.assets.filter((a) => a.category === 'logo') || [];
    return logos.find((a) => a.variant && a.variant !== 'white') || logos.find((a) => a.variant !== 'white') || logos[0];
  }, [kit]);

  async function run(p = prompt) {
    if (!p.trim() || busy || !kit) return;
    setError('');
    st.getState().setDesigns([]);
    setStatus('thinking');
    try {
      await generateStream(
        { brandId: kit.id, prompt: p, variations, presetId },
        {
          onSpecs: (specs) => {
            st.getState().setDesigns(specs);
            setStatus('rendering');
          },
          onImage: ({ specId, layerId, src, error }) => st.getState().patchDesignImage(specId, layerId, src, error),
          onScore: ({ specId, score }) => st.getState().setScore(specId, score),
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

  const toast = useStore((s) => s.toast);
  const [replayTour, setReplayTour] = useState(0);

  if (view === 'editor') return <Editor />;

  return (
    <div className="app">
      {toast && <div className="toast">{toast}</div>}
      {kit && (
        <Coachmarks key={replayTour} steps={HOME_STEPS} storageKey="bw_tour_home" run={replayTour > 0} onClose={() => setReplayTour(0)} />
      )}
      <header className="top">
        <div className="brandmark">
          Brandwright
          <span className="tag">version control for brand design</span>
          <button className="helpbtn" title="Replay the tour" onClick={() => setReplayTour((n) => n + 1)}>?</button>
        </div>
        {kit && (
          <div className="genome">
            {logo?.src ? (
              <img src={logo.src} alt="" />
            ) : (
              <span style={{ fontFamily: (logo as any)?.fontFamily, fontWeight: (logo as any)?.fontWeight || 800, color: (logo as any)?.color, fontSize: 14 }}>
                {(logo as any)?.text}
              </span>
            )}
            <select
              className="brandsel"
              value={kit.id}
              onChange={(e) => {
                if (e.target.value === '__ingest__') { fileInputRef.current?.click(); e.target.value = kit.id; return; }
                switchBrand(e.target.value);
              }}
              disabled={busy || ingesting}
              title="Switch the active brand genome"
            >
              {(brands.length ? brands : [{ id: kit.id, name: kit.name, colors: [] }]).map((b) => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
              <option value="__ingest__">＋ Ingest new brand…</option>
            </select>
            <span>{ingesting ? 'learning the brand…' : <>genome · {kit.assets.length} assets · {kit.colors.length} colours</>}</span>
            <input
              ref={(el) => { fileInputRef.current = el; }}
              type="file"
              style={{ display: 'none' }}
              // @ts-expect-error non-standard folder upload
              webkitdirectory=""
              multiple
              onChange={(e) => e.target.files && ingestFolderFiles(e.target.files)}
            />
          </div>
        )}
      </header>

      <section className="composer">
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder={`Describe the ${kit?.name || 'brand'} ad you want…  e.g.  “Create 4 images like our summer campaign”`}
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
              {[1, 2, 3, 4, 6, 8].map((n) => (
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

      {(refs.length > 0 || specRefs.length > 0) && (
        <section className="refstrip">
          <div className="refstrip-title">
            Reference remix <span>— recreate any reference's structure in {kit?.name || 'your brand'}'s DNA</span>
          </div>
          <div className="refstrip-row">
            {refs.map((r) => (
              <button key={r.id} className={'refcard' + (remixing === r.id ? ' busy' : '')} title={r.structure} disabled={busy || !!remixing} onClick={() => remix({ refId: r.id, key: r.id })}>
                <img src={r.src} alt={r.label} loading="lazy" />
                <span>{remixing === r.id ? 'Remixing…' : r.label}</span>
              </button>
            ))}
            {specRefs.map((s) => (
              <button key={s.id} className={'refcard' + (remixing === s.id ? ' busy' : '')} title={s.note || s.name} disabled={busy || !!remixing} onClick={() => remix({ spec: s, key: s.id })}>
                <DesignView spec={s} kit={kit} width={98} />
                <span>{remixing === s.id ? 'Remixing…' : s.name}</span>
              </button>
            ))}
          </div>
        </section>
      )}

      {error && <div className="err">{error}</div>}
      {remixing && (
        <div className="gallery">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="card"><div className="dv-shimmer" style={{ width: '100%', aspectRatio: '1', borderRadius: 16 }} /></div>
          ))}
        </div>
      )}

      {status === 'thinking' && (
        <div className="gallery">
          {Array.from({ length: variations }).map((_, i) => (
            <div key={i} className="card">
              <div className="dv-shimmer" style={{ width: '100%', aspectRatio: '1', borderRadius: 16 }} />
            </div>
          ))}
        </div>
      )}

      {status === 'idle' && !designs.length && !error && (
        <div className="empty">
          <h1>Make on-brand ads in seconds.</h1>
          <p>Type a brief or tap an example above. Brandwright designs editable, on-brand variations — every colour, font, logo and shape pulled from the live brand genome. Click any result to open it in the editor.</p>
        </div>
      )}

      {designs.length > 0 && (
        <div className="gallery">
          {designs.map((d) => (
            <button key={d.id} className="card click" onClick={() => st.getState().openEditor(d)}>
              <FluidDesignView spec={d} kit={kit} />
              <div className="meta">
                <b>{d.name} <ScoreBadge score={scores[d.id]} /></b>
                {d.note && <span>{d.note}</span>}
                {scores[d.id]?.insight && <span className="insight">💡 {scores[d.id].insight}</span>}
                <span className="open">Open in editor →</span>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
