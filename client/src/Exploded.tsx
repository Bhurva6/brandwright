// Exploded layers view — the design splits into its true layers in 3D,
// each labelled, drag to orbit. Compact animates everything back flat.
import { useEffect, useRef, useState } from 'react';
import type { DesignSpec, BrandKit, Layer } from './types';
import { LayerView } from './Layers';

const layerLabel = (l: Layer) => {
  if (l.type === 'text') return `text · “${String(l.text || '').slice(0, 16)}${String(l.text || '').length > 16 ? '…' : ''}”`;
  if (l.type === 'pill') return `cta · “${l.text}”`;
  return l.type;
};

export default function Exploded({ spec, kit, scale, open }: { spec: DesignSpec; kit?: BrandKit; scale: number; open: boolean }) {
  const [pose, setPose] = useState({ rx: 56, rz: -32 });
  const [entered, setEntered] = useState(false);
  const drag = useRef<{ x: number; y: number; rx: number; rz: number } | null>(null);

  // mount flat, then animate open on the next frame
  useEffect(() => {
    const t = requestAnimationFrame(() => requestAnimationFrame(() => setEntered(true)));
    return () => cancelAnimationFrame(t);
  }, []);
  const o = open && entered;

  const gap = Math.max(46, Math.min(110, 560 / spec.layers.length)) ;

  return (
    <div
      className="xp-wrap"
      onPointerDown={(e) => {
        drag.current = { x: e.clientX, y: e.clientY, rx: pose.rx, rz: pose.rz };
        (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
      }}
      onPointerMove={(e) => {
        if (!drag.current || !o) return;
        const dx = e.clientX - drag.current.x;
        const dy = e.clientY - drag.current.y;
        setPose({
          rz: drag.current.rz + dx * 0.25,
          rx: Math.max(12, Math.min(84, drag.current.rx - dy * 0.25)),
        });
      }}
      onPointerUp={() => (drag.current = null)}
    >
      <div
        className={'xp-stack' + (o ? ' open' : '')}
        style={{
          width: spec.canvas.w,
          height: spec.canvas.h,
          transform: o
            ? `scale(${scale * 0.72}) rotateX(${pose.rx}deg) rotateZ(${pose.rz}deg)`
            : `scale(${scale})`,
        }}
      >
        {/* canvas ground */}
        <div className="xp-plane" style={{ transform: o ? 'translateZ(0px)' : 'none' }}>
          <div style={{ position: 'absolute', inset: 0, background: spec.canvas.background }} />
          {o && <span className="xp-label">canvas</span>}
        </div>
        {spec.layers.map((l, i) => (
          <div
            key={l.id}
            className="xp-plane"
            style={{ transform: o ? `translateZ(${(i + 1) * gap}px)` : 'none', transitionDelay: `${i * 36}ms` }}
          >
            <LayerView l={l} kit={kit} />
            <div className="xp-outline" />
            {o && <span className="xp-label" style={{ top: Math.max(0, l.box.y - 34), left: l.box.x }}>{layerLabel(l)}</span>}
          </div>
        ))}
      </div>
      {o && <div className="xp-hint">drag to orbit</div>}
    </div>
  );
}
