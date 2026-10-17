// Renders a DesignSpec faithfully with real brand fonts. Each layer is an
// absolutely-positioned element inside a scaled stage, so one component draws
// thumbnails and full-size alike. (The interactive editor builds on this.)
import { useLayoutEffect, useRef, useState } from 'react';
import type { DesignSpec, BrandKit, Layer } from './types';

const fontFor = (role: string, kit?: BrandKit) =>
  (kit?.fonts?.find((f) => f.role === role) || kit?.fonts?.find((f) => f.role === 'body'))?.stack ||
  'Inter, system-ui, sans-serif';
const weightFor = (role: string) => (role === 'headline' ? 800 : role === 'eyebrow' ? 600 : 500);

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

function LayerView({ l, kit }: { l: Layer; kit?: BrandKit }) {
  const base: React.CSSProperties = {
    position: 'absolute',
    left: l.box.x,
    top: l.box.y,
    width: l.box.w,
    height: l.box.h,
    transform: l.box.rotation ? `rotate(${l.box.rotation}deg)` : undefined,
  };

  switch (l.type) {
    case 'background':
      return <div style={{ position: 'absolute', inset: 0, background: l.fill }} />;
    case 'shape':
      return (
        <div
          style={{
            ...base,
            background: l.fill,
            borderRadius:
              l.kind === 'ellipse' ? '50%' : l.kind === 'blob' ? '46% 54% 55% 45% / 52% 46% 54% 48%' : (l.radius || 0) * Math.min(l.box.w, l.box.h),
          }}
        />
      );
    case 'image':
      return l.src ? (
        <img src={l.src} alt="" style={{ ...base, objectFit: l.fit || 'cover', borderRadius: l.radius || 0 }} />
      ) : (
        <div className="dv-shimmer" style={{ ...base, borderRadius: l.radius || 0 }} />
      );
    case 'bloom':
      // recolour the transparent bloom to a brand token via CSS mask
      return (
        <div
          style={{
            ...base,
            background: l.fill || '#82C7F5',
            WebkitMaskImage: `url(${l.src})`,
            maskImage: `url(${l.src})`,
            WebkitMaskSize: 'contain',
            maskSize: 'contain',
            WebkitMaskRepeat: 'no-repeat',
            maskRepeat: 'no-repeat',
            WebkitMaskPosition: 'center',
            maskPosition: 'center',
          }}
        />
      );
    case 'charm':
      return <img src={l.src} alt="" style={{ ...base, objectFit: 'contain' }} />;
    case 'logo':
      return <img src={l.src} alt="" style={{ ...base, objectFit: 'contain', objectPosition: 'left center' }} />;
    case 'text':
      return <AutoText l={l} kit={kit} />;
    case 'pill':
      return (
        <div
          style={{
            ...base,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: l.fill,
            color: l.textColor,
            borderRadius: 999,
            fontFamily: fontFor('body', kit),
            fontWeight: 600,
            fontSize: Math.min(l.box.h * 0.4, l.box.w * 0.12),
            padding: '0 24px',
            whiteSpace: 'nowrap',
          }}
        >
          {l.text}
        </div>
      );
    case 'featureList': {
      const items: string[] = l.items || [];
      const rowH = l.box.h / Math.max(items.length, 1);
      return (
        <div style={{ ...base, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: rowH * 0.18 }}>
          {items.map((it, i) => (
            <div
              key={i}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: rowH * 0.28,
                fontFamily: fontFor('eyebrow', kit),
                fontWeight: 700,
                fontSize: Math.min(rowH * 0.46, 40),
                color: l.color,
                letterSpacing: '0.04em',
              }}
            >
              <span
                style={{
                  width: rowH * 0.56,
                  height: rowH * 0.56,
                  minWidth: rowH * 0.56,
                  borderRadius: '50%',
                  background: l.markColor,
                  color: '#fff',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: rowH * 0.34,
                }}
              >
                ✓
              </span>
              {it}
            </div>
          ))}
        </div>
      );
    }
    default:
      return null;
  }
}

// Text that shrinks to fit its box, so headlines never overflow or overlap.
function AutoText({ l, kit }: { l: Layer; kit?: BrandKit }) {
  const role = l.role || 'headline';
  const boxW = l.box.w;
  const boxH = l.box.h;
  const align = l.align || 'left';
  const initial = l.size || Math.round(boxH * (role === 'headline' ? 0.92 : role === 'eyebrow' ? 0.6 : 0.42));
  const ref = useRef<HTMLSpanElement>(null);
  const [size, setSize] = useState(initial);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    let s = initial;
    el.style.fontSize = s + 'px';
    let guard = 0;
    while ((el.scrollHeight > boxH + 1 || el.scrollWidth > boxW + 1) && s > 7 && guard < 160) {
      s = Math.floor(s * 0.93);
      el.style.fontSize = s + 'px';
      guard++;
    }
    setSize(s);
  }, [l.text, boxW, boxH, initial]);

  return (
    <div
      style={{
        position: 'absolute',
        left: l.box.x,
        top: l.box.y,
        width: boxW,
        height: boxH,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: align === 'center' ? 'center' : align === 'right' ? 'flex-end' : 'flex-start',
        overflow: 'hidden',
        transform: l.box.rotation ? `rotate(${l.box.rotation}deg)` : undefined,
      }}
    >
      <span
        ref={ref}
        style={{
          display: 'block',
          width: '100%',
          fontFamily: fontFor(role, kit),
          fontWeight: weightFor(role),
          fontSize: size,
          lineHeight: l.lineHeight || (role === 'headline' ? 1.04 : 1.3),
          color: l.color,
          textAlign: align,
          letterSpacing: role === 'eyebrow' ? '0.08em' : role === 'headline' ? '-0.015em' : undefined,
          textTransform: role === 'eyebrow' ? 'uppercase' : undefined,
        }}
      >
        {l.text}
      </span>
    </div>
  );
}
