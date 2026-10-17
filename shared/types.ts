// ============================================================================
// Brandwright — shared contract between the agent, the server, and the canvas.
// The agent NEVER draws pixels. It emits / edits a DesignSpec. The canvas renders
// it. Brand rules are enforced on this data model, not hoped for in a prompt.
// ============================================================================

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
  rotation?: number;
}

export type LayerType =
  | 'background'
  | 'image'
  | 'text'
  | 'logo'
  | 'shape'
  | 'bloom'
  | 'charm'
  | 'pill'
  | 'featureList';

export interface BaseLayer {
  id: string;
  type: LayerType;
  box: Box;
  locked?: boolean;
  opacity?: number;
}

/** Flat brand-token fill behind everything. */
export interface BackgroundLayer extends BaseLayer {
  type: 'background';
  fill: string; // brand color token value (hex)
}

/** AI-generated photography / hero imagery. `src` filled by GPT Image Flare. */
export interface ImageLayer extends BaseLayer {
  type: 'image';
  prompt?: string;
  src?: string;
  fit?: 'cover' | 'contain';
  radius?: number;
  status?: 'pending' | 'ready' | 'error';
}

/** Headline / body copy. Font is a brand ROLE, never an arbitrary family. */
export interface TextLayer extends BaseLayer {
  type: 'text';
  text: string;
  role: 'headline' | 'body' | 'eyebrow';
  size: number;
  color: string; // brand token value
  align: 'left' | 'center' | 'right';
  weight?: number;
  lineHeight?: number;
}

/** The xero wordmark, only from the approved logo asset library. */
export interface LogoLayer extends BaseLayer {
  type: 'logo';
  assetId: string;
  variant?: 'midnight' | 'white' | 'blue';
}

/** Blob / rounded-rect / ellipse in a brand color — the curved background cutouts. */
export interface ShapeLayer extends BaseLayer {
  type: 'shape';
  kind: 'rect' | 'ellipse' | 'blob';
  fill: string; // brand token value
  radius?: number;
}

/** A signature Xero "bloom" organic shape, from the asset library. */
export interface BloomLayer extends BaseLayer {
  type: 'bloom';
  assetId: string;
  fill?: string; // recolor to a brand token
}

/** Playful "charm" sticker (speech bubble, heart, tick...). */
export interface CharmLayer extends BaseLayer {
  type: 'charm';
  assetId: string;
}

/** CTA pill button. */
export interface PillLayer extends BaseLayer {
  type: 'pill';
  text: string;
  fill: string; // brand token value
  textColor: string; // brand token value
}

/** The green-tick feature list (ACCOUNTING / PAYMENTS / ...). */
export interface FeatureListLayer extends BaseLayer {
  type: 'featureList';
  items: string[];
  color: string; // label color (brand token)
  markColor: string; // tick color (brand token)
  columns?: 1 | 2;
}

export type Layer =
  | BackgroundLayer
  | ImageLayer
  | TextLayer
  | LogoLayer
  | ShapeLayer
  | BloomLayer
  | CharmLayer
  | PillLayer
  | FeatureListLayer;

export interface CanvasInfo {
  w: number;
  h: number;
  preset: string; // e.g. "square_1080", "story_1080x1920", "meta_feed"
  background: string; // brand token value
}

export interface DesignSpec {
  id: string;
  name: string;
  canvas: CanvasInfo;
  layers: Layer[];
  note?: string; // agent's one-line rationale, shown in the variations grid
}

// ---------------------------------------------------------------------------
// Brand kit
// ---------------------------------------------------------------------------

export interface BrandColor {
  token: string; // "ink", "blue", "sky"...
  value: string; // hex
  name: string; // human label
  roles?: string[]; // "background" | "text" | "accent" | "cta"
}

export interface BrandFont {
  role: 'headline' | 'body' | 'eyebrow';
  family: string;
  weights: number[];
  stack: string; // full css fallback stack
}

export interface BrandAsset {
  id: string;
  category: 'logo' | 'bloom' | 'charm' | 'illustration' | 'background' | 'product';
  label: string;
  src: string; // /brand/... path served by client
  recolorable?: boolean;
}

export interface CanvasPreset {
  id: string;
  label: string;
  w: number;
  h: number;
}

export interface BrandRule {
  id: string;
  text: string;
  severity: 'error' | 'warn';
}

export interface BrandKit {
  id: string;
  name: string;
  colors: BrandColor[];
  fonts: BrandFont[];
  presets: CanvasPreset[];
  assets: BrandAsset[];
  rules: BrandRule[];
  voice: string; // tone-of-voice guidance for the agent's copywriting
  archetypes?: LayoutArchetype[];
  rewardWeights?: Record<string, number>; // critic dimension weights; the outer loop tunes these
  learned?: LearnedRule[];
}

// ---------------------------------------------------------------------------
// Agent <-> client protocol
// ---------------------------------------------------------------------------

export type EditMode = 'create' | 'edit' | 'reference';

export interface AgentRequest {
  mode: EditMode;
  prompt: string;
  variations?: number; // how many designs to return
  currentSpec?: DesignSpec; // for edit mode
  referenceId?: string; // for reference mode (an ad-reference asset)
  preset?: string;
}

export interface AgentResult {
  specs: DesignSpec[];
  message: string; // chat reply shown to the designer
}

// ===========================================================================
// Version control — the git-for-design model
// ===========================================================================

export type Author = 'human' | 'generator' | 'critic';

/** Everything needed to reproduce an image generation; stored on the commit. */
export interface GenerationRecipe {
  model: string;
  prompt: string;
  size: string;
  seed?: number;
  params?: Record<string, unknown>;
  assetHash?: string; // content-addressed id of the resulting image blob
}

export interface CriticFinding {
  dimension: string; // 'palette' | 'contrast' | 'safezone' | 'archetype' | 'voice' | ...
  severity: 'error' | 'warn' | 'info';
  message: string;
  layerId?: string;
}

/** The reward R for a design, per the self-improvement loop. */
export interface CriticScore {
  total: number; // 0..1 weighted reward R = Σ wᵢ·scoreᵢ
  dimensions: Record<string, number>; // per-dimension 0..1
  findings: CriticFinding[];
  pass: boolean; // total >= threshold and no error-severity findings
}

export interface Commit {
  id: string; // short hash
  parents: string[]; // parent commit ids (a merge has 2)
  author: Author;
  message: string;
  specId: string; // points into DesignRepo.specs
  score?: CriticScore;
  createdAt: number;
}

export interface Branch {
  name: string;
  head: string; // commit id
  strategy?: string; // creative-direction label for a variation branch
}

export interface DesignRepo {
  id: string;
  brandId: string;
  commits: Record<string, Commit>;
  specs: Record<string, DesignSpec>; // specId -> immutable snapshot
  branches: Branch[];
  headBranch: string;
}

export interface LayerDiff {
  layerId: string;
  type: LayerType;
  kind: 'added' | 'removed' | 'changed';
  changes?: { field: string; from: unknown; to: unknown }[];
}

/** Semantic diff over the DesignSpec IR — the signature feature. */
export interface SpecDiff {
  from: string; // commit id
  to: string; // commit id
  layers: LayerDiff[];
  canvasChanges?: { field: string; from: unknown; to: unknown }[];
  summary: string; // "headline ✎, ink→blue, +charm"
}

// ===========================================================================
// Brand ingest + learning
// ===========================================================================

/** A layout pattern mined from the brand's example ads (no vision; from geometry/meta). */
export interface LayoutArchetype {
  id: string;
  label: string; // 'headline-left + cta pill + logo bottom-left'
  regions: { role: string; box: Box }[]; // boxes normalized 0..1
  source?: string; // reference asset id it was mined from
}

export interface LearnedRule {
  id: string;
  text: string;
  origin: 'inferred' | 'learned'; // inferred at ingest vs learned from edits
  weight?: number;
  confirmations?: number;
}

/** One accept/edit/revert event — the outer-loop training signal. */
export interface PreferenceSignal {
  commitId: string;
  action: 'accept' | 'edit' | 'revert';
  layerId?: string;
  before?: unknown;
  after?: unknown;
  at: number;
}

/** A classified, optimized asset discovered during ingest. */
export interface IngestedAsset {
  id: string;
  category: BrandAsset['category'];
  label: string;
  src: string; // served path
  w?: number;
  h?: number;
  hasAlpha?: boolean;
  recolorable?: boolean;
}

/** Raw ingest output before DeepSeek enrichment. */
export interface IngestDraft {
  brandId: string;
  name: string;
  palette: { value: string; pct: number }[];
  assets: IngestedAsset[];
}
