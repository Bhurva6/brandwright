// Pure, read-only renderer for a DesignSpec — thumbnails + previews.
import { useLayoutEffect, useRef, useState } from 'react';
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

/** Fills its container's width — no dead gutters in fluid grids. */
export function FluidDesignView({ spec, kit }: { spec: DesignSpec; kit?: BrandKit }) {
  const ref = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(340);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setW(el.clientWidth || 340));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return (
    <div ref={ref} style={{ width: '100%' }}>
      <DesignView spec={spec} kit={kit} width={w} />
    </div>
  );
}
