import { create } from 'zustand';
import type { BrandKit, DesignSpec, Layer } from './types';
import { emptyRepo, commit, log, specOf, newId } from './vc';
import type { Repo, Author } from './vc';

interface State {
  kit?: BrandKit;
  view: 'home' | 'editor';
  designs: DesignSpec[];
  repo: Repo;
  branch: string; // active branch in editor
  working?: DesignSpec; // mutable working copy (the "working tree")
  viewingCommit?: string; // when inspecting an older commit (read-only)
  selectedId?: string;
  dirty: boolean;

  setKit: (k: BrandKit) => void;
  setDesigns: (d: DesignSpec[]) => void;
  patchDesignImage: (specId: string, layerId: string, src?: string, error?: boolean) => void;

  openEditor: (design: DesignSpec) => void;
  closeEditor: () => void;
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
  view: 'home',
  designs: [],
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
    set({ designs, repo, branch: repo.branches[0]?.name || '' });
  },

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
    set({
      view: 'editor',
      branch: br?.name || s.repo.branches[0]?.name || '',
      working: structuredClone(br ? specOf(s.repo, br.head)! : design),
      viewingCommit: undefined,
      selectedId: undefined,
      dirty: false,
    });
  },

  closeEditor: () => set({ view: 'home', working: undefined, selectedId: undefined, viewingCommit: undefined, dirty: false }),

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
