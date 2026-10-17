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

  // hero entrance: flip .in a frame after mount so the staged transition runs
  useEffect(() => {
    const t = requestAnimationFrame(() =>
      requestAnimationFrame(() => rootRef.current?.querySelectorAll('.hero-rv').forEach((el) => el.classList.add('in'))),
    );
    return () => cancelAnimationFrame(t);
  }, []);

  // scroll-reveal: .rv elements slide in as they genuinely enter the viewport
  useEffect(() => {
    const els = rootRef.current?.querySelectorAll('.rv:not(.hero-rv)');
    if (!els?.length) return;
    const io = new IntersectionObserver(
      (entries) => entries.forEach((e) => {
        if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); }
      }),
      { threshold: 0.06, rootMargin: '0px 0px -8% 0px' },
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);

  // scroll choreography: blob parallax, progress bar, condensing nav
  useEffect(() => {
    const onScroll = () => {
      const el = rootRef.current;
      if (!el) return;
      const y = window.scrollY;
      el.style.setProperty('--py', `${y * 0.14}px`);
      const h = document.documentElement.scrollHeight - window.innerHeight;
      el.style.setProperty('--prog', `${h > 0 ? (y / h) * 100 : 0}%`);
      el.classList.toggle('scrolled', y > 24);
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <div className="landing" ref={rootRef}>
      <div className="land-progress" aria-hidden="true" />
      <div className="land-blobs" aria-hidden="true"><i /><i /><i /></div>

      <nav className="land-nav">
        <div className="brandmark">Brandwright</div>
        <div className="land-links">
          <button className="ghost" onClick={() => st.getState().setView('home')}>Studio</button>
          <button className="ghost" onClick={() => st.getState().setView('chat')}><Icon name="sparkles" size={13} /> Chat</button>
          <button className="ghost" onClick={() => st.getState().setView('library')}><Icon name="folder" size={13} /> Drafts</button>
          <button className="go" onClick={openEditor}>Open the editor</button>
        </div>
      </nav>

      <header className="land-hero">
        <div className="land-eyebrow rv hero-rv">The agentic image editor</div>
        <h1 className="rv hero-rv d1">Version control<br />for brand design.</h1>
        <p className="rv hero-rv d2">Learns any brand. Designs in layers, never pixels. Checks its own work. Remembers everything.</p>
        <div className="land-cta rv hero-rv d3">
          <button className="go big" onClick={openEditor}>{hasSession ? 'Continue in the editor' : 'Open the editor'}</button>
          <button className="ghost big2" onClick={() => st.getState().setView('library')}><Icon name="folder" size={14} /> Drafts</button>
        </div>
        <div className="land-brands rv hero-rv d4">
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

      {/* ===== dark showcase: the critic shows its work ===== */}
      <section className="ld-dark" aria-label="The critic shows its work">
        <div className="ld-k light rv">The critic shows its work</div>
        <div className="ldsA">
          <div className="mockwrap rv rv-left">
            <div className="mock-stamp">EXPORT LOCKED · 1 RULE BROKEN</div>
            <div className="mockad">
              <div className="ma-left">
                <span className="ma-eyebrow">PAYROLL</span>
                <p className="ma-body">Rosters, timesheets and pay runs that take minutes, not hours.</p>
                <span className="ma-cta">Run payroll in minutes</span>
                <span className="ma-logo">brand</span>
              </div>
              <div className="ma-right">
                <span className="ma-spark">✦</span>
                <div className="ma-h1">Payday, before the milk froths.</div>
                <div className="ma-h2">Auto-calc pay rates, tax, super. Done.</div>
                <ul className="ma-ticks"><li>AUTO PAY RUNS</li><li>STP LODGED</li><li>TIMESHEETS</li></ul>
              </div>
              <svg className="ma-circles" viewBox="0 0 300 380" aria-hidden="true">
                <ellipse className="c1" cx="192" cy="150" rx="86" ry="52" />
                <ellipse className="c2" cx="196" cy="196" rx="92" ry="48" />
              </svg>
            </div>
          </div>
          <div className="ldsA-notes">
            <div className="note rv" style={{ transitionDelay: '120ms' }}>
              <b className="nb">White to navy.</b>
              <span>Headline recoloured to readable — 1.3 : 1 is below 3 : 1.</span>
            </div>
            <div className="note rv" style={{ transitionDelay: '240ms' }}>
              <b className="no">Sits on the headline.</b>
              <span>Overlap still blocks export until text is clear of text.</span>
            </div>
            <div className="note rv" style={{ transitionDelay: '360ms' }}>
              <b>Suggestion.</b>
              <span>Two headlines compete — the second is 81% the size of the main one.</span>
            </div>
            <div className="scorebig rv rv-scale" style={{ transitionDelay: '480ms' }}>
              <b>79</b>
              <div><strong>Brand score</strong><span>Would have scored 88. Capped — ships at 80, measured in the browser.</span></div>
            </div>
          </div>
        </div>
      </section>

      {/* ===== dark showcase: layers, never pixels ===== */}
      <section className="ld-dark" aria-label="Layers, never pixels">
        <div className="ld-k light rv">Layers, never pixels</div>
        <div className="ldsB">
          <div className="xpshow rv">
            <div className="xpstage">
              {[0, 1, 2, 3].map((i) => <i key={'o' + i} className="pl outline" style={{ ['--i' as any]: i }} />)}
              <i className="pl navy" style={{ ['--i' as any]: 4 }} />
              <i className="pl pale" style={{ ['--i' as any]: 5 }} />
              <i className="pl head" style={{ ['--i' as any]: 6 }}>Pay your team before the milk froths.</i>
              <i className="pl pill" style={{ ['--i' as any]: 7 }}>Try it free</i>
              <i className="pl spark" style={{ ['--i' as any]: 8 }}>✦</i>
            </div>
          </div>
          <div className="ldsB-copy rv" style={{ transitionDelay: '200ms' }}>
            <h3>Every design is a living stack.</h3>
            <p>“Show layers” splits any canvas into its true 3D layers — labelled, draggable, honest. Because nothing here is a flat image.</p>
          </div>
        </div>
      </section>

      <section className="ld-stats rv rv-scale">
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

      <section className="ld-final rv rv-scale">
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
