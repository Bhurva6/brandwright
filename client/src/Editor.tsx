// The editor: direct manipulation (select / drag / resize / retype / recolor /
// reorder / delete / re-roll images) + conversational edits + version history.
// Every change becomes a commit on the active branch.
import { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { toPng } from 'html-to-image';
import JSZip from 'jszip';
import { DesignView } from './DesignView';
import type { DesignSpec, BrandKit } from './types';
import { useStore, useLog } from './store';
import type { Score } from './store';
import { LayerView } from './Layers';
import { diffSpecs, diffSummary, specOf } from './vc';
import { editDesign, regenImage, runCritic, runAutofix, runRefresh, runAdapt, runReskin, getBrand } from './api';
import { ScoreBadge } from './App';
import { Coachmarks, EDITOR_STEPS } from './Coachmarks';
import type { Layer } from './types';

const LAYER_ICON: Record<string, string> = {
  background: '▦', image: '🖼', text: 'T', shape: '◆', bloom: '❋', charm: '✦', logo: '™', pill: '⬭', featureList: '☑',
};
const AUTHOR_ICON = { human: '👤', generator: '✨', critic: '🛡' } as const;

export default function Editor() {
  const kit = useStore((s) => s.kit);
  const working = useStore((s) => s.working);
  const branch = useStore((s) => s.branch);
  const repo = useStore((s) => s.repo);
  const viewingCommit = useStore((s) => s.viewingCommit);
  const selectedId = useStore((s) => s.selectedId);
  const dirty = useStore((s) => s.dirty);
  const st = useStore;

  const [chat, setChat] = useState('');
  const [chatBusy, setChatBusy] = useState(false);
  const [chatErr, setChatErr] = useState('');
  const [lens, setLens] = useState<Score>();
  const [lensBusy, setLensBusy] = useState<'' | 'check' | 'fix' | 'refresh'>('');
  const [brandList, setBrandList] = useState<{ id: string; name: string }[]>([]);
  useEffect(() => {
    fetch('/api/brands').then((r) => r.json()).then(setBrandList).catch(() => {});
  }, []);
  const stageRef = useRef<HTMLDivElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.5);

  const history = useLog();
  const selected = working?.layers.find((l) => l.id === selectedId);

  // fit canvas into the available space
  useEffect(() => {
    const el = wrapRef.current;
    if (!el || !working) return;
    const ro = new ResizeObserver(() => {
      const pad = 48;
      setScale(Math.min((el.clientWidth - pad) / working.canvas.w, (el.clientHeight - pad) / working.canvas.h, 1));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [working?.canvas.w, working?.canvas.h]);

  // commit dirty working tree (debounced) so text typing collapses to one commit
  useEffect(() => {
    if (!dirty) return;
    const t = setTimeout(() => st.getState().commitWorking('human', 'Edited design'), 900);
    return () => clearTimeout(t);
  }, [dirty, working]);

  if (!working || !kit) return null;

  const commitNow = (msg: string) => st.getState().commitWorking('human', msg);

  // ----- drag / resize ------------------------------------------------------
  function startDrag(e: React.PointerEvent, l: Layer, mode: 'move' | 'nw' | 'ne' | 'sw' | 'se') {
    if (viewingCommit) return;
    e.preventDefault();
    e.stopPropagation();
    st.getState().select(l.id);
    const start = { x: e.clientX, y: e.clientY, box: { ...l.box } };
    let moved = false;
    const onMove = (ev: PointerEvent) => {
      const dx = (ev.clientX - start.x) / scale;
      const dy = (ev.clientY - start.y) / scale;
      if (Math.abs(dx) + Math.abs(dy) > 1) moved = true;
      const b = { ...start.box };
      if (mode === 'move') { b.x = Math.round(start.box.x + dx); b.y = Math.round(start.box.y + dy); }
      else {
        if (mode.includes('e')) b.w = Math.max(20, Math.round(start.box.w + dx));
        if (mode.includes('s')) b.h = Math.max(20, Math.round(start.box.h + dy));
        if (mode.includes('w')) { b.x = Math.round(start.box.x + dx); b.w = Math.max(20, Math.round(start.box.w - dx)); }
        if (mode.includes('n')) { b.y = Math.round(start.box.y + dy); b.h = Math.max(20, Math.round(start.box.h - dy)); }
      }
      st.getState().updateLayer(l.id, { box: b });
    };
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      if (moved) commitNow(mode === 'move' ? `Moved ${l.type}` : `Resized ${l.type}`);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  }

  // ----- chat edit ----------------------------------------------------------
  async function runChat() {
    if (!chat.trim() || chatBusy) return;
    setChatBusy(true);
    setChatErr('');
    try {
      const next = await editDesign({ brandId: kit.id, spec: working, instruction: chat });
      st.getState().replaceWorking(next, 'generator', chat);
      setChat('');
    } catch (e: any) {
      setChatErr(e?.message || String(e));
    } finally {
      setChatBusy(false);
    }
  }

  // ----- Performance Lens / brand CI ---------------------------------------
  async function checkLens() {
    if (lensBusy) return;
    setLensBusy('check');
    try {
      const { score } = await runCritic({ brandId: kit.id, spec: working });
      setLens(score);
    } finally {
      setLensBusy('');
    }
  }

  async function autofix() {
    if (lensBusy) return;
    setLensBusy('fix');
    try {
      const r = await runAutofix({ brandId: kit.id, spec: working });
      if (r.improved && r.after) {
        st.getState().replaceWorking(r.spec, 'critic', `Auto-fix · ⚡${Math.round(r.before.total * 100)}→${Math.round(r.after.total * 100)}`);
        setLens(r.after);
      } else {
        setLens(r.before);
      }
    } finally {
      setLensBusy('');
    }
  }

  async function refreshConcept() {
    if (lensBusy) return;
    setLensBusy('refresh');
    try {
      const { specs } = await runRefresh({ brandId: kit.id, spec: working, n: 3 });
      st.getState().addBranches(specs, 'Refresh');
    } finally {
      setLensBusy('');
    }
  }

  // ----- re-skin: rebase this design onto another brand ---------------------
  async function reskinTo(toBrandId: string) {
    if (!toBrandId || lensBusy) return;
    setLensBusy('refresh');
    try {
      const { spec: reskinned } = await runReskin({ spec: working, toBrandId });
      const toKit = await getBrand(toBrandId);
      st.getState().setKit(toKit);
      // theme the chrome to the new brand
      const accent = toKit.colors.find((c: any) => c.roles?.includes('cta')) || toKit.colors.find((c: any) => c.roles?.includes('accent'));
      if (accent) {
        document.documentElement.style.setProperty('--accent', accent.value);
        document.documentElement.style.setProperty('--accent-ink', accent.value);
      }
      st.getState().addBranches([reskinned], `Re-skin → ${toKit.name}`);
      st.getState().switchBranch(useStore.getState().repo.branches.at(-1)!.name);
    } finally {
      setLensBusy('');
    }
  }

  // ----- launch-ready pack --------------------------------------------------
  async function exportPack() {
    if (lensBusy) return;
    setLensBusy('refresh');
    try {
      const otherPresets = kit.presets.filter((p) => p.id !== working.canvas.preset).slice(0, 3);
      // adapt to every other placement in parallel (agent re-layouts each)
      const adapted = await Promise.all(
        otherPresets.map((p) =>
          runAdapt({ brandId: kit.id, spec: working, presetId: p.id }).then((r) => ({ preset: p, spec: r.spec })).catch(() => null),
        ),
      );
      const all: { name: string; spec: DesignSpec }[] = [
        { name: working.canvas.preset, spec: working },
        ...adapted.filter(Boolean).map((a) => ({ name: a!.preset.id, spec: a!.spec })),
      ];

      const zip = new JSZip();
      for (const item of all) {
        const png = await renderSpecPng(item.spec, kit);
        zip.file(`${slug(working.name)}-${item.name}.png`, png.split(',')[1], { base64: true });
      }
      // copy sheet
      const texts = working.layers
        .filter((l) => ['text', 'pill', 'featureList'].includes(l.type))
        .map((l) => (l.type === 'featureList' ? `features: ${(l.items || []).join(', ')}` : `${l.role || l.type}: ${l.text}`));
      zip.file('copy-sheet.txt', `${working.name}\nBrand: ${kit.name}\n\n${texts.join('\n')}\n`);
      // compliance report
      try {
        const { score } = await runCritic({ brandId: kit.id, spec: working });
        zip.file(
          'brand-compliance.txt',
          `Brand CI report — ${kit.name}\nScore: ${Math.round(score.total * 100)}/100  (${score.pass ? 'PASS' : 'NEEDS WORK'})\n\n` +
            Object.entries(score.dimensions).map(([k, v]) => `${k}: ${Math.round((v as number) * 100)}`).join('\n') +
            (score.findings.length ? `\n\nFindings:\n${score.findings.map((f) => `[${f.severity}] ${f.message}`).join('\n')}` : '\n\nNo findings.'),
        );
      } catch { /* report is best-effort */ }

      const blob = await zip.generateAsync({ type: 'blob' });
      const a = document.createElement('a');
      a.download = `${slug(working.name)}-pack.zip`;
      a.href = URL.createObjectURL(blob);
      a.click();
      URL.revokeObjectURL(a.href);
    } finally {
      setLensBusy('');
    }
  }

  // ----- export -------------------------------------------------------------
  async function exportPng() {
    const node = stageRef.current;
    if (!node) return;
    const dataUrl = await toPng(node, {
      width: working.canvas.w,
      height: working.canvas.h,
      style: { transform: 'none' },
      pixelRatio: 1,
    });
    const a = document.createElement('a');
    a.download = `${working.name.replace(/\W+/g, '-').toLowerCase()}.png`;
    a.href = dataUrl;
    a.click();
  }

  // ----- selected-commit diff ----------------------------------------------
  const diffFor = (cid: string) => {
    const c = repo.commits[cid];
    const parent = c?.parents[0] && specOf(repo, c.parents[0]);
    const spec = specOf(repo, cid);
    if (!parent || !spec) return '';
    return diffSummary(diffSpecs(parent, spec), kit);
  };

  const swatches = kit.colors;

  const toast = useStore((s) => s.toast);
  const [replayTour, setReplayTour] = useState(0);

  return (
    <div className="ed">
      {toast && <div className="toast">{toast}</div>}
      <Coachmarks key={replayTour} steps={EDITOR_STEPS} storageKey="bw_tour_editor" run={replayTour > 0} onClose={() => setReplayTour(0)} />
      {/* ===== top bar ===== */}
      <div className="ed-top">
        <button className="ghost" onClick={() => st.getState().closeEditor()}>← Gallery</button>
        <div className="ed-branches">
          {repo.branches.map((b) => (
            <button key={b.name} className={'bchip' + (b.name === branch ? ' on' : '')} onClick={() => st.getState().switchBranch(b.name)}>
              ⎇ {b.name}
            </button>
          ))}
        </div>
        <div className="ed-title">{working.name}</div>
        <button className="ghost" onClick={refreshConcept} disabled={!!lensBusy} title="Creative fatigue? Generate fresh executions of this concept as new branches">
          {lensBusy === 'refresh' ? 'Working…' : '⟳ Refresh concept'}
        </button>
        <select
          className="ghost resel"
          value=""
          disabled={!!lensBusy}
          onChange={(e) => reskinTo(e.target.value)}
          title="Rebase this design onto a different brand — same skeleton, new DNA"
        >
          <option value="" disabled>⎌ Re-skin to…</option>
          {brandList.filter((b) => b.id !== kit.id).map((b) => (
            <option key={b.id} value={b.id}>{b.name}</option>
          ))}
        </select>
        <button className="ghost" onClick={exportPack} disabled={!!lensBusy} title="Zip with every placement size + copy sheet + brand-compliance report">
          📦 Export pack
        </button>
        <button className="go" onClick={exportPng}>Export PNG</button>
        <button className="helpbtn" title="Replay the editor tour" onClick={() => setReplayTour((n) => n + 1)}>?</button>
      </div>

      {viewingCommit && (
        <div className="ed-banner">
          Viewing an older version ({viewingCommit.slice(0, 6)}) — read-only.
          <button onClick={() => st.getState().restore(viewingCommit)}>Restore this version</button>
          <button className="ghost" onClick={() => st.getState().checkout(repo.branches.find((b) => b.name === branch)!.head)}>Back to latest</button>
        </div>
      )}

      <div className="ed-main">
        {/* ===== canvas ===== */}
        <div className="ed-canvas" ref={wrapRef} onPointerDown={() => st.getState().select(undefined)}>
          <div
            className="ed-stagewrap"
            style={{ width: working.canvas.w * scale, height: working.canvas.h * scale }}
          >
            <div
              ref={stageRef}
              className="dv-stage ed-stage"
              style={{ width: working.canvas.w, height: working.canvas.h, transform: `scale(${scale})`, background: working.canvas.background }}
            >
              {working.layers.map((l) => (
                <LayerView key={l.id} l={l} kit={kit} />
              ))}
              {/* hitboxes above the art, in canvas coordinates */}
              {working.layers.filter((l) => l.type !== 'background').map((l) => (
                <div
                  key={'hit' + l.id}
                  className={'ed-hit' + (l.id === selectedId ? ' sel' : '')}
                  style={{ left: l.box.x, top: l.box.y, width: l.box.w, height: l.box.h, ['--hs' as any]: `${2 / scale}px` }}
                  onPointerDown={(e) => startDrag(e, l, 'move')}
                >
                  {l.id === selectedId && !viewingCommit && (
                    <>
                      {(['nw', 'ne', 'sw', 'se'] as const).map((h) => (
                        <div key={h} className={'ed-handle ' + h} style={{ width: 14 / scale, height: 14 / scale }} onPointerDown={(e) => startDrag(e, l, h)} />
                      ))}
                    </>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ===== inspector ===== */}
        <aside className="ed-side" onPointerDown={(e) => e.stopPropagation()}>
          <div className="ed-chat">
            <div className="ed-sectitle">Copilot</div>
            <div className="ed-chatrow">
              <input
                value={chat}
                onChange={(e) => setChat(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && runChat()}
                placeholder='e.g. "make the headline bigger and use the yellow pill"'
                disabled={chatBusy || !!viewingCommit}
              />
              <button className="go" onClick={runChat} disabled={chatBusy || !!viewingCommit}>{chatBusy ? '…' : 'Apply'}</button>
            </div>
            {chatErr && <div className="ed-err">{chatErr}</div>}
          </div>

          <div className="ed-lens">
            <div className="ed-sectitle">
              Performance Lens {lens && <ScoreBadge score={lens} />}
              <span className="ed-actions">
                <button className="mini" onClick={checkLens} disabled={!!lensBusy}>{lensBusy === 'check' ? '…' : 'Check'}</button>
                <button className="mini fix" onClick={autofix} disabled={!!lensBusy}>{lensBusy === 'fix' ? 'Fixing…' : '🛡 Auto-fix'}</button>
              </span>
            </div>
            {lens && (
              <>
                <div className="ed-dims">
                  {Object.entries(lens.dimensions).map(([k, v]) => (
                    <span key={k} className={'dim' + (v < 0.6 ? ' low' : '')} title={`${k}: ${Math.round(v * 100)}`}>
                      {k} {Math.round(v * 100)}
                    </span>
                  ))}
                </div>
                {lens.findings.slice(0, 4).map((f, i) => (
                  <div key={i} className={'ed-finding ' + f.severity}>{f.severity === 'error' ? '●' : '○'} {f.message}</div>
                ))}
                {lens.insight && <div className="ed-finding info">💡 {lens.insight}</div>}
              </>
            )}
          </div>

          {selected ? (
            <div className="ed-props">
              <div className="ed-sectitle">
                {LAYER_ICON[selected.type]} {selected.type}
                <span className="ed-actions">
                  <button title="Send backward" onClick={() => { st.getState().reorderLayer(selected.id, -1); commitNow('Reordered layers'); }}>↓</button>
                  <button title="Bring forward" onClick={() => { st.getState().reorderLayer(selected.id, 1); commitNow('Reordered layers'); }}>↑</button>
                  <button title="Delete" onClick={() => { st.getState().removeLayer(selected.id); commitNow(`Removed ${selected.type}`); }}>🗑</button>
                </span>
              </div>

              {(selected.type === 'text' || selected.type === 'pill') && (
                <textarea
                  className="ed-textedit"
                  value={selected.text || ''}
                  onChange={(e) => st.getState().updateLayer(selected.id, { text: e.target.value })}
                  onBlur={() => commitNow(selected.type === 'pill' ? 'Edited CTA' : 'Edited text')}
                  rows={2}
                />
              )}

              {selected.type === 'text' && (
                <div className="ed-row">
                  {(['left', 'center', 'right'] as const).map((a) => (
                    <button key={a} className={'mini' + (selected.align === a ? ' on' : '')} onClick={() => { st.getState().updateLayer(selected.id, { align: a }); commitNow('Aligned text'); }}>{a}</button>
                  ))}
                </div>
              )}

              {selected.type === 'featureList' && (
                <textarea
                  className="ed-textedit"
                  value={(selected.items || []).join('\n')}
                  onChange={(e) => st.getState().updateLayer(selected.id, { items: e.target.value.split('\n') })}
                  onBlur={() => commitNow('Edited feature list')}
                  rows={4}
                />
              )}

              {selected.type === 'logo' && (
                <div className="ed-row">
                  {kit.assets.filter((a) => a.category === 'logo').map((a) => (
                    <button key={a.id} className={'mini' + (selected.assetId === a.id ? ' on' : '')} onClick={() => { st.getState().updateLayer(selected.id, { assetId: a.id, variant: a.variant, src: a.src }); commitNow(`Logo → ${a.variant}`); }}>
                      {a.variant}
                    </button>
                  ))}
                </div>
              )}

              {selected.type === 'image' && (
                <ImageTools key={selected.id} l={selected} onCommit={commitNow} w={working.canvas.w} h={working.canvas.h} />
              )}

              {/* colour swatches for anything colourable */}
              {['text', 'shape', 'bloom', 'pill', 'featureList'].includes(selected.type) && (
                <>
                  <div className="ed-sectitle sm">{selected.type === 'text' ? 'Colour' : 'Fill'}</div>
                  <div className="ed-swatches">
                    {swatches.map((c) => {
                      const field = selected.type === 'text' || selected.type === 'featureList' ? 'color' : 'fill';
                      const on = (selected as any)[field]?.toLowerCase() === c.value.toLowerCase();
                      return (
                        <button
                          key={c.token}
                          title={c.name}
                          className={'sw' + (on ? ' on' : '')}
                          style={{ background: c.value }}
                          onClick={() => { st.getState().updateLayer(selected.id, { [field]: c.value }); commitNow(`Recoloured ${selected.type}`); }}
                        />
                      );
                    })}
                  </div>
                  {selected.type === 'pill' && (
                    <>
                      <div className="ed-sectitle sm">Text colour</div>
                      <div className="ed-swatches">
                        {swatches.map((c) => (
                          <button key={c.token} title={c.name} className={'sw' + ((selected as any).textColor?.toLowerCase() === c.value.toLowerCase() ? ' on' : '')} style={{ background: c.value }} onClick={() => { st.getState().updateLayer(selected.id, { textColor: c.value }); commitNow('Recoloured CTA text'); }} />
                        ))}
                      </div>
                    </>
                  )}
                </>
              )}
            </div>
          ) : (
            <div className="ed-props">
              <div className="ed-sectitle">Canvas</div>
              <div className="ed-hint">Click any element to edit it. Drag to move, corners to resize.</div>
              <div className="ed-sectitle sm">Background</div>
              <div className="ed-swatches">
                {swatches.map((c) => (
                  <button key={c.token} title={c.name} className={'sw' + (working.canvas.background.toLowerCase() === c.value.toLowerCase() ? ' on' : '')} style={{ background: c.value }} onClick={() => { st.getState().updateCanvas({ background: c.value }); commitNow('Recoloured background'); }} />
                ))}
              </div>
            </div>
          )}

          {/* layers */}
          <div className="ed-layers">
            <div className="ed-sectitle">Layers</div>
            {[...working.layers].reverse().map((l) => (
              <button key={l.id} className={'ed-layerrow' + (l.id === selectedId ? ' on' : '')} onClick={() => st.getState().select(l.id)}>
                <span className="ic">{LAYER_ICON[l.type] || '·'}</span>
                <span className="nm">{l.type === 'text' ? (l.text || 'text').slice(0, 26) : l.type === 'pill' ? `CTA · ${l.text}` : l.type}</span>
              </button>
            ))}
          </div>

          {/* history */}
          <div className="ed-history">
            <div className="ed-sectitle">History <span className="cnt">{history.length}</span></div>
            {history.map((c) => {
              const head = repo.branches.find((b) => b.name === branch)?.head === c.id;
              const viewing = viewingCommit ? viewingCommit === c.id : head;
              return (
                <button key={c.id} className={'ed-commit' + (viewing ? ' on' : '')} onClick={() => st.getState().checkout(c.id)}>
                  <span className="dot" data-author={c.author}>{AUTHOR_ICON[c.author]}</span>
                  <span className="msg">
                    {c.message}
                    <small>{diffFor(c.id) || (c.parents.length ? '' : 'initial design')}</small>
                  </span>
                  <span className="sha">{c.id.slice(0, 6)}</span>
                </button>
              );
            })}
          </div>
        </aside>
      </div>
    </div>
  );
}

const slug = (s: string) => s.replace(/\W+/g, '-').toLowerCase();

/** Render a spec to a full-resolution PNG offscreen (fonts + images included). */
async function renderSpecPng(spec: DesignSpec, kit: BrandKit): Promise<string> {
  const host = document.createElement('div');
  host.style.cssText = 'position:fixed;left:-100000px;top:0;';
  document.body.appendChild(host);
  const root = createRoot(host);
  root.render(<DesignView spec={spec} kit={kit} width={spec.canvas.w} />);
  await new Promise((r) => setTimeout(r, 60));
  await Promise.all(Array.from(host.querySelectorAll('img')).map((im) => (im.complete ? null : new Promise((r) => { im.onload = im.onerror = r; }))));
  await new Promise((r) => setTimeout(r, 120)); // autosize text settle
  const stage = host.querySelector('.dv-stage') as HTMLElement;
  const png = await toPng(stage, { width: spec.canvas.w, height: spec.canvas.h, style: { transform: 'none' }, pixelRatio: 1 });
  root.unmount();
  host.remove();
  return png;
}

// Re-roll an image layer; every take is kept as a clickable candidate.
function ImageTools({ l, onCommit, w, h }: { l: Layer; onCommit: (m: string) => void; w: number; h: number }) {
  const st = useStore;
  const [busy, setBusy] = useState(false);
  const takes = useRef(1);
  const candidates: string[] = useMemo(() => (l.candidates as string[]) || (l.src ? [l.src] : []), [l.candidates, l.src]);

  async function reroll() {
    if (busy || !l.prompt) return;
    setBusy(true);
    try {
      takes.current += 1;
      const { url } = await regenImage({ prompt: l.prompt, w, h, take: takes.current });
      const next = [...new Set([...(l.candidates as string[] || (l.src ? [l.src] : [])), url])];
      st.getState().updateLayer(l.id, { src: url, status: 'ready', candidates: next });
      onCommit('Re-rolled image');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <div className="ed-hint" style={{ marginBottom: 8 }}>{l.prompt}</div>
      <button className="go wide" onClick={reroll} disabled={busy}>{busy ? 'Generating…' : '🎲 Re-roll image'}</button>
      {candidates.length > 1 && (
        <>
          <div className="ed-sectitle sm">Takes — every good render is kept</div>
          <div className="ed-takes">
            {candidates.map((src) => (
              <button key={src} className={'take' + (src === l.src ? ' on' : '')} onClick={() => { st.getState().updateLayer(l.id, { src }); onCommit('Switched image take'); }}>
                <img src={src} alt="" />
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
