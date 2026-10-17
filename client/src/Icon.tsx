// Minimal inline icon set (lucide-style strokes) — replaces emoji across the UI.
const PATHS: Record<string, string> = {
  back: 'M19 12H5 M11 18l-6-6 6-6',
  square: 'M4 4h16v16H4z',
  image: 'M4 4h16v16H4z M4 15l4-4 4 4 4-5 4 5',
  type: 'M5 7V5h14v2 M12 5v14 M9 19h6',
  diamond: 'M12 2l10 10-10 10L2 12z',
  flower: 'M12 4v16 M5.1 8l13.8 8 M18.9 8L5.1 16',
  sparkle: 'M12 3l2 6 6 2-6 2-2 6-2-6-6-2 6-2z',
  badge: 'M12 13a5 5 0 1 0 0-10 5 5 0 0 0 0 10z M8 12.5L7 21l5-3 5 3-1-8.5',
  capsule: 'M7 9h10a3 3 0 0 1 0 6H7a3 3 0 0 1 0-6z',
  listChecks: 'M11 6h10 M11 12h10 M11 18h10 M3 6l1.5 1.5L7 5 M3 12l1.5 1.5L7 11 M3 18l1.5 1.5L7 17',
  user: 'M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z M4 21c0-4 3.6-6.5 8-6.5s8 2.5 8 6.5',
  sparkles: 'M11 4l1.5 4L17 9.5 12.5 11 11 15l-1.5-4L5 9.5 9.5 8z M18.5 14l.8 2.2L21.5 17l-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8z',
  shield: 'M12 3l7 3v5c0 5-3.5 8-7 10-3.5-2-7-5-7-10V6z',
  refresh: 'M3.5 12a8.5 8.5 0 1 0 2.8-6.3 M3.5 4v5h5',
  package: 'M21 8l-9-5-9 5v8l9 5 9-5z M3 8l9 5 9-5 M12 13v8',
  download: 'M12 3v12 M6 11l6 6 6-6 M4 21h16',
  upload: 'M12 21V9 M6 13l6-6 6 6 M4 3h16',
  trash: 'M4 7h16 M9 7V4h6v3 M6 7l1 14h10l1-14',
  chevUp: 'M6 14l6-6 6 6',
  chevDown: 'M6 10l6 6 6-6',
  shuffle: 'M3 6h4.5L18 18h3 M18 21l3-3-3-3 M3 18h4.5l2.7-3 M13.5 9L16.5 6H21 M18 3l3 3-3 3',
  scissors: 'M6 9a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z M6 20a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z M8 8l12 10 M8 16L20 6',
  printer: 'M7 8V3h10v5 M5 8h14a2 2 0 0 1 2 2v6h-4v5H7v-5H3v-6a2 2 0 0 1 2-2z M7 16h10',
  rocket: 'M14 4c3 1 5 3 6 6-3 5-7 8-11 9l-4-4c1-4 4-8 9-11z M5 15c-1.6 2.6-1.6 5-1.6 5s2.4 0 5-1.6 M14.5 9.5h0',
  folder: 'M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z',
  zap: 'M13 2L4 14h6l-1 8 9-12h-6z',
  play: 'M7 4l13 8-13 8z',
  clock: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z M12 7v5l3 2',
  swap: 'M4 7h13 M14 3l4 4-4 4 M20 17H7 M10 21l-4-4 4-4',
  plus: 'M12 5v14 M5 12h14',
  squarePlus: 'M4 4h16v16H4z M12 9v6 M9 12h6',
  check: 'M5 13l4 4L19 7',
  bulb: 'M9 18h6 M10 21h4 M12 3a6 6 0 0 1 4 10.5c-.8.7-1 1.5-1 2.5h-6c0-1-.2-1.8-1-2.5A6 6 0 0 1 12 3z',
  branch: 'M6 3v12 M6 21a3 3 0 1 0 0-6 3 3 0 0 0 0 6z M18 9a3 3 0 1 0 0-6 3 3 0 0 0 0 6z M18 9a9 9 0 0 1-9 9',
  dna: 'M8 3c0 6 8 6 8 12 M16 3c0 6-8 6-8 12 M8 15c0 2 .5 4 2 6 M16 15c0 2-.5 4-2 6 M9.5 7h5 M9.5 17h5',
  camera: 'M4 8h3l2-3h6l2 3h3v12H4z M12 16.5a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
  pen: 'M17 3l4 4L8 20l-5 1 1-5z',
  help: 'M9.5 9a2.5 2.5 0 1 1 3.4 2.3c-.8.4-.9 1-.9 1.7 M12 17h0',
};

export function Icon({ name, size = 15, className }: { name: string; size?: number; className?: string }) {
  const d = PATHS[name];
  if (!d) return null;
  return (
    <svg
      className={'icx' + (className ? ' ' + className : '')}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {d.split(' M').map((p, i) => (
        <path key={i} d={(i ? 'M' : '') + p} />
      ))}
    </svg>
  );
}
