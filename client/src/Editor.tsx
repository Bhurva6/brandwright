// The editor: direct manipulation (select / drag / resize / retype / recolor /
// reorder / delete / re-roll images) + conversational edits + version history.
// Every change becomes a commit on the active branch.
import { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { toPng, toJpeg, toSvg } from 'html-to-image';
import { jsPDF } from 'jspdf';
import JSZip from 'jszip';
import { DesignView } from './DesignView';
import type { DesignSpec, BrandKit } from './types';
import { useStore, useLog } from './store';
import type { Score } from './store';
import { LayerView } from './Layers';
import { diffSpecs, diffSummary, specOf, newId } from './vc';
import { editDesign, regenImage, runCritic, runAutofix, runRefresh, runAdapt, runReskin, runRemoveBg, getBrand } from './api';
import { ScoreBadge } from './App';
import { Coachmarks, EDITOR_STEPS } from './Coachmarks';
import { saveExport } from './library';
import { Icon } from './Icon';
import Exploded from './Exploded';
import { renderSpecToCanvas, renderSpecDataUrl } from './rasterize';
import type { Layer } from './types';

let layerClipboard: Layer | null = null; // copy/paste buffer (survives branch switches)

const LAYER_ICON: Record<string, string> = {
  background: 'square', image: 'image', text: 'type', shape: 'diamond', bloom: 'flower', charm: 'sparkle', logo: 'badge', pill: 'capsule', featureList: 'listChecks',
};
const AUTHOR_ICON = { human: 'user', generator: 'sparkles', critic: 'shield' } as const;

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
  interface FixReport {
    kind: 'pass' | 'improved' | 'nogain';
    before?: Score;
    after?: Score;
    changes?: string;
    resolved?: string[];
    dims?: [string, number, number][];
  }
  const [fixReport, setFixReport] = useState<FixReport>();
  const [xpMounted, setXpMounted] = useState(false);
  const [xpOpen, setXpOpen] = useState(false);
  const [lensBusy, setLensBusy] = useState<'' | 'check' | 'fix' | 'refresh'>('');
  const [brandList, setBrandList] = useState<{ id: string; name: string }[]>([]);
  useEffect(() => {
    fetch('/api/brands').then((r) => r.json()).then(setBrandList).catch(() => {});
  }, []);
  const stageRef = useRef<HTMLDivElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.5);

  const history = useLog();
  const streamScores = useStore((s) => s.scores);

  // a score is always on screen: seed from generation, else run a silent check
  useEffect(() => {
    setFixReport(undefined);
    const seeded = working && streamScores[working.id];
    if (seeded) { setLens(seeded as Score); return; }
    setLens(undefined);
    let dead = false;
    (async () => {
      if (!working || !kit) return;
      try {
        const { score } = await runCritic({ brandId: kit.id, spec: working });
        if (!dead) setLens(score);
      } catch { /* silent */ }
    })();
    return () => { dead = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [branch]);
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

  // ----- keyboard shortcuts -------------------------------------------------
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t?.matches?.('input, textarea, select, [contenteditable]')) return; // never hijack typing
      const s = st.getState();
      if (!s.working || s.viewingCommit) return;
      const mod = e.metaKey || e.ctrlKey;
      const sel = s.working.layers.find((l) => l.id === s.selectedId);

      if (mod && e.key.toLowerCase() === 'c' && sel && sel.type !== 'background') {
        layerClipboard = structuredClone(sel);
        e.preventDefault();
      } else if (mod && e.key.toLowerCase() === 'v' && layerClipboard) {
        const copy = structuredClone(layerClipboard);
        copy.id = newId('l');
        copy.box = { ...copy.box, x: copy.box.x + 24, y: copy.box.y + 24 };
        st.setState({ working: { ...s.working, layers: [...s.working.layers, copy] }, selectedId: copy.id, dirty: false });
        s.commitWorking('human', `Pasted ${copy.type}`);
        e.preventDefault();
      } else if (mod && e.key.toLowerCase() === 'd' && sel && sel.type !== 'background') {
        const copy = structuredClone(sel);
        copy.id = newId('l');
        copy.box = { ...copy.box, x: copy.box.x + 24, y: copy.box.y + 24 };
        st.setState({ working: { ...s.working, layers: [...s.working.layers, copy] }, selectedId: copy.id, dirty: false });
        s.commitWorking('human', `Duplicated ${copy.type}`);
        e.preventDefault();
      } else if (mod && e.key.toLowerCase() === 'z') {
        // undo = step the working tree back one commit
        const br = s.repo.branches.find((b) => b.name === s.branch);
        const parent = br && s.repo.commits[br.head]?.parents[0];
        const prev = parent && specOf(s.repo, parent);
        if (prev) s.replaceWorking(structuredClone(prev), 'human', 'Undo');
        e.preventDefault();
      } else if ((e.key === 'Delete' || e.key === 'Backspace') && sel && sel.type !== 'background') {
        s.removeLayer(sel.id);
        s.commitWorking('human', `Removed ${sel.type}`);
        e.preventDefault();
      } else if (e.key.startsWith('Arrow') && sel) {
        const step = e.shiftKey ? 24 : 3;
        const b = { ...sel.box };
        if (e.key === 'ArrowLeft') b.x -= step;
        if (e.key === 'ArrowRight') b.x += step;
        if (e.key === 'ArrowUp') b.y -= step;
        if (e.key === 'ArrowDown') b.y += step;
        s.updateLayer(sel.id, { box: b }); // debounced auto-commit picks this up
        e.preventDefault();
      } else if (e.key === 'Escape') {
        s.select(undefined);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

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
    setFixReport(undefined);
    try {
      const prevSpec = structuredClone(working);
      const r: any = await runAutofix({ brandId: kit.id, spec: working });
      if (r.improved && r.after) {
        // receipts: what changed, what got resolved, which dimensions moved
        const changes = diffSummary(diffSpecs(prevSpec, r.spec), kit);
        const afterMsgs = new Set((r.after.findings || []).map((f: any) => f.message));
        const resolved = (r.before.findings || [])
          .filter((f: any) => f.severity !== 'info' && !afterMsgs.has(f.message))
          .map((f: any) => f.message);
        const dims: [string, number, number][] = Object.keys(r.after.dimensions)
          .map((k): [string, number, number] => [k, Math.round((r.before.dimensions[k] || 0) * 100), Math.round(r.after.dimensions[k] * 100)])
          .filter(([, b, a]) => a - b >= 5);
        st.getState().replaceWorking(r.spec, 'critic', `Auto-fix · ${Math.round(r.before.total * 100)}→${Math.round(r.after.total * 100)}`);
        setLens(r.after);
        setFixReport({ kind: 'improved', before: r.before, after: r.after, changes, resolved, dims });
      } else if (r.reason === 'already-passing') {
        setLens(r.before);
        setFixReport({ kind: 'pass', before: r.before });
      } else {
        // honest no-gain: nothing was applied
        setLens(r.before);
        setFixReport({ kind: 'nogain', before: r.before, after: r.after });
      }
    } catch (e: any) {
      useStore.setState({ toast: 'Auto-fix failed: ' + (e?.message || e) });
      setTimeout(() => useStore.setState({ toast: undefined }), 4000);
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
      if (accent) document.documentElement.style.setProperty('--brand', accent.value);
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
      await exportPackInner();
    } catch (e: any) {
      console.error('export pack failed', e);
      useStore.setState({ toast: 'Export pack failed: ' + (e?.message || e) });
      setTimeout(() => useStore.setState({ toast: undefined }), 6000);
    } finally {
      setLensBusy('');
    }
  }

  async function exportPackInner() {
    {
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
        try {
          const png = await renderSpecPng(item.spec, kit);
          zip.file(`${slug(working.name)}-${item.name}.png`, png.split(',')[1], { base64: true });
          saveExport({ id: newId('x'), name: working.name, brand: kit.name, preset: item.name, at: Date.now(), dataUrl: png }).catch(() => {});
        } catch (e) {
          console.error('pack: render failed for', item.name, e); // skip a bad size, keep the pack
        }
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
    }
  }

  // ----- export (png / jpeg / svg / pdf / motion webm) ---------------------
  const [exportFmt, setExportFmt] = useState('png');

  function download(href: string, ext: string) {
    const a = document.createElement('a');
    a.download = `${working.name.replace(/\W+/g, '-').toLowerCase()}.${ext}`;
    a.href = href;
    a.click();
  }

  async function exportPng() {
    const node = stageRef.current;
    if (!node) return;
    const opts = { width: working.canvas.w, height: working.canvas.h, style: { transform: 'none' as const }, pixelRatio: 1 };
    try {
      if (exportFmt === 'jpeg') {
        const url = await renderSpecDataUrl(working, kit, 'image/jpeg', 0.92);
        download(url, 'jpg');
        saveExport({ id: newId('x'), name: working.name, brand: kit.name, preset: working.canvas.preset, at: Date.now(), dataUrl: url }).catch(() => {});
        return;
      }
      if (exportFmt === 'svg') return download(await toSvg(node, opts), 'svg');
      const dataUrl = await renderSpecDataUrl(working, kit);
      if (exportFmt === 'pdf') {
        const landscape = working.canvas.w >= working.canvas.h;
        const pdf = new jsPDF({ orientation: landscape ? 'l' : 'p', unit: 'px', format: [working.canvas.w, working.canvas.h] });
        pdf.addImage(dataUrl, 'PNG', 0, 0, working.canvas.w, working.canvas.h);
        pdf.save(`${working.name.replace(/\W+/g, '-').toLowerCase()}.pdf`);
      } else {
        download(dataUrl, 'png');
      }
      // every raster export lands in the Library so nothing is ever lost
      try {
        await saveExport({ id: newId('x'), name: working.name, brand: kit.name, preset: working.canvas.preset, at: Date.now(), dataUrl });
        useStore.setState({ toast: 'Saved to Drafts' });
        setTimeout(() => useStore.setState({ toast: undefined }), 3000);
      } catch { /* best-effort */ }
    } catch (e: any) {
      useStore.setState({ toast: 'Export failed: ' + (e?.message || e) });
      setTimeout(() => useStore.setState({ toast: undefined }), 5000);
    }
  }

  /** Motion export: the design builds itself — layers reveal in stages,
   *  recorded off a canvas straight to WebM. No services, all in-browser. */
  async function exportMotion() {
    const W = working.canvas.w, H = working.canvas.h;
    const groups: string[][] = [
      ['background', 'shape', 'bloom'],
      ['image', 'charm'],
      ['text'],
      ['pill', 'featureList', 'logo'],
    ];
    useStore.setState({ toast: 'Rendering motion…' });
    // cumulative stage frames — native canvas render, a failed stage is skipped
    const frames: HTMLCanvasElement[] = [];
    for (let g = 0; g < groups.length; g++) {
      try {
        const allowed = new Set(groups.slice(0, g + 1).flat());
        const c = await renderSpecToCanvas(working, kit, (l) => allowed.has(l.type));
        if (c.width > 0) frames.push(c);
      } catch (e) {
        console.error('motion: stage frame failed', g, e);
      }
    }
    if (frames.length === 0) {
      useStore.setState({ toast: 'Motion export failed — could not render the design' });
      setTimeout(() => useStore.setState({ toast: undefined }), 4000);
      return;
    }
    const canvas = document.createElement('canvas');
    canvas.width = W; canvas.height = H;
    const ctx = canvas.getContext('2d')!;
    const stream = canvas.captureStream(30);
    const mime = MediaRecorder.isTypeSupported('video/webm;codecs=vp9') ? 'video/webm;codecs=vp9' : 'video/webm';
    const rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 8_000_000 });
    const chunks: Blob[] = [];
    rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    const done = new Promise<void>((r) => (rec.onstop = () => r()));
    rec.start();

    const STAGE_MS = 650, HOLD_MS = 1200;
    const ease = (t: number) => 1 - Math.pow(1 - t, 3);
    const t0 = performance.now();
    const total = frames.length * STAGE_MS + HOLD_MS;
    await new Promise<void>((resolve) => {
      const tick = (now: number) => {
        try {
          const t = now - t0;
          const stage = Math.max(0, Math.min(Math.floor(t / STAGE_MS), frames.length - 1));
          const p = stage === frames.length - 1 && t > frames.length * STAGE_MS ? 1 : Math.min(Math.max((t - stage * STAGE_MS) / STAGE_MS, 0), 1);
          ctx.fillStyle = '#fff';
          ctx.fillRect(0, 0, W, H);
          const prev = frames[stage - 1];
          const cur = frames[stage];
          if (prev) ctx.drawImage(prev, 0, 0, W, H);
          if (cur) {
            ctx.globalAlpha = ease(p);
            const k = 1.015 - 0.015 * ease(p); // subtle settle
            ctx.drawImage(cur, (W - W * k) / 2, (H - H * k) / 2 + (1 - ease(p)) * 14, W * k, H * k);
            ctx.globalAlpha = 1;
          }
          if (t < total) requestAnimationFrame(tick);
          else resolve();
        } catch (e) {
          console.error('motion tick', e);
          resolve(); // finish the recording rather than crash
        }
      };
      requestAnimationFrame(tick);
    });
    rec.stop();
    await done;
    download(URL.createObjectURL(new Blob(chunks, { type: 'video/webm' })), 'webm');
    useStore.setState({ toast: 'Motion exported (WebM)' });
    setTimeout(() => useStore.setState({ toast: undefined }), 3500);
  }

  function renameWorking(name: string) {
    const clean = name.trim();
    if (!clean || clean === working.name) return;
    st.setState({ working: { ...working, name: clean }, dirty: false });
    st.getState().commitWorking('human', `Renamed to “${clean.slice(0, 30)}”`);
  }

  // ----- add layers by hand (blank-canvas workflow) -------------------------
  function addLayer(type: string) {
    const W = working.canvas.w, H = working.canvas.h;
    const ink = kit.colors.find((c) => (c as any).roles?.includes('text'))?.value || '#111111';
    const accent = kit.colors.find((c) => (c as any).roles?.includes('cta'))?.value || kit.colors.find((c) => (c as any).roles?.includes('accent'))?.value || '#333333';
    const mid = (w: number, h: number) => ({ x: Math.round((W - w) / 2), y: Math.round((H - h) / 2), w, h });
    const asset = (cat: string) => kit.assets.find((a) => a.category === cat);
    let l: any = null;
    if (type === 'text') l = { type, box: mid(W * 0.8, H * 0.14), text: 'New text', role: 'headline', size: Math.round(H * 0.07), color: ink, align: 'left' };
    if (type === 'body') l = { type: 'text', box: mid(W * 0.7, H * 0.08), text: 'Supporting line goes here.', role: 'body', size: Math.round(H * 0.032), color: ink, align: 'left' };
    if (type === 'shape') l = { type, box: mid(W * 0.5, H * 0.3), kind: 'rect', fill: accent, radius: 0.06 };
    if (type === 'bloom') { const a = asset('bloom'); if (!a) return; l = { type, box: mid(W * 0.4, H * 0.4), assetId: a.id, src: a.src, fill: accent }; }
    if (type === 'charm') { const a = asset('charm'); if (!a) return; l = { type, box: mid(W * 0.18, H * 0.18), assetId: a.id, src: a.src }; }
    if (type === 'pill') l = { type, box: { x: Math.round(W * 0.08), y: Math.round(H * 0.8), w: Math.round(W * 0.34), h: Math.round(H * 0.075) }, text: 'Call to action', fill: accent, textColor: '#FFFFFF' };
    if (type === 'featureList') l = { type, box: mid(W * 0.5, H * 0.2), items: ['FEATURE ONE', 'FEATURE TWO'], color: ink, markColor: '#4FB985', columns: 1 };
    if (type === 'logo') { const logos: any[] = kit.assets.filter((x) => x.category === 'logo'); const a: any = logos.find((x) => x.variant && x.variant !== 'white') || logos[0]; if (!a) return; l = { type, box: { x: Math.round(W * 0.08), y: Math.round(H * 0.9), w: Math.round(W * 0.22), h: Math.round(H * 0.06) }, assetId: a.id, variant: a.variant, src: a.src, text: a.text, fontFamily: a.fontFamily, fontWeight: a.fontWeight, color: a.color }; }
    if (type === 'image') l = { type, box: mid(W * 0.7, H * 0.5), prompt: '', fit: 'cover', status: 'pending' };
    if (!l) return;
    l.id = newId('l');
    st.setState({ working: { ...working, layers: [...working.layers, l] }, selectedId: l.id, dirty: false });
    st.getState().commitWorking('human', `Added ${l.type}`);
  }

  function addPhoto(file: File) {
    if (!file.type.startsWith('image/')) return;
    const rd = new FileReader();
    rd.onload = () => {
      const W = working.canvas.w, H = working.canvas.h;
      const l: any = { id: newId('l'), type: 'image', box: { x: Math.round(W * 0.2), y: Math.round(H * 0.2), w: Math.round(W * 0.6), h: Math.round(H * 0.6) }, src: rd.result as string, fit: 'contain', status: 'ready' };
      st.setState({ working: { ...working, layers: [...working.layers, l] }, selectedId: l.id, dirty: false });
      st.getState().commitWorking('human', 'Placed photo');
    };
    rd.readAsDataURL(file);
  }

  // ----- CMYK print check ---------------------------------------------------
  const [printPrev, setPrintPrev] = useState<{ screen: string; print: string } | null>(null);
  async function printCheck() {
    useStore.setState({ toast: 'Simulating print…' });
    const base = await renderSpecToCanvas(working, kit);
    const screen = base.toDataURL('image/png');
    const c = document.createElement('canvas');
    c.width = base.width; c.height = base.height;
    const ctx = c.getContext('2d')!;
    ctx.drawImage(base, 0, 0);
    const d = ctx.getImageData(0, 0, c.width, c.height);
    const px = d.data;
    for (let i = 0; i < px.length; i += 4) {
      // naive RGB -> CMYK -> RGB round-trip approximates coated-stock gamut loss
      const r = px[i] / 255, g = px[i + 1] / 255, b = px[i + 2] / 255;
      const k = 1 - Math.max(r, g, b);
      const den = 1 - k || 1;
      const cy = (1 - r - k) / den, m = (1 - g - k) / den, y = (1 - b - k) / den;
      // ink-limit squeeze: very saturated colours dull slightly
      const limit = Math.min(1, 3.2 / (cy + m + y + k + 0.0001));
      px[i] = Math.round(255 * (1 - Math.min(1, cy * limit)) * (1 - k * 0.96));
      px[i + 1] = Math.round(255 * (1 - Math.min(1, m * limit)) * (1 - k * 0.96));
      px[i + 2] = Math.round(255 * (1 - Math.min(1, y * limit)) * (1 - k * 0.96));
    }
    ctx.putImageData(d, 0, 0);
    setPrintPrev({ screen, print: c.toDataURL('image/png') });
    useStore.setState({ toast: undefined });
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
      <Coachmarks key={replayTour} steps={EDITOR_STEPS} storageKey="bw_tour_editor_v2" run={replayTour > 0} onClose={() => setReplayTour(0)} />
      {/* ===== top bar ===== */}
      <div className="ed-top">
        <button className="ghost" onClick={() => st.getState().closeEditor()}><Icon name="back" /> Gallery</button>
        <div className="ed-branches">
          {repo.branches.map((b) => (
            <button key={b.name} className={'bchip' + (b.name === branch ? ' on' : '')} onClick={() => st.getState().switchBranch(b.name)}>
              <Icon name="branch" size={12} /> {b.name}
            </button>
          ))}
        </div>
        <input
          className="ed-title"
          key={working.id + working.name}
          defaultValue={working.name}
          title="Rename this design"
          onBlur={(e) => renameWorking(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
        />
        <button
          className="ghost"
          title="See the design split into its true layers — drag to orbit"
          onClick={() => {
            if (!xpMounted) { setXpMounted(true); setXpOpen(true); }
            else { setXpOpen(false); setTimeout(() => setXpMounted(false), 760); }
          }}
        >
          <Icon name="layers" /> {xpMounted && xpOpen ? 'Compact' : 'Show layers'}
        </button>
        <button className="ghost" onClick={refreshConcept} disabled={!!lensBusy} title="Creative fatigue? Generate fresh executions of this concept as new branches">
          {lensBusy === 'refresh' ? 'Working…' : <><Icon name="refresh" /> Refresh</>}
        </button>
        <select
          className="ghost resel"
          value=""
          disabled={!!lensBusy}
          onChange={(e) => reskinTo(e.target.value)}
          title="Rebase this design onto a different brand — same skeleton, new DNA"
        >
          <option value="" disabled>Re-skin to…</option>
          {brandList.filter((b) => b.id !== kit.id).map((b) => (
            <option key={b.id} value={b.id}>{b.name}</option>
          ))}
        </select>
        <button
          className="ghost"
          title="Save this draft to your Drafts"
          onClick={async () => {
            try {
              const url = await renderSpecDataUrl(working, kit);
              await saveExport({ id: newId('x'), name: working.name, brand: kit.name, preset: working.canvas.preset, at: Date.now(), dataUrl: url });
              useStore.setState({ toast: 'Saved to Drafts' });
            } catch (err: any) {
              useStore.setState({ toast: 'Save failed: ' + (err?.message || err) });
            }
            setTimeout(() => useStore.setState({ toast: undefined }), 3000);
          }}
        >
          <Icon name="folder" /> Save draft
        </button>
        <button
          className="ghost favbtn"
          title="Save this design straight to Favourites"
          onClick={async () => {
            try {
              const url = await renderSpecDataUrl(working, kit);
              await saveExport({ id: newId('x'), name: working.name, brand: kit.name, preset: working.canvas.preset, at: Date.now(), dataUrl: url, fav: true });
              useStore.setState({ toast: 'Saved to Favourites' });
            } catch (err: any) {
              useStore.setState({ toast: 'Save failed: ' + (err?.message || err) });
            }
            setTimeout(() => useStore.setState({ toast: undefined }), 3000);
          }}
        >
          <Icon name="heart" />
        </button>
        <button className="ghost" onClick={exportPack} disabled={!!lensBusy} title="Zip with every placement size + copy sheet + brand-compliance report">
          <Icon name="package" /> Pack
        </button>
        <button className="ghost" onClick={exportMotion} disabled={!!lensBusy} title="Render this design as a layer-reveal video (WebM)">
          <Icon name="play" /> Motion
        </button>
        <select className="ghost resel fmtsel" value={exportFmt} onChange={(e) => setExportFmt(e.target.value)} title="Export format">
          <option value="png">PNG</option>
          <option value="jpeg">JPEG</option>
          <option value="svg">SVG</option>
          <option value="pdf">PDF</option>
          
        </select>
        <button className="go" onClick={exportPng}>Export</button>
        <button className="helpbtn" title="Replay the editor tour" onClick={() => setReplayTour((n) => n + 1)}>?</button>
      </div>

      {printPrev && (
        <div className="printprev" onClick={() => setPrintPrev(null)}>
          <div className="printprev-card" onClick={(e) => e.stopPropagation()}>
            <div className="ed-sectitle"><Icon name="printer" /> Print check — screen (RGB) vs simulated print (CMYK)</div>
            <div className="printprev-row">
              <figure><img src={printPrev.screen} alt="screen" /><figcaption>Screen</figcaption></figure>
              <figure><img src={printPrev.print} alt="print" /><figcaption>Print (simulated)</figcaption></figure>
            </div>
            <div className="ed-hint">Saturated brand colours dull slightly on press — if the two look far apart, pick tokens that survive ink limits. Click outside to close.</div>
          </div>
        </div>
      )}

      {viewingCommit && (
        <div className="ed-banner">
          Viewing an older version ({viewingCommit.slice(0, 6)}) — read-only.
          <button onClick={() => st.getState().restore(viewingCommit)}>Restore this version</button>
          <button className="ghost" onClick={() => st.getState().checkout(repo.branches.find((b) => b.name === branch)!.head)}>Back to latest</button>
        </div>
      )}

      <div className="ed-main">
        {/* ===== inspector ===== */}
        <aside className="ed-side" onPointerDown={(e) => e.stopPropagation()}>
          <div className="ed-lens">
            <div className="ed-sectitle">
              Performance Lens {lens && <ScoreBadge score={lens} />}
              <span className="ed-actions">
                <button className="mini" onClick={checkLens} disabled={!!lensBusy}>{lensBusy === 'check' ? '…' : 'Check'}</button>
                <button className="mini fix" onClick={autofix} disabled={!!lensBusy}>{lensBusy === 'fix' ? 'Fixing…' : <><Icon name="shield" size={12} /> Auto-fix</>}</button>
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
                <Icon name={LAYER_ICON[selected.type]} /> {selected.type}
                <span className="ed-actions">
                  <button title="Send backward" onClick={() => { st.getState().reorderLayer(selected.id, -1); commitNow('Reordered layers'); }}><Icon name="chevDown" size={13} /></button>
                  <button title="Bring forward" onClick={() => { st.getState().reorderLayer(selected.id, 1); commitNow('Reordered layers'); }}><Icon name="chevUp" size={13} /></button>
                  <button title="Delete" onClick={() => { st.getState().removeLayer(selected.id); commitNow(`Removed ${selected.type}`); }}><Icon name="trash" size={13} /></button>
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
              <div className="ed-hint">
                Click any element to edit it. Drag to move, corners to resize.
                <br />
                <kbd>⌘C</kbd> copy · <kbd>⌘V</kbd> paste · <kbd>⌘D</kbd> duplicate · <kbd>⌫</kbd> delete · <kbd>←↑↓→</kbd> nudge (<kbd>⇧</kbd> = more) · <kbd>⌘Z</kbd> undo
              </div>
              <div className="ed-sectitle sm">Background</div>
              <div className="ed-swatches">
                {swatches.map((c) => (
                  <button key={c.token} title={c.name} className={'sw' + (working.canvas.background.toLowerCase() === c.value.toLowerCase() ? ' on' : '')} style={{ background: c.value }} onClick={() => { st.getState().updateCanvas({ background: c.value }); commitNow('Recoloured background'); }} />
                ))}
              </div>
            </div>
          )}

          {/* add layers */}
          <div className="ed-addrow">
            <div className="ed-sectitle">Add</div>
            <div className="ed-row">
              {[
                ['text', 'type', 'Headline'], ['body', 'type', 'Body'], ['image', 'image', 'Image'], ['shape', 'diamond', 'Shape'],
                ['bloom', 'flower', 'Bloom'], ['charm', 'sparkle', 'Charm'], ['pill', 'capsule', 'CTA'], ['featureList', 'listChecks', 'Features'], ['logo', 'badge', 'Logo'],
              ].filter(([t]) => !['bloom', 'charm'].includes(t) || kit.assets.some((a) => a.category === t)).map(([t, ic, label]) => (
                <button key={t} className="mini" disabled={!!viewingCommit} onClick={() => addLayer(t)}><Icon name={ic} size={12} /> {label}</button>
              ))}
              <label className="mini filelab" title="Place your own photo on the canvas">
                <Icon name="camera" size={12} /> Photo
                <input type="file" accept="image/*" style={{ display: 'none' }} onChange={(e) => e.target.files?.[0] && addPhoto(e.target.files[0])} />
              </label>
            </div>
            <button className="mini" style={{ marginTop: 8 }} onClick={printCheck} title="Simulate how the inks will shift in CMYK print"><Icon name="printer" size={12} /> Print check</button>
          </div>

          {/* layers */}
          <div className="ed-layers">
            <div className="ed-sectitle">Layers</div>
            {[...working.layers].reverse().map((l) => (
              <button key={l.id} className={'ed-layerrow' + (l.id === selectedId ? ' on' : '')} onClick={() => st.getState().select(l.id)}>
                <span className="ic"><Icon name={LAYER_ICON[l.type] || 'square'} size={13} /></span>
                <span className="nm">{l.type === 'text' ? (l.text || 'text').slice(0, 26) : l.type === 'pill' ? `CTA · ${l.text}` : l.type}</span>
              </button>
            ))}
          </div>

          {/* history */}
        </aside>
        {/* ===== canvas ===== */}
        <div className="ed-canvas" ref={wrapRef} onPointerDown={() => st.getState().select(undefined)}>
          {xpMounted && <Exploded spec={working} kit={kit} scale={scale} open={xpOpen} />}
          <div
            className="ed-stagewrap"
            hidden={xpMounted}
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
        {/* ===== history (right) ===== */}
        <aside className="ed-right" onPointerDown={(e) => e.stopPropagation()}>
          <div className="ed-history">
            <div className="ed-sectitle">History <span className="cnt">{history.length}</span></div>
            {history.map((c) => {
              const head = repo.branches.find((b) => b.name === branch)?.head === c.id;
              const viewing = viewingCommit ? viewingCommit === c.id : head;
              return (
                <button key={c.id} className={'ed-commit' + (viewing ? ' on' : '')} onClick={() => st.getState().checkout(c.id)}>
                  <span className="dot" data-author={c.author}><Icon name={AUTHOR_ICON[c.author]} size={13} /></span>
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

      {/* ===== copilot (bottom bar) ===== */}
      <div className="ed-chat ed-chatbar" onPointerDown={(e) => e.stopPropagation()}>
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

    </div>
  );
}

const slug = (s: string) => s.replace(/\W+/g, '-').toLowerCase();

/** Render a spec to a full-resolution PNG — native canvas engine, no DOM screenshots. */
async function renderSpecPng(spec: DesignSpec, kit: BrandKit): Promise<string> {
  return renderSpecDataUrl(spec, kit);
}

// Re-roll an image layer; every take is kept as a clickable candidate.
function ImageTools({ l, onCommit, w, h }: { l: Layer; onCommit: (m: string) => void; w: number; h: number }) {
  const st = useStore;
  const [busy, setBusy] = useState(false);
  const [bgBusy, setBgBusy] = useState(false);

  async function removeBg() {
    if (bgBusy || !l.src) return;
    setBgBusy(true);
    useStore.setState({ toast: 'Removing background…' });
    try {
      const { url } = await runRemoveBg({ src: l.src });
      const next = [...new Set([...(l.candidates as string[] || [l.src]), url])];
      st.getState().updateLayer(l.id, { src: url, fit: 'contain', candidates: next });
      onCommit('Removed background');
      useStore.setState({ toast: 'Background removed' });
    } catch (e: any) {
      useStore.setState({ toast: 'Remove background failed: ' + (e?.message || e) });
    } finally {
      setBgBusy(false);
      setTimeout(() => useStore.setState({ toast: undefined }), 3500);
    }
  }
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
      <div className="ed-sectitle sm">Image prompt</div>
      <textarea
        className="ed-textedit"
        rows={3}
        placeholder="Describe the imagery… e.g. “sunlit flat-lay of fresh coffee beans, warm tones”"
        value={l.prompt || ''}
        onChange={(e) => st.getState().updateLayer(l.id, { prompt: e.target.value })}
        onBlur={() => onCommit('Edited image prompt')}
      />
      <button className="go wide" style={{ marginTop: 8 }} onClick={reroll} disabled={busy || !l.prompt}>
        {busy ? 'Generating…' : l.src ? <><Icon name="shuffle" /> Re-roll image</> : <><Icon name="sparkles" /> Generate image</>}
      </button>
      {l.src && (
        <button className="mini wide" style={{ marginTop: 8, width: '100%' }} onClick={removeBg} disabled={bgBusy} title="Cut the subject out onto a transparent background">
          <Icon name="scissors" size={12} /> {bgBusy ? 'Removing…' : 'Remove background'}
        </button>
      )}
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
