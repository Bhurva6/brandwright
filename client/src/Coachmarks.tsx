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

  // start: forced replay, or first visit
  useEffect(() => {
    if (run) {
      setI(0);
      setActive(true);
    } else if (!tourSeen(storageKey)) {
      const t = setTimeout(() => setActive(true), 600); // let the UI settle
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
    (el as HTMLElement).scrollIntoView({ block: 'nearest', inline: 'nearest' });
    const r = el.getBoundingClientRect();
    setRect({ x: r.left - 6, y: r.top - 6, w: r.width + 12, h: r.height + 12 });
  }, [active, i, steps, close]);

  useLayoutEffect(measure, [measure]);
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
    text: 'Brandwright learns a brand\'s DNA — colours, fonts, logos, voice, rules. Switch brands here, or ingest a brand new one from a folder of assets.',
  },
  {
    target: '.composer textarea',
    title: 'Describe the ad you want',
    text: 'Plain words work: "Create 4 images promoting our summer offer." The copilot designs real, editable layouts — never flat images.',
  },
  {
    target: '.chips',
    title: 'Or tap an example brief',
    text: 'Each brand brings its own example briefs. One tap generates instantly.',
  },
  {
    target: '.refstrip',
    title: 'Remix a reference',
    text: 'Pick any reference ad and Brandwright recreates its structure in the active brand\'s DNA — fresh copy, fresh imagery, same skeleton.',
  },
  {
    target: '.controls',
    title: 'Variations become branches',
    text: 'Ask for up to 8 creative directions per run. Every variation lands as a branch you can explore, edit and compare — like git, for design.',
  },
];

export const EDITOR_STEPS: CoachStep[] = [
  {
    target: '.ed-stagewrap',
    title: 'Everything is editable',
    text: 'Click any element to select it. Drag to move, pull the corners to resize. Nothing here is a flat image — it\'s all live layers.',
  },
  {
    target: '.ed-chat',
    title: 'Talk to the canvas',
    text: 'Tell the copilot what to change: "make the headline bigger and use the yellow pill." It edits the design, not the whole picture.',
  },
  {
    target: '.ed-lens',
    title: 'Performance Lens',
    text: 'The critic agent scores every design against brand rules and ad-performance dimensions. Auto-fix repairs issues and shows the score climb.',
  },
  {
    target: '.ed-branches',
    title: 'Branches = creative directions',
    text: 'Each variation is a branch. Switch between them any time — nothing is ever lost.',
  },
  {
    target: '.ed-history',
    title: 'Every change is a commit',
    text: 'Yours, the generator\'s, and the critic\'s edits all land in one history with semantic diffs. Click any version to view it; restore brings it back.',
  },
  {
    target: '.resel',
    title: 'The magic trick: re-skin',
    text: 'Rebase this exact design onto a different brand — same skeleton, new DNA. Also up here: refresh a tired concept, and export a launch-ready pack.',
  },
];
