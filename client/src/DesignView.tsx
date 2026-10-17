// Pure, read-only renderer for a DesignSpec — thumbnails + previews.
import type { DesignSpec, BrandKit } from './types';
import { LayerView } from './Layers';

export function DesignView({ spec, kit, width = 340 }: { spec: DesignSpec; kit?: BrandKit; width?: number }) {
  const scale = width / spec.canvas.w;
  return (
    <div className="dv" style={{ width, height: spec.canvas.h * scale }}>
      <div
        className="dv-stage"
        style={{ width: spec.canvas.w, height: spec.canvas.h, transform: `scale(${scale})`, background: spec.canvas.background }}
      >
        {spec.layers.map((l) => (
          <LayerView key={l.id} l={l} kit={kit} />
        ))}
      </div>
    </div>
  );
}
