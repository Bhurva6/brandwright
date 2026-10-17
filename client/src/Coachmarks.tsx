// Lightweight coachmarks: a spotlight cutout + tooltip card per step.
// No deps — a fixed "hole" element whose giant box-shadow shades everything
// else. Tours run once (localStorage) and can be replayed from the ? button.
import { useCallback, useEffect, useLayoutEffect, useState } from 'react';

export interface CoachStep {
  target: string; // CSS selector
  title: string;
  text: string;
}

interface Props {
  steps: CoachStep[];
  storageKey: string; // e.g. 'bw_tour_home'
  run?: boolean; // force-run (replay), ignoring storage
  onClose?: () => void;
}

export const tourSeen = (key: string) => localStorage.getItem(key) === 'done';

export function Coachmarks({ steps, storageKey, run, onClose }: Props) {
  const [i, setI] = useState(0);
  const [active, setActive] = useState(false);
  const [rect, setRect] = useState<{ x: number; y: number; w: number; h: number } | null>(null);

  // start: forced replay, or first visit — wait for entrance animations to settle
  useEffect(() => {
    if (run) {
      setI(0);
      setActive(true);
    } else if (!tourSeen(storageKey)) {
      const t = setTimeout(() => setActive(true), 1100);
      return () => clearTimeout(t);
    }
  }, [run, storageKey]);

  const close = useCallback(() => {
    localStorage.setItem(storageKey, 'done');
    setActive(false);
    onClose?.();
  }, [storageKey, onClose]);

  // measure the current step's target (skip steps whose target is missing)
  const measure = useCallback(() => {
    if (!active) return;
    let idx = i;
    let el: Element | null = null;
    while (idx < steps.length && !(el = document.querySelector(steps[idx].target))) idx++;
    if (!el || idx >= steps.length) { close(); return; }
    if (idx !== i) { setI(idx); return; }
    if (el.getBoundingClientRect().top < 0 || el.getBoundingClientRect().bottom > window.innerHeight) (el as HTMLElement).scrollIntoView({ block: 'nearest', inline: 'nearest' });
    const r = el.getBoundingClientRect();
    setRect({ x: r.left - 6, y: r.top - 6, w: r.width + 12, h: r.height + 12 });
  }, [active, i, steps, close]);

  useLayoutEffect(measure, [measure]);
  // re-measure a few beats after activation/step changes — targets may still be
  // animating (canvas scale-in, panel slide) when the first measurement lands
  useEffect(() => {
    if (!active) return;
    const t1 = setTimeout(measure, 300);
    const t2 = setTimeout(measure, 750);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [active, i, measure]);
  useEffect(() => {
    if (!active) return;
    const onR = () => measure();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
      if (e.key === 'ArrowRight' || e.key === 'Enter') setI((x) => x + 1);
    };
    window.addEventListener('resize', onR);
    window.addEventListener('scroll', onR, true);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('resize', onR);
      window.removeEventListener('scroll', onR, true);
      window.removeEventListener('keydown', onKey);
    };
  }, [active, measure, close]);

  useEffect(() => {
    if (active && i >= steps.length) close();
  }, [i, active, steps.length, close]);

  if (!active || !rect || i >= steps.length) return null;
  const step = steps[i];

  // tooltip placement: below the target if there's room, else above
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const below = rect.y + rect.h + 190 < vh;
  const tipTop = below ? rect.y + rect.h + 14 : undefined;
  const tipBottom = below ? undefined : vh - rect.y + 14;
  const tipLeft = Math.max(12, Math.min(rect.x, vw - 332));

  return (
    <div className="cm-root" role="dialog" aria-label={step.title}>
      <div className="cm-hole" style={{ left: rect.x, top: rect.y, width: rect.w, height: rect.h }} onClick={() => setI(i + 1)} />
      <div className="cm-tip" style={{ left: tipLeft, top: tipTop, bottom: tipBottom }}>
        <div className="cm-count">{i + 1} / {steps.length}</div>
        <div className="cm-title">{step.title}</div>
        <div className="cm-text">{step.text}</div>
        <div className="cm-row">
          <button className="cm-skip" onClick={close}>Skip tour</button>
          {i > 0 && <button className="cm-back" onClick={() => setI(i - 1)}>Back</button>}
          <button className="cm-next" onClick={() => setI(i + 1)}>{i === steps.length - 1 ? 'Done' : 'Next'}</button>
        </div>
      </div>
    </div>
  );
}

export const HOME_STEPS: CoachStep[] = [
  {
    target: '.genome',
    title: 'Pick a brand genome',
    text: 'Brandwright learns a brand\'s DNA — colours, fonts, logos, voice, rules. Five brands ship ready, or pick "+ Ingest new brand" and teach it yours from a folder of assets.',
  },
  {
    target: '.composer textarea',
    title: 'Describe the ad you want',
    text: 'Plain words work: "Create 4 images promoting our summer offer." The copilot designs real, editable layouts — never flat images.',
  },
  {
    target: '.chips',
    title: 'Or tap an example brief',
    text: 'Each brand brings its own example briefs. One tap generates instantly, scored live by the Performance Lens.',
  },
  {
    target: '.controls',
    title: 'Start your way',
    text: 'Up to 8 variations per run — each lands as a branch. Or go manual: Blank canvas builds from scratch, Import edits an existing design, and Campaign makes 3 concepts × every placement size in one go.',
  },
  {
    target: '.refstrip',
    title: 'Remix any reference',
    text: 'Pick a reference ad — or "+ Your reference" to describe one you\'ve seen — and Brandwright rebuilds its structure in the active brand\'s DNA.',
  },
  {
    target: '.libbtn',
    title: 'Nothing gets lost',
    text: 'Save drafts and exports here — and your whole session — designs, branches, history — survives a refresh.',
  },
];

export const EDITOR_STEPS: CoachStep[] = [
  {
    target: '.ed-stagewrap',
    title: 'Everything is editable',
    text: 'Click to select, drag to move, pull corners to resize. Shortcuts too: ⌘C copy · ⌘V paste · ⌘D duplicate · ⌫ delete · arrows nudge · ⌘Z undo.',
  },
  {
    target: '.ed-title',
    title: 'Name it',
    text: 'Click the title to rename the design — even the rename is a commit.',
  },
  {
    target: '.ed-chat',
    title: 'Talk to the canvas',
    text: 'Tell the copilot what to change: "make the headline bigger and use the yellow pill." It edits the design, not the whole picture.',
  },
  {
    target: '.ed-lens',
    title: 'Performance Lens',
    text: 'The critic agent scores the design on brand rules and ad-performance dimensions. Auto-fix repairs issues and shows the score climb.',
  },
  {
    target: '.ed-addrow',
    title: 'Build by hand too',
    text: 'Add headlines, imagery, shapes, blooms, CTAs — all snapped to brand tokens. Print check previews how the inks shift in CMYK.',
  },
  {
    target: '.ed-branches',
    title: 'Branches = creative directions',
    text: 'Each variation is a branch. Switch any time — nothing is ever lost.',
  },
  {
    target: '.ed-history',
    title: 'Every change is a commit',
    text: 'Yours, the generator\'s and the critic\'s edits land in one history with semantic diffs. Click any version to view; restore brings it back.',
  },
  {
    target: 'select.resel:not(.fmtsel)',
    title: 'The magic trick: re-skin',
    text: 'Rebase this exact design onto a different brand — same skeleton, new DNA. Next to it: refresh a tired concept, export a launch pack.',
  },
  {
    target: 'select.fmtsel',
    title: 'Export anything',
    text: 'PNG, JPEG, SVG, print-ready PDF — or Motion, which renders your design as a layer-reveal video. Everything is kept in your Drafts.',
  },
];
