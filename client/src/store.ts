import { create } from 'zustand';
import type { BrandKit, DesignSpec, Layer } from './types';
import { emptyRepo, commit, log, specOf, newId } from './vc';
import type { Repo, Author } from './vc';

export interface Score {
  total: number;
  dimensions: Record<string, number>;
  findings: { dimension: string; severity: string; message: string; layerId?: string }[];
  insight?: string;
  pass: boolean;
}

/** Keep the URL in step with the app's view — real pages: /, /studio, /editor, /library */
export const nav = (path: string) => {
  if (typeof window !== 'undefined' && window.location.pathname !== path) window.history.pushState({}, '', path);
};

export type View = 'landing' | 'home' | 'editor' | 'library';
export const PATHS: Record<View, string> = { landing: '/', home: '/studio', editor: '/editor', library: '/library' };

interface State {
  kit?: BrandKit;
  view: View;
  designs: DesignSpec[];
  scores: Record<string, Score>; // design id -> Performance Lens score
  repo: Repo;
  branch: string; // active branch in editor
  working?: DesignSpec; // mutable working copy (the "working tree")
  viewingCommit?: string; // when inspecting an older commit (read-only)
  selectedId?: string;
  dirty: boolean;
  toast?: string;

  setKit: (k: BrandKit) => void;
  setDesigns: (d: DesignSpec[]) => void;
  setScore: (specId: string, score: Score) => void;
  patchDesignImage: (specId: string, layerId: string, src?: string, error?: boolean) => void;
  addBranches: (specs: DesignSpec[], label: string) => void;

  openEditor: (design: DesignSpec) => void;
  closeEditor: () => void;
  setView: (v: View) => void;
  switchBranch: (name: string) => void;
  select: (id?: string) => void;

  updateLayer: (id: string, patch: Partial<Layer> & Record<string, unknown>) => void;
  updateCanvas: (patch: Partial<DesignSpec['canvas']>) => void;
  removeLayer: (id: string) => void;
  reorderLayer: (id: string, dir: 1 | -1) => void;

  commitWorking: (author: Author, message: string) => void;
  checkout: (commitId: string) => void;
  restore: (commitId: string) => void;
  replaceWorking: (spec: DesignSpec, author: Author, message: string) => void;
}

export const useStore = create<State>((set, get) => ({
  view: 'landing',
  designs: [],
  scores: {},
  repo: emptyRepo(),
  branch: '',
  dirty: false,

  setKit: (kit) => set({ kit }),

  setDesigns: (designs) => {
    // a fresh generation becomes a fresh repo: one branch per creative direction
    let repo = emptyRepo();
    designs.forEach((d, i) => {
      repo = commit(repo, `v${i + 1} · ${d.name}`.slice(0, 34), d, 'generator', d.note || d.name);
    });
    set({ designs, repo, branch: repo.branches[0]?.name || '', scores: {} });
  },

  setScore: (specId, score) => set((s) => ({ scores: { ...s.scores, [specId]: score } })),

  addBranches: (specs, label) =>
    set((s) => {
      let repo = s.repo;
      const base = s.repo.branches.length;
      specs.forEach((d, i) => {
        repo = commit(repo, `v${base + i + 1} · ${d.name}`.slice(0, 34), d, 'generator', `${label}: ${d.note || d.name}`);
      });
      return { repo, designs: [...s.designs, ...specs] };
    }),

  patchDesignImage: (specId, layerId, src, error) =>
    set((s) => {
      const fix = (d: DesignSpec): DesignSpec =>
        d.id !== specId ? d : { ...d, layers: d.layers.map((l) => (l.id === layerId ? { ...l, src, status: error ? 'error' : 'ready' } : l)) };
      // reflect into gallery designs, repo snapshots, and the working copy
      const specs = Object.fromEntries(Object.entries(s.repo.specs).map(([k, v]) => [k, fix(v)]));
      return {
        designs: s.designs.map(fix),
        repo: { ...s.repo, specs },
        working: s.working ? fix(s.working) : s.working,
      };
    }),

  openEditor: (design) => {
    const s = get();
    const br = s.repo.branches.find((b) => specOf(s.repo, b.head)?.id === design.id);
    nav('/editor');
    set({
      view: 'editor',
      branch: br?.name || s.repo.branches[0]?.name || '',
      working: structuredClone(br ? specOf(s.repo, br.head)! : design),
      viewingCommit: undefined,
      selectedId: undefined,
      dirty: false,
    });
  },

  closeEditor: () => {
    nav(PATHS.home);
    set({ view: 'home', working: undefined, selectedId: undefined, viewingCommit: undefined, dirty: false });
  },

  setView: (v) => {
    nav(PATHS[v]);
    set({ view: v });
  },

  switchBranch: (name) => {
    const s = get();
    const br = s.repo.branches.find((b) => b.name === name);
    if (!br) return;
    set({ branch: name, working: structuredClone(specOf(s.repo, br.head)!), viewingCommit: undefined, selectedId: undefined, dirty: false });
  },

  select: (selectedId) => set({ selectedId }),

  updateLayer: (id, patch) =>
    set((s) => {
      if (!s.working) return s;
      return {
        working: { ...s.working, layers: s.working.layers.map((l) => (l.id === id ? { ...l, ...patch, box: (patch as any).box || l.box } : l)) },
        dirty: true,
        viewingCommit: undefined,
      };
    }),

  updateCanvas: (patch) =>
    set((s) => (s.working ? { working: { ...s.working, canvas: { ...s.working.canvas, ...patch } }, dirty: true } : s)),

  removeLayer: (id) =>
    set((s) =>
      s.working ? { working: { ...s.working, layers: s.working.layers.filter((l) => l.id !== id) }, selectedId: undefined, dirty: true } : s,
    ),

  reorderLayer: (id, dir) =>
    set((s) => {
      if (!s.working) return s;
      const ls = [...s.working.layers];
      const i = ls.findIndex((l) => l.id === id);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= ls.length) return s;
      [ls[i], ls[j]] = [ls[j], ls[i]];
      return { working: { ...s.working, layers: ls }, dirty: true };
    }),

  commitWorking: (author, message) => {
    const s = get();
    if (!s.working || !s.branch) return;
    set({ repo: commit(s.repo, s.branch, s.working, author, message), dirty: false });
    // outer learning loop: every human edit is a preference signal (fire-and-forget)
    if (author === 'human' && s.kit) {
      fetch('/api/learn', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ brandId: s.kit.id, event: message }),
      })
        .then((r) => r.json())
        .then((j) => {
          if (j.learnedRule) {
            // the genome just got smarter — refresh it and tell the designer
            fetch(`/api/brand/${s.kit!.id}`).then((r) => r.json()).then((k) => set({ kit: k }));
            set({ toast: `Genome learned: “${j.learnedRule}”` });
            setTimeout(() => set({ toast: undefined }), 6000);
          }
        })
        .catch(() => {});
    }
  },

  checkout: (commitId) => {
    const s = get();
    const spec = specOf(s.repo, commitId);
    if (!spec) return;
    const isHead = s.repo.branches.find((b) => b.name === s.branch)?.head === commitId;
    set({ working: structuredClone(spec), viewingCommit: isHead ? undefined : commitId, selectedId: undefined, dirty: false });
  },

  restore: (commitId) => {
    const s = get();
    const spec = specOf(s.repo, commitId);
    if (!spec || !s.branch) return;
    const repo2 = commit(s.repo, s.branch, spec, 'human', `Restored ${commitId.slice(0, 6)}`);
    set({ repo: repo2, working: structuredClone(spec), viewingCommit: undefined, dirty: false });
  },

  replaceWorking: (spec, author, message) => {
    const s = get();
    if (!s.branch) return;
    const next = structuredClone(spec);
    if (!next.id) next.id = newId('d');
    set({ repo: commit(s.repo, s.branch, next, author, message), working: next, viewingCommit: undefined, dirty: false });
  },
}));

export const useLog = () => {
  const repo = useStore((s) => s.repo);
  const branch = useStore((s) => s.branch);
  return log(repo, branch);
};

// ---------------------------------------------------------------------------
// Session persistence: repo + designs + scores survive a refresh (IndexedDB).
// ---------------------------------------------------------------------------
import { kvGet, kvSet } from './library';

interface SessionSnap {
  brandId: string;
  designs: DesignSpec[];
  scores: Record<string, Score>;
  repo: Repo;
  branch: string;
}

let persistTimer: ReturnType<typeof setTimeout> | undefined;
let restoring = true;

useStore.subscribe((s) => {
  if (restoring || !s.kit) return;
  clearTimeout(persistTimer);
  persistTimer = setTimeout(() => {
    const snap: SessionSnap = { brandId: s.kit!.id, designs: s.designs, scores: s.scores, repo: s.repo, branch: s.branch };
    kvSet('session', JSON.parse(JSON.stringify(snap))).catch(() => {});
  }, 800);
});

/** Called once on boot (after the kit loads) — restores the last session. */
export async function restoreSession(currentBrandId: string): Promise<string | null> {
  try {
    const snap = await kvGet<SessionSnap>('session');
    restoring = false;
    if (!snap || !snap.designs?.length) return null;
    useStore.setState({ designs: snap.designs, scores: snap.scores || {}, repo: snap.repo, branch: snap.branch });
    return snap.brandId !== currentBrandId ? snap.brandId : null; // caller may switch kit
  } catch {
    restoring = false;
    return null;
  }
}
export const markRestored = () => { restoring = false; };
