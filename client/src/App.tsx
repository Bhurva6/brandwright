import { useEffect, useMemo, useState } from 'react';
import { DesignView, FluidDesignView } from './DesignView';
import { getBrand, generateStream, runRemix, runAdapt } from './api';
import type { DesignSpec } from './types';
import { useStore, restoreSession, PATHS } from './store';
import type { View } from './store';
import { newId } from './vc';
import Editor from './Editor';
import Landing from './Landing';
import Ingest from './Ingest';
import ChatPage from './ChatPage';
import { Coachmarks, HOME_STEPS } from './Coachmarks';
import { Icon } from './Icon';
import { listExports, removeExport, toggleFav, saveExport } from './library';
import { renderSpecDataUrl } from './rasterize';
import type { LibraryItem } from './library';

interface RefAd { id: string; src: string; label: string; structure: string }

interface BrandListing { id: string; name: string; colors: { token: string; value: string }[] }

// The app keeps GetCrux's own identity; the active genome's colour only tints
// scoped elements (genome chip) via --brand.
export function applyBrandChrome(k: { colors: { value: string; roles?: string[] }[] }) {
  const accent = k.colors.find((c) => c.roles?.includes('cta')) || k.colors.find((c) => c.roles?.includes('accent'));
  if (accent) document.documentElement.style.setProperty('--brand', accent.value);
}

const GEN_STAGES = [
  'Briefing the copilot…',
  'Reading the brand genome…',
  'Composing layouts…',
  'Writing on-brand copy…',
  'Painting imagery…',
  'Scoring with the Performance Lens…',
];

const REMIX_LINES = [
  'Cooking something refreshing…',
  'Borrowing the structure, returning the style…',
  'Asking the genome for permission…',
  'Convincing the logo to behave…',
  'Re-seasoning the layout to taste…',
  'Teaching old pixels new tricks…',
  'Stealing like an artist…',
];

export function GenLoader({ count, lines = GEN_STAGES }: { count: number; lines?: string[] }) {
  const [i, setI] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setI((x) => (x + 1) % lines.length), 2000);
    return () => clearInterval(t);
  }, [lines.length]);
  return (
    <div className="genwrap">
      <div className="genstatus">
        <span className="genspin">❋</span>
        <span key={i} className="genmsg">{lines[i]}</span>
      </div>
      <div className="gallery">
        {Array.from({ length: count }).map((_, k) => (
          <div key={k} className="card">
            <div className="dv-shimmer" style={{ width: '100%', aspectRatio: '1', borderRadius: 16 }} />
            <div className="meta"><div className="dv-shimmer" style={{ width: '60%', height: 14, borderRadius: 6 }} /></div>
          </div>
        ))}
      </div>
    </div>
  );
}

function LibraryPage({ lib, onBack, onDelete, onFav, favOnly }: { lib: LibraryItem[]; onBack: () => void; onDelete: (id: string) => void; onFav: (id: string) => void; favOnly?: boolean }) {
  const st = useStore;
  const shown = favOnly ? lib.filter((x) => x.fav) : lib;
  return (
    <div className="app">
      <header className="top">
        <div className="brandmark click" onClick={() => st.getState().setView('landing')} title="About Brandwright" role="link">
          Brandwright
          <span className="tag">{favOnly ? 'favourites' : 'drafts'}</span>
        </div>
        <button className="ghost" onClick={onBack}><Icon name="back" /> Studio</button>
      </header>
      <section className="libview">
        <div className="refstrip-title" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {favOnly ? 'Your favourites' : 'Your drafts'} <span>— {favOnly ? 'the keepers' : 'saved drafts and every export'}, kept on this device</span>
          <span style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
            <button className={'mini' + (!favOnly ? ' on' : '')} onClick={() => st.getState().setView('library')}>All drafts</button>
            <button className={'mini favtog' + (favOnly ? ' on' : '')} onClick={() => st.getState().setView('favs')}><Icon name="heart" size={11} /> Favourites</button>
          </span>
        </div>
        {shown.length === 0 ? (
          <div className="empty" style={{ padding: '48px 20px' }}>
            <h1 style={{ fontSize: 'clamp(20px,3vw,28px)' }}>{favOnly ? 'No favourites yet.' : 'Nothing here yet.'}</h1>
            <p>{favOnly ? 'Tap the heart in the editor, or on any draft, to keep the best ones here.' : 'Hit “Save draft” in the editor — exports land here automatically too.'}</p>
          </div>
        ) : (
          <div className="libgrid">
            {shown.map((it) => (
              <div key={it.id} className="libcard">
                <img src={it.dataUrl} alt={it.name} loading="lazy" />
                <div className="libmeta">
                  <b>{it.name}</b>
                  <span>{it.brand} · {it.preset} · {new Date(it.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                  <div className="librow">
                    <button className={'mini favtog' + (it.fav ? ' on' : '')} title={it.fav ? 'Unfavourite' : 'Favourite'} onClick={() => onFav(it.id)}><Icon name="heart" size={11} /></button>
                    <a className="mini" href={it.dataUrl} download={`${it.name.replace(/\W+/g, '-').toLowerCase()}.png`}>Download</a>
                    <button className="mini" onClick={() => onDelete(it.id)}>Delete</button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

export function ScoreBadge({ score, size = 'md' }: { score?: { total: number; pass: boolean; insight?: string }; size?: 'sm' | 'md' }) {
  if (!score) return null;
  const pct = Math.round(score.total * 100);
  const tone = pct >= 70 ? 'good' : pct >= 50 ? 'mid' : 'low';
  return (
    <span className={`lens ${tone} ${size}`} title={score.insight || 'Performance Lens score'}>
      <Icon name="zap" size={11} /> {pct}
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
  const [lightbox, setLightbox] = useState<{ kind: 'spec' | 'img'; spec?: DesignSpec; src?: string; label?: string } | null>(null);
  const [hosted, setHosted] = useState(false); // Vercel demo: read-only fs, no live ingest

  useEffect(() => {
    fetch('/api/health').then((r) => r.json()).then((h) => setHosted(!!h.hosted)).catch(() => {});
    fetch('/api/brands').then((r) => r.json()).then(setBrands).catch(() => {});
    // restore the previous session (designs + history survive refresh)
    restoreSession('xero').then((savedBrand) => switchBrandKitOnly(savedBrand || 'xero'));
  }, []);

  // load a kit WITHOUT clearing restored designs
  function switchBrandKitOnly(id: string) {
    getBrand(id)
      .then((k) => {
        st.getState().setKit(k);
        applyBrandChrome(k);
      })
      .catch(() => setError('Could not reach the server. Is it running on :8787?'));
  }

  // keep the brand list fresh (a new genome may have just been ingested)
  useEffect(() => {
    fetch('/api/brands').then((r) => r.json()).then(setBrands).catch(() => {});
  }, [kit?.id]);

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

  const ingesting = false;

  // ----- blank canvas / import / campaign ----------------------------------
  function activePreset() {
    return kit?.presets.find((p) => p.id === presetId) || kit?.presets[0];
  }

  function openBlank() {
    if (!kit) return;
    const p = activePreset()!;
    const ink = kit.colors.find((c: any) => c.roles?.includes('text'))?.value || '#111111';
    const logos = kit.assets.filter((a) => a.category === 'logo');
    const logo = logos.find((x: any) => x.variant && x.variant !== 'white') || logos[0];
    const spec = {
      id: newId('d'),
      name: 'Untitled',
      note: 'Started from a blank canvas',
      canvas: { w: p.w, h: p.h, preset: p.id, background: '#FFFFFF' },
      layers: [
        { id: newId('l'), type: 'text', box: { x: Math.round(p.w * 0.08), y: Math.round(p.h * 0.3), w: Math.round(p.w * 0.84), h: Math.round(p.h * 0.2) }, text: 'Your headline here', role: 'headline', size: Math.round(p.h * 0.08), color: ink, align: 'left' },
        { id: newId('l'), type: 'logo', box: { x: Math.round(p.w * 0.08), y: Math.round(p.h * 0.88), w: Math.round(p.w * 0.22), h: Math.round(p.h * 0.07) }, assetId: logo?.id, variant: (logo as any)?.variant, src: logo?.src, text: (logo as any)?.text, fontFamily: (logo as any)?.fontFamily, fontWeight: (logo as any)?.fontWeight, color: (logo as any)?.color },
      ],
    };
    st.getState().setDesigns([spec as any]);
    st.getState().openEditor(spec as any);
  }

  function importImage(file: File) {
    if (!kit || !file.type.startsWith('image/')) return;
    const p = activePreset()!;
    const rd = new FileReader();
    rd.onload = () => {
      const spec = {
        id: newId('d'),
        name: file.name.replace(/\.\w+$/, ''),
        note: 'Imported design — layer brand elements on top, or ask the copilot',
        canvas: { w: p.w, h: p.h, preset: p.id, background: '#FFFFFF' },
        layers: [
          { id: newId('l'), type: 'image', box: { x: 0, y: 0, w: p.w, h: p.h }, src: rd.result as string, fit: 'contain', status: 'ready' },
        ],
      };
      st.getState().setDesigns([spec as any]);
      st.getState().openEditor(spec as any);
    };
    rd.readAsDataURL(file);
  }

  const [campaignBusy, setCampaignBusy] = useState('');
  async function runCampaign() {
    if (!kit || busy || campaignBusy) return;
    const p = prompt.trim() || EXAMPLES[0];
    if (!p) return;
    setError('');
    setCampaignBusy('concepts');
    try {
      // 1) three distinct concepts
      let concepts: DesignSpec[] = [];
      await generateStream(
        { brandId: kit.id, prompt: p, variations: 3, presetId },
        {
          onSpecs: (s) => { concepts = s; st.getState().setDesigns(s); setStatus('rendering'); },
          onImage: ({ specId, layerId, src, error }) => st.getState().patchDesignImage(specId, layerId, src, error),
          onScore: ({ specId, score }) => st.getState().setScore(specId, score),
          onError: (e) => { throw new Error(e.error); },
        },
      );
      setStatus('idle');
      // 2) every concept adapted to every other placement — the full campaign
      const others = kit.presets.filter((x) => x.id !== presetId);
      setCampaignBusy(`adapting 0/${concepts.length * others.length}`);
      let done = 0;
      const adapted = await Promise.all(
        concepts.flatMap((c) =>
          others.map((o) =>
            runAdapt({ brandId: kit.id, spec: c, presetId: o.id })
              .then((r) => {
                setCampaignBusy(`adapting ${++done}/${concepts.length * others.length}`);
                return { ...r.spec, name: `${c.name} · ${o.label}` };
              })
              .catch(() => null),
          ),
        ),
      );
      st.getState().addBranches(adapted.filter(Boolean) as DesignSpec[], 'Campaign');
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setCampaignBusy('');
      setStatus('idle');
    }
  }

  async function remix(src: { refId?: string; spec?: any; structure?: string; key: string }) {
    if (busy || remixing || !kit) return;
    setRemixing(src.key);
    setError('');
    try {
      const { specs } = await runRemix({ brandId: kit.id, refId: src.refId, spec: src.spec, structure: src.structure, n: 3, presetId } as any);
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
  const centered = status === 'idle' && !designs.length && !remixing && !campaignBusy && !error;
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
  const [lib, setLib] = useState<LibraryItem[]>([]);
  useEffect(() => {
    if (view !== 'editor') listExports().then(setLib).catch(() => {});
  }, [view]);

  // URL <-> view: /, /studio, /editor, /library are real pages (back/forward work)
  useEffect(() => {
    const fromPath = () => {
      const p = window.location.pathname;
      const v: View = (Object.entries(PATHS).find(([, path]) => path === p)?.[0] as View) || 'landing';
      if (v === 'editor' && !useStore.getState().working) {
        window.history.replaceState({}, '', PATHS.home);
        useStore.setState({ view: 'home' });
      } else {
        useStore.setState({ view: v });
      }
    };
    fromPath();
    window.addEventListener('popstate', fromPath);
    return () => window.removeEventListener('popstate', fromPath);
  }, []);

  if (view === 'landing') return <Landing />;
  if (view === 'chat') return <ChatPage />;
  if (view === 'ingest') return <Ingest hosted={hosted} />;
  if (view === 'editor') return <Editor />;
  if (view === 'library' || view === 'favs')
    return <LibraryPage favOnly={view === 'favs'} lib={lib} onBack={() => st.getState().setView('home')} onDelete={(id) => removeExport(id).then(() => listExports().then(setLib))} onFav={(id) => toggleFav(id).then(() => listExports().then(setLib))} />;

  return (
    <div className="app">
      {toast && <div className="toast">{toast}</div>}
      {lightbox && (
        <div className="lightbox" onClick={() => setLightbox(null)}>
          <div className="lightbox-inner" onClick={(e) => e.stopPropagation()}>
            {lightbox.kind === 'img' ? (
              <img src={lightbox.src} alt={lightbox.label || ''} />
            ) : lightbox.spec ? (
              <DesignView
                spec={lightbox.spec}
                kit={kit}
                width={Math.min(window.innerWidth * 0.86, (window.innerHeight * 0.86) * (lightbox.spec.canvas.w / lightbox.spec.canvas.h))}
              />
            ) : null}
          </div>
          <button className="lightbox-x" onClick={() => setLightbox(null)} title="Close">✕</button>
        </div>
      )}
      {kit && (
        <Coachmarks key={replayTour} steps={HOME_STEPS} storageKey="bw_tour_home_v2" run={replayTour > 0} onClose={() => setReplayTour(0)} />
      )}
      <header className="top">
        <div className="brandmark click" onClick={() => st.getState().setView('landing')} title="About Brandwright" role="link">
          Brandwright
          <span className="tag">studio</span>
          <button className="helpbtn" title="Replay the tour" onClick={(e) => { e.stopPropagation(); setReplayTour((n) => n + 1); }}>?</button>
          <button className="libbtn" title="Your exported designs" onClick={(e) => { e.stopPropagation(); st.getState().setView('library'); }}>
            <Icon name="folder" size={13} /> Drafts{lib.length ? ` · ${lib.length}` : ''}
          </button>
          <button className="libbtn" title="One-thread copilot: references in, layered designs out" onClick={(e) => { e.stopPropagation(); st.getState().setView('chat'); }}>
            <Icon name="sparkles" size={13} /> Chat
          </button>
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
                if (e.target.value === '__ingest__') { e.target.value = kit.id; st.getState().setView('ingest'); return; }
                switchBrand(e.target.value);
              }}
              disabled={busy || ingesting}
              title="Switch the active brand genome"
            >
              {(brands.length ? brands : [{ id: kit.id, name: kit.name, colors: [] }]).map((b) => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
              {!hosted && <option value="__ingest__">＋ Ingest new brand…</option>}
            </select>
            <span>{ingesting ? 'learning the brand…' : <>genome · {kit.assets.length} assets · {kit.colors.length} colours</>}</span>
          </div>
        )}
      </header>

      <div className={'studio-body' + (centered ? ' centered' : '')}>
      <div className="empty hero">
        <h1>Make on-brand ads in seconds.</h1>
        <p>Pick a reference to remix, or type a brief below. Brandwright designs editable, on-brand variations — every colour, font, logo and shape pulled from the live brand genome. Click any result to open it in the editor.</p>
      </div>

      {(refs.length > 0 || specRefs.length > 0) && (
        <section className="refstrip">
          <div className="refstrip-title">
            Reference remix <span>— recreate any reference's structure in {kit?.name || 'your brand'}'s DNA</span>
          </div>
          <div className={'refstrip-row deck' + (remixing ? ' has-loading' : '')}>
            {refs.map((r) => (
              <button key={r.id} className={'refcard' + (remixing === r.id ? ' busy' : '')} title={r.structure} disabled={busy || !!remixing} onClick={() => remix({ refId: r.id, key: r.id })}>
                <span className="expbtn" title="View full screen" onClick={(e) => { e.stopPropagation(); setLightbox({ kind: 'img', src: r.src, label: r.label }); }}>
                  <svg className="icx" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M15 3h6v6 M9 21H3v-6 M21 3l-7 7 M3 21l7-7"/></svg>
                </span>
                <img src={r.src} alt={r.label} loading="lazy" />
                {remixing === r.id && <span className="refspin">❋</span>}
                <span>{remixing === r.id ? 'Remixing…' : r.label}</span>
              </button>
            ))}
            {specRefs.map((s) => (
              <button key={s.id} className={'refcard' + (remixing === s.id ? ' busy' : '')} title={s.note || s.name} disabled={busy || !!remixing} onClick={() => remix({ spec: s, key: s.id })}>
                <span className="expbtn" title="View full screen" onClick={(e) => { e.stopPropagation(); setLightbox({ kind: 'spec', spec: s }); }}>
                  <svg className="icx" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M15 3h6v6 M9 21H3v-6 M21 3l-7 7 M3 21l7-7"/></svg>
                </span>
                <DesignView spec={s} kit={kit} width={98} />
                {remixing === s.id && <span className="refspin">❋</span>}
                <span>{remixing === s.id ? 'Remixing…' : s.name}</span>
              </button>
            ))}
            <button
              className={'refcard upload' + (remixing === '__upload__' ? ' busy' : '')}
              disabled={busy || !!remixing}
              title="Remix any ad you've seen — describe its structure and Brandwright rebuilds it in your brand"
              onClick={() => {
                const desc = window.prompt('Describe the reference ad\'s structure in one line\n(e.g. "big stat top-left, product photo right, dark footer with CTA and logo"):');
                if (desc?.trim()) remix({ structure: desc.trim(), key: '__upload__' } as any);
              }}
            >
              <span className="upface">＋</span>
              <span>{remixing === '__upload__' ? 'Remixing…' : 'Your reference'}</span>
            </button>
          </div>
        </section>
      )}

      {remixing && <GenLoader count={3} lines={REMIX_LINES} />}

      {status === 'thinking' && <GenLoader count={variations} />}

      {designs.length > 0 && (
        <div className="gallery">
          {designs.map((d) => (
            <button key={d.id} className="card click" onClick={() => st.getState().openEditor(d)}>
              <span
                className="expbtn favspot"
                title="Save to Favourites"
                onClick={async (e) => {
                  e.stopPropagation();
                  try {
                    const url = await renderSpecDataUrl(d, kit);
                    await saveExport({ id: newId('x'), name: d.name, brand: kit?.name || '', preset: d.canvas.preset, at: Date.now(), dataUrl: url, fav: true });
                    useStore.setState({ toast: 'Saved to Favourites' });
                    listExports().then(setLib);
                  } catch { useStore.setState({ toast: 'Could not save favourite' }); }
                  setTimeout(() => useStore.setState({ toast: undefined }), 2500);
                }}
              >
                <Icon name="heart" size={12} />
              </span>
              <span className="expbtn" title="View full screen" onClick={(e) => { e.stopPropagation(); setLightbox({ kind: 'spec', spec: d }); }}>
                <Icon name="chevUp" size={0} /><svg className="icx" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M15 3h6v6 M9 21H3v-6 M21 3l-7 7 M3 21l7-7"/></svg>
              </span>
              <FluidDesignView spec={d} kit={kit} />
              <div className="meta">
                <b>{d.name} <ScoreBadge score={scores[d.id]} /></b>
                {d.note && <span>{d.note}</span>}
                {scores[d.id]?.insight && <span className="insight"><Icon name="bulb" size={12} /> {scores[d.id].insight}</span>}
                <span className="open">Open in editor →</span>
              </div>
            </button>
          ))}
        </div>
      )}

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
          <button className="ghost" disabled={busy || !!campaignBusy} onClick={openBlank} title="Start with an empty canvas and build by hand">
            <Icon name="squarePlus" /> Blank canvas
          </button>
          <label className="ghost importbtn" title="Bring an existing design in and edit it">
            <Icon name="upload" /> Import
            <input type="file" accept="image/*" style={{ display: 'none' }} onChange={(e) => e.target.files?.[0] && importImage(e.target.files[0])} />
          </label>
          <button className="ghost" disabled={busy || !!campaignBusy} onClick={runCampaign} title="3 concepts × every placement size — a full campaign in one go">
            <Icon name="rocket" /> {campaignBusy ? campaignBusy : 'Campaign'}
          </button>
          <button className="go" disabled={busy || !!campaignBusy} onClick={() => run()}>
            {status === 'thinking' ? 'Designing…' : status === 'rendering' ? 'Rendering…' : 'Generate'}
          </button>
        </div>
      </section>
      </div>




      {error && <div className="err">{error}</div>}





    </div>
  );
}
