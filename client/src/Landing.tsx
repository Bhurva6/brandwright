// The front door — minimal copy, scroll-revealed sections, GetCrux identity.
import { useEffect, useRef } from 'react';
import { useStore } from './store';
import { Icon } from './Icon';

const BRIEF = [
  { icon: 'sparkles', title: 'Create', text: 'A sentence in, editable designs out.' },
  { icon: 'pen', title: 'Edit', text: 'Drag it, or just tell the copilot.' },
  { icon: 'image', title: 'Reference', text: 'Remix any ad into your brand.' },
  { icon: 'shield', title: 'On-brand', text: 'Guidelines enforced by construction.' },
];

const USPS = [
  { icon: 'branch', title: 'Git for design', text: 'Variations are branches. Every change is a commit you can diff and restore.' },
  { icon: 'dna', title: 'Brand Genome', text: 'Drop a folder — or just a description — and it learns the whole identity.' },
  { icon: 'zap', title: 'Honest auto-fix', text: 'A critic scores every design, repairs it, and shows the receipts.' },
  { icon: 'swap', title: 'Re-skin', text: 'Rebase a finished design onto a different brand in one click.' },
  { icon: 'play', title: 'Motion', text: 'Any design becomes a layer-reveal video, rendered in-browser.' },
  { icon: 'layers', title: 'Exploded view', text: 'Split the canvas into its true 3D layers and orbit them.' },
];

const STATS = [
  { n: '5+∞', l: 'genomes — preloaded, ingested, or invented' },
  { n: '8', l: 'creative directions per run, each a branch' },
  { n: '6', l: 'export formats, PNG to motion video' },
  { n: '100%', l: 'editable — layers, never flat pixels' },
];

const STEPS = [
  { n: '01', title: 'Learn', text: 'Pick a brand or teach it yours.' },
  { n: '02', title: 'Create', text: 'Brief it. Branch it. Edit anything.' },
  { n: '03', title: 'Ship', text: 'Score it, fix it, export everywhere.' },
];

export default function Landing() {
  const st = useStore;
  const hasSession = useStore((s) => s.designs.length > 0);
  const rootRef = useRef<HTMLDivElement>(null);

  const openEditor = () => {
    const s = st.getState();
    if (s.designs.length) s.openEditor(s.designs[0]);
    else s.setView('home');
  };

  // scroll-reveal: anything with .rv slides in when it enters the viewport
  useEffect(() => {
    const els = rootRef.current?.querySelectorAll('.rv');
    if (!els?.length) return;
    const io = new IntersectionObserver(
      (entries) => entries.forEach((e) => e.isIntersecting && e.target.classList.add('in')),
      { threshold: 0.16 },
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);

  // light parallax on the hero blobs
  useEffect(() => {
    const onScroll = () => rootRef.current?.style.setProperty('--py', `${window.scrollY * 0.12}px`);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <div className="landing" ref={rootRef}>
      <div className="land-blobs" aria-hidden="true"><i /><i /><i /></div>

      <nav className="land-nav">
        <div className="brandmark">Brandwright</div>
        <div className="land-links">
          <button className="ghost" onClick={() => st.getState().setView('home')}>Studio</button>
          <button className="ghost" onClick={() => st.getState().setView('library')}><Icon name="folder" size={13} /> Drafts</button>
          <button className="go" onClick={openEditor}>Open the editor</button>
        </div>
      </nav>

      <header className="land-hero">
        <div className="land-eyebrow rv in">The agentic image editor</div>
        <h1 className="rv in d1">Version control<br />for brand design.</h1>
        <p className="rv in d2">Learns any brand. Designs in layers, never pixels. Checks its own work. Remembers everything.</p>
        <div className="land-cta rv in d3">
          <button className="go big" onClick={openEditor}>{hasSession ? 'Continue in the editor' : 'Open the editor'}</button>
          <button className="ghost big2" onClick={() => st.getState().setView('library')}><Icon name="folder" size={14} /> Drafts</button>
        </div>
        <div className="land-brands rv in d4">
          <span>Preloaded genomes</span>
          <b>Xero</b><b>Coca-Cola</b><b>Spotify</b><b>Headspace</b><b>Airbnb</b><em>+ yours</em>
        </div>
      </header>

      <section className="ld-sec">
        <div className="ld-k rv">The brief, nailed</div>
        <div className="ld-grid4">
          {BRIEF.map((b, i) => (
            <div key={b.title} className="ld-chipcard rv" style={{ transitionDelay: `${i * 70}ms` }}>
              <Icon name={b.icon} size={17} />
              <h3>{b.title}</h3>
              <p>{b.text}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="ld-sec">
        <div className="ld-k rv">What only Brandwright does</div>
        <div className="ld-grid3">
          {USPS.map((u, i) => (
            <div key={u.title} className="ld-usp rv" style={{ transitionDelay: `${(i % 3) * 80}ms` }}>
              <span className="ic"><Icon name={u.icon} size={19} /></span>
              <h3>{u.title}</h3>
              <p>{u.text}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="ld-stats rv">
        {STATS.map((s) => (
          <div key={s.l} className="ld-stat">
            <b>{s.n}</b>
            <span>{s.l}</span>
          </div>
        ))}
      </section>

      <section className="ld-sec">
        <div className="ld-k rv">How it works</div>
        <div className="ld-steps">
          {STEPS.map((s, i) => (
            <div key={s.n} className="ld-step rv" style={{ transitionDelay: `${i * 110}ms` }}>
              <span className="n">{s.n}</span>
              <h3>{s.title}</h3>
              <p>{s.text}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="ld-final rv">
        <h2>Make something on-brand.</h2>
        <div className="land-cta">
          <button className="go big inv" onClick={openEditor}>Open the editor</button>
          <button className="ghost big2 inv" onClick={() => st.getState().setView('library')}>Drafts</button>
        </div>
      </section>

      <footer className="land-foot">
        <span>Built for the GetCrux AI Hackathon</span>
        <span>DeepSeek-V4 · GPT Image Flare</span>
      </footer>
    </div>
  );
}
