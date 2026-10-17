// Guided brand ingest — a fresh page that teaches what to upload, takes the
// folder, and builds a living genome out of it.
import { useMemo, useRef, useState } from 'react';
import { useStore } from './store';
import { getBrand } from './api';
import { Icon } from './Icon';
import { applyBrandChrome } from './App';

const GUIDE = [
  { icon: 'badge', title: 'Logos', text: 'Transparent PNGs or SVGs. Put “logo” in the file or folder name. Light + dark variants are gold.' },
  { icon: 'flower', title: 'Shapes & blooms', text: 'Signature blobs, squiggles, device motifs — transparent PNGs named “shape”, “bloom” or “blob”. They become recolourable brand assets.' },
  { icon: 'square', title: 'Backgrounds & patterns', text: 'Template backgrounds or textures, named “background” or “pattern”.' },
  { icon: 'sparkle', title: 'Charms & stickers', text: 'Small playful accents, named “charm” or “sticker”.' },
  { icon: 'image', title: 'Anything else on-brand', text: 'Example ads, product shots, illustrations — everything feeds the palette and the voice inference.' },
];

const STAGES = ['Uploading assets…', 'Classifying and optimising…', 'Sampling the exact palette…', 'Inferring fonts, voice and rules…', 'Writing the genome…'];

function classify(name: string): string {
  const f = name.toLowerCase();
  if (/logo|wordmark|lockup/.test(f)) return 'logos';
  if (/bloom|shape|blob/.test(f)) return 'shapes';
  if (/background|bg|pattern|texture/.test(f)) return 'backgrounds';
  if (/charm|sticker|badge/.test(f)) return 'charms';
  return 'other';
}

export default function Ingest({ hosted }: { hosted: boolean }) {
  const st = useStore;
  const [mode, setMode] = useState<'upload' | 'describe'>('upload');
  const [name, setName] = useState('');
  const [desc, setDesc] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [stage, setStage] = useState(0);
  const [error, setError] = useState('');
  const dirInput = useRef<HTMLInputElement>(null);

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const f of files) {
      const k = classify((f as any).webkitRelativePath || f.name);
      c[k] = (c[k] || 0) + 1;
    }
    return c;
  }, [files]);

  function takeFiles(list: FileList | File[]) {
    const imgs = Array.from(list).filter((f) => /\.(png|jpe?g|svg|webp)$/i.test(f.name) && f.size < 3_000_000).slice(0, 60);
    if (!imgs.length) { setError('No usable images found — PNG, JPG, SVG or WebP under 3MB each.'); return; }
    setError('');
    setFiles(imgs);
    if (!name) {
      const folder = (imgs[0] as any).webkitRelativePath?.split('/')[0];
      if (folder) setName(folder.replace(/[-_]/g, ' '));
    }
  }

  async function buildFromDescription() {
    if (!name.trim() || !desc.trim() || busy || hosted) return;
    setBusy(true);
    setError('');
    const ticker = setInterval(() => setStage((s) => Math.min(s + 1, STAGES.length - 1)), 2200);
    try {
      setStage(3); // jumps straight to inference
      const r = await fetch('/api/generate-brand', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: name.trim(), description: desc.trim() }) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || 'generation failed');
      const kit = await getBrand(j.kit.id);
      st.getState().setKit(kit);
      applyBrandChrome(kit);
      st.getState().setDesigns([]);
      useStore.setState({ toast: `Genome invented — say hello to ${kit.name}` });
      setTimeout(() => useStore.setState({ toast: undefined }), 4000);
      st.getState().setView('home');
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      clearInterval(ticker);
      setBusy(false);
    }
  }

  async function build() {
    if (!name.trim() || !files.length || busy || hosted) return;
    setBusy(true);
    setError('');
    const ticker = setInterval(() => setStage((s) => Math.min(s + 1, STAGES.length - 1)), 2600);
    try {
      setStage(0);
      const payload = await Promise.all(
        files.map(async (f) => ({
          path: (f as any).webkitRelativePath || f.name,
          data: btoa(new Uint8Array(await f.arrayBuffer()).reduce((s, b) => s + String.fromCharCode(b), '')),
        })),
      );
      const r = await fetch('/api/ingest', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: name.trim(), files: payload }) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || 'ingest failed');
      const kit = await getBrand(j.kit.id);
      st.getState().setKit(kit);
      applyBrandChrome(kit);
      st.getState().setDesigns([]);
      useStore.setState({ toast: `Genome built — say hello to ${kit.name}` });
      setTimeout(() => useStore.setState({ toast: undefined }), 4000);
      st.getState().setView('home');
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      clearInterval(ticker);
      setBusy(false);
    }
  }

  return (
    <div className="app">
      {useStore((s) => s.toast) && <div className="toast">{useStore.getState().toast}</div>}
      <header className="top">
        <div className="brandmark click" onClick={() => st.getState().setView('landing')} title="About Brandwright" role="link">
          Brandwright
          <span className="tag">new genome</span>
        </div>
        <button className="ghost" onClick={() => st.getState().setView('home')}><Icon name="back" /> Studio</button>
      </header>

      <section className="ingest-hero">
        <h1>Teach it your brand.</h1>
        <p>Drop a folder of brand assets and Brandwright learns the palette, classifies every asset, and infers the fonts, voice and rules — or just describe a brand and it invents the whole kit. Either way: a living genome it designs inside from then on.</p>
      </section>

      {hosted && (
        <div className="err" style={{ marginBottom: 18 }}>
          The hosted demo runs on a read-only filesystem, so live ingest is disabled here. Run Brandwright locally (<code>npm run dev</code>) to teach it a new brand — Xero, Coca-Cola, Spotify, Headspace and Airbnb are preloaded either way.
        </div>
      )}

      <section className="land-grid" style={{ marginBottom: 20 }}>
        {GUIDE.map((g) => (
          <div key={g.title} className="land-feat">
            <span className="ic"><Icon name={g.icon} size={18} /></span>
            <h3>{g.title}</h3>
            <p>{g.text}</p>
          </div>
        ))}
      </section>

      <div className="ingest-tabs">
        <button className={'mini' + (mode === 'upload' ? ' on' : '')} onClick={() => setMode('upload')} disabled={busy}><Icon name="upload" size={12} /> Upload assets</button>
        <button className={'mini' + (mode === 'describe' ? ' on' : '')} onClick={() => setMode('describe')} disabled={busy}><Icon name="sparkles" size={12} /> Generate from a description</button>
      </div>

      <section className="ingest-form">
        <label className="ingest-name">
          Brand name
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Acme Coffee" disabled={busy} />
        </label>

        {mode === 'describe' && (
          <label className="ingest-name" style={{ maxWidth: 'none' }}>
            Describe the brand
            <textarea
              className="ingest-desc"
              rows={3}
              value={desc}
              onChange={(e) => setDesc(e.target.value)}
              placeholder="e.g. A third-wave coffee roastery for slow mornings — warm, unhurried, a little playful. Espresso browns and cream with one bold citrus accent."
              disabled={busy}
            />
          </label>
        )}

        {mode === 'upload' && (
        <div
          className={'dropzone' + (files.length ? ' has' : '')}
          onClick={() => dirInput.current?.click()}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => { e.preventDefault(); takeFiles(e.dataTransfer.files); }}
        >
          <Icon name="upload" size={26} />
          {files.length ? (
            <>
              <b>{files.length} files ready</b>
              <span>{Object.entries(counts).map(([k, n]) => `${n} ${k}`).join(' · ')}</span>
              <span className="ed-hint">Click to choose a different folder</span>
            </>
          ) : (
            <>
              <b>Click to choose your brand folder</b>
              <span>or drag image files here · PNG, JPG, SVG, WebP · up to 60 files, 3MB each</span>
            </>
          )}
          <input
            ref={dirInput}
            type="file"
            style={{ display: 'none' }}
            // @ts-expect-error folder upload
            webkitdirectory=""
            multiple
            onChange={(e) => e.target.files && takeFiles(e.target.files)}
          />
        </div>
        )}

        {error && <div className="err">{error}</div>}

        <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginTop: 4 }}>
          <button
            className="go"
            disabled={busy || hosted || !name.trim() || (mode === 'upload' ? !files.length : !desc.trim())}
            onClick={mode === 'upload' ? build : buildFromDescription}
          >
            {busy ? STAGES[stage] : mode === 'upload' ? 'Build my genome' : 'Invent my genome'}
          </button>
          {busy && <span className="genspin" style={{ color: 'var(--accent)' }}>❋</span>}
        </div>
      </section>
    </div>
  );
}
