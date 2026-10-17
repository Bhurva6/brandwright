// The front door: what Brandwright is, in one screen, before the studio.
import { useStore } from './store';
import { Icon } from './Icon';

const FEATURES = [
  { icon: 'dna', title: 'Brand Genome', text: 'Point it at any brand\'s asset folder — it learns the palette, type, logos, voice and rules, then designs inside them.' },
  { icon: 'branch', title: 'Variations are branches', text: '"Create 4 like this" gives you 4 creative directions you can explore, edit and compare — like git, for design.' },
  { icon: 'zap', title: 'Performance Lens', text: 'A critic agent scores every design on brand fidelity, contrast, hook and CTA strength — with one-line insights.' },
  { icon: 'shield', title: 'Auto-fix', text: 'Off-brand or overlapping? The critic repairs the design and shows the score climb, commit by commit.' },
  { icon: 'swap', title: 'Re-skin', text: 'Rebase a finished design onto a different brand. Same skeleton, new DNA — copy, colours, imagery all retarget.' },
  { icon: 'rocket', title: 'Campaign mode', text: 'Three concepts × every placement size in one run. A launch-ready set, not a single image.' },
  { icon: 'play', title: 'Motion export', text: 'Any design becomes a layer-reveal animation, rendered to video right in the browser.' },
  { icon: 'printer', title: 'Print check', text: 'Simulate CMYK ink limits before anything goes to press — screen vs print, side by side.' },
];

const STEPS = [
  { n: '01', title: 'Pick a brand — or teach it yours', text: 'Five genomes ship ready (Xero, Coca-Cola, Spotify, Headspace, Airbnb). Or ingest a folder of assets and watch it learn.' },
  { n: '02', title: 'Describe the ad', text: 'Plain words in, editable designs out — every colour, font and logo pulled from the live genome. Nothing is a flat image.' },
  { n: '03', title: 'Edit, branch, ship', text: 'Drag layers, talk to the canvas, auto-fix, re-skin, export anywhere. Every change is a commit you can always get back.' },
];

export default function Landing() {
  const st = useStore;
  const hasSession = useStore((s) => s.designs.length > 0);
  const go = () => st.getState().setView('home');

  return (
    <div className="landing">
      <div className="land-blobs" aria-hidden="true"><i /><i /><i /></div>

      <nav className="land-nav">
        <div className="brandmark">Brandwright</div>
        <div className="land-links">
          <button className="ghost" onClick={go}>Studio</button>
          <button className="ghost" onClick={() => st.getState().setView('library')}>Drafts</button>
        </div>
      </nav>

      <header className="land-hero">
        <div className="land-eyebrow">The agentic image editor</div>
        <h1>Version control<br />for brand design.</h1>
        <p>
          Brandwright learns a brand's DNA, designs editable on-brand ads from a sentence,
          critiques and improves its own work — and tracks every change, human or AI,
          as commits in one shared history.
        </p>
        <div className="land-cta">
          <button className="go big" onClick={go}>{hasSession ? 'Continue in the studio' : 'Open the studio'}</button>
          <span className="land-sub">No sign-up · 5 brands preloaded · bring your own</span>
        </div>
      </header>

      <section className="land-steps">
        {STEPS.map((s) => (
          <div key={s.n} className="land-step">
            <span className="n">{s.n}</span>
            <h3>{s.title}</h3>
            <p>{s.text}</p>
          </div>
        ))}
      </section>

      <section className="land-grid">
        {FEATURES.map((f) => (
          <div key={f.title} className="land-feat">
            <span className="ic"><Icon name={f.icon} size={20} /></span>
            <h3>{f.title}</h3>
            <p>{f.text}</p>
          </div>
        ))}
      </section>

      <footer className="land-foot">
        <span>Built for the GetCrux AI Hackathon</span>
        <span>DeepSeek-V4 · GPT Image Flare · every design is data, never pixels</span>
      </footer>
    </div>
  );
}
