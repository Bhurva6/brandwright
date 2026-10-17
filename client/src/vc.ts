// Version control over DesignSpecs — commits, branches, semantic diff.
// Pure functions + plain data so the whole repo is serializable.
import type { DesignSpec, BrandKit, Layer } from './types';

export type Author = 'human' | 'generator' | 'critic';

export interface Commit {
  id: string;
  parents: string[];
  author: Author;
  message: string;
  specId: string;
  at: number;
}
export interface Branch { name: string; head: string; strategy?: string }
export interface Repo {
  commits: Record<string, Commit>;
  specs: Record<string, DesignSpec>;
  branches: Branch[];
  headBranch: string;
}

let seq = 0;
export const newId = (p = '') => p + Date.now().toString(36).slice(-6) + (seq++).toString(36).padStart(2, '0');

export const emptyRepo = (): Repo => ({ commits: {}, specs: {}, branches: [], headBranch: '' });

export function commit(repo: Repo, branchName: string, spec: DesignSpec, author: Author, message: string): Repo {
  const specId = newId('s');
  const snapshot: DesignSpec = structuredClone(spec);
  const br = repo.branches.find((b) => b.name === branchName);
  const c: Commit = { id: newId('c'), parents: br ? [br.head] : [], author, message, specId, at: Date.now() };
  const branches = br
    ? repo.branches.map((b) => (b.name === branchName ? { ...b, head: c.id } : b))
    : [...repo.branches, { name: branchName, head: c.id }];
  return {
    ...repo,
    commits: { ...repo.commits, [c.id]: c },
    specs: { ...repo.specs, [specId]: snapshot },
    branches,
    headBranch: branchName,
  };
}

/** Linear history of a branch, newest first. */
export function log(repo: Repo, branchName: string): Commit[] {
  const br = repo.branches.find((b) => b.name === branchName);
  if (!br) return [];
  const out: Commit[] = [];
  let id: string | undefined = br.head;
  const seen = new Set<string>();
  while (id && repo.commits[id] && !seen.has(id)) {
    seen.add(id);
    const c: Commit = repo.commits[id];
    out.push(c);
    id = c.parents[0];
  }
  return out;
}

export const specOf = (repo: Repo, commitId: string): DesignSpec | undefined =>
  repo.specs[repo.commits[commitId]?.specId];

// ---------------------------------------------------------------------------
// Semantic diff
// ---------------------------------------------------------------------------

export interface LayerChange { field: string; from: unknown; to: unknown }
export interface LayerDiff { layerId: string; type: string; kind: 'added' | 'removed' | 'changed'; changes?: LayerChange[] }

const FIELDS = ['text', 'color', 'fill', 'textColor', 'variant', 'items', 'align', 'size', 'prompt', 'src', 'role', 'kind', 'markColor', 'radius', 'opacity'];

function layerChanges(a: Layer, b: Layer): LayerChange[] {
  const out: LayerChange[] = [];
  const ab = a.box, bb = b.box;
  if (ab.x !== bb.x || ab.y !== bb.y) out.push({ field: 'position', from: [ab.x, ab.y], to: [bb.x, bb.y] });
  if (ab.w !== bb.w || ab.h !== bb.h) out.push({ field: 'size', from: [ab.w, ab.h], to: [bb.w, bb.h] });
  for (const f of FIELDS) {
    const av = JSON.stringify((a as any)[f] ?? null);
    const bv = JSON.stringify((b as any)[f] ?? null);
    if (av !== bv) out.push({ field: f, from: (a as any)[f], to: (b as any)[f] });
  }
  return out;
}

export function diffSpecs(a: DesignSpec, b: DesignSpec): LayerDiff[] {
  const am = new Map(a.layers.map((l) => [l.id, l]));
  const bm = new Map(b.layers.map((l) => [l.id, l]));
  const out: LayerDiff[] = [];
  for (const [id, bl] of bm) {
    const al = am.get(id);
    if (!al) out.push({ layerId: id, type: bl.type, kind: 'added' });
    else {
      const ch = layerChanges(al, bl);
      if (ch.length) out.push({ layerId: id, type: bl.type, kind: 'changed', changes: ch });
    }
  }
  for (const [id, al] of am) if (!bm.has(id)) out.push({ layerId: id, type: al.type, kind: 'removed' });
  return out;
}

const tokenName = (kit: BrandKit | undefined, hex: unknown) =>
  (typeof hex === 'string' && kit?.colors.find((c) => c.value.toLowerCase() === hex.toLowerCase())?.token) ||
  (typeof hex === 'string' ? hex : '');

/** "headline ✎ · ink→blue · +charm" */
export function diffSummary(diffs: LayerDiff[], kit?: BrandKit): string {
  const parts: string[] = [];
  for (const d of diffs) {
    if (d.kind === 'added') parts.push(`+${d.type}`);
    else if (d.kind === 'removed') parts.push(`−${d.type}`);
    else
      for (const c of d.changes || []) {
        if (c.field === 'text') parts.push(`${d.type === 'pill' ? 'cta' : 'text'} ✎`);
        else if (['color', 'fill', 'textColor', 'markColor'].includes(c.field))
          parts.push(`${tokenName(kit, c.from)}→${tokenName(kit, c.to)}`);
        else if (c.field === 'position') parts.push(`${d.type} moved`);
        else if (c.field === 'size') parts.push(`${d.type} resized`);
        else if (c.field === 'src') parts.push(`${d.type} re-rolled`);
        else parts.push(`${d.type} ${c.field} ✎`);
      }
  }
  const uniq = [...new Set(parts)];
  return uniq.slice(0, 5).join(' · ') + (uniq.length > 5 ? ` +${uniq.length - 5}` : '');
}
