// Loose client-side mirror of shared/types.ts (enough for rendering).
export interface Box { x: number; y: number; w: number; h: number; rotation?: number }
export interface Layer { id: string; type: string; box: Box; [k: string]: any }
export interface DesignSpec {
  id: string;
  name: string;
  note?: string;
  canvas: { w: number; h: number; preset: string; background: string };
  layers: Layer[];
}
export interface BrandFont { role: string; family: string; weights: number[]; stack: string }
export interface BrandKit {
  id: string;
  name: string;
  colors: { token: string; value: string; name: string }[];
  fonts: BrandFont[];
  presets: { id: string; label: string; w: number; h: number }[];
  assets: { id: string; category: string; variant?: string; src: string }[];
  [k: string]: any;
}
