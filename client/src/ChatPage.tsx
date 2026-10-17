// One-thread copilot: drop reference images, get a brand kit + layered
// variations, then keep editing any result conversationally — all in one chat.
import { useEffect, useRef, useState } from 'react';
import type { BrandKit, DesignSpec } from '../../shared/types';
import { getBrand, editDesign } from './api';
import { useStore } from './store';
import { DesignView } from './DesignView';
import { Icon } from './Icon';
import { saveChat, getChat, listChats, removeChat, type StoredChat } from './library';

type Msg = {
  id: string;
  role: 'user' | 'bot';
  text?: string;
  images?: string[];
  kitCard?: BrandKit;
  title?: string;
  designs?: DesignSpec[];
  status?: 'busy' | 'ok' | 'err';
};

const mid = () => Math.random().toString(36).slice(2, 9);

async function post<T>(path: string, body: unknown): Promise<T> {
  const r = await fetch(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const txt = await r.text();
  let j: any;
  try { j = JSON.parse(txt); } catch {
    throw new Error(r.status === 413 ? 'the references are too large — attach fewer or smaller images' : `server error ${r.status} — ${txt.slice(0, 90)}`);
  }
  if (!r.ok) throw new Error(j.error || path + ' failed');
  return j;
}

// shrink any attached reference to a chat-friendly jpeg — big Retina
// screenshots would otherwise blow the hosted request-size limit
function toRefDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const cap = 900;
      const sc = Math.min(1, cap / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.max(1, Math.round(img.width * sc));
      c.height = Math.max(1, Math.round(img.height * sc));
      c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      resolve(c.toDataURL('image/jpeg', 0.85));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('could not read image')); };
    img.src = url;
  });
}

const BRAND_WORDS: [RegExp, string][] = [
  [/\bxero\b/i, 'xero'], [/\bspotify\b/i, 'spotify'], [/\bcoca[- ]?cola\b|\bcoke\b/i, 'cocacola'],
  [/\bheadspace\b/i, 'headspace'], [/\bairbnb\b/i, 'airbnb'],
];
const detectBrand = (t: string) => BRAND_WORDS.find(([re]) => re.test(t))?.[1] || 'demo';

const GREETING: Msg = {
  id: 'greet', role: 'bot', status: 'ok',
  text: 'Drop reference ads and tell me what to make — I’ll read them, build the brand kit, and design in editable layers. Click any result to keep editing it right here.',
};

export default function ChatPage() {
  const st = useStore;
  const [msgs, setMsgs] = useState<Msg[]>([GREETING]);
  const [chats, setChats] = useState<StoredChat[]>([]);
  const [chatId, setChatId] = useState<string>(() => sessionStorage.getItem('bw_chat_cur') || mid());
  const [sideOpen, setSideOpen] = useState(false);
  const [text, setText] = useState('');
  const [attach, setAttach] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [demoKit, setDemoKit] = useState<BrandKit | null>(null);
  const [chatBrandId, setChatBrandId] = useState('demo');
  const [replyTo, setReplyTo] = useState<{ spec: DesignSpec; label: string } | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }); }, [msgs]);

  // history: load the chat list, restore the current thread after refresh/navigation
  useEffect(() => {
    listChats().then(setChats).catch(() => {});
    const cur = sessionStorage.getItem('bw_chat_cur');
    if (cur) {
      getChat(cur).then((c) => {
        if (!c) return;
        setMsgs(c.msgs as Msg[]);
        setChatBrandId(c.brandId);
        const kitMsg = (c.msgs as Msg[]).slice().reverse().find((m) => m.kitCard);
        if (kitMsg?.kitCard) { setDemoKit(kitMsg.kitCard); st.getState().setKit(kitMsg.kitCard); }
      }).catch(() => {});
    }
  }, []);

  // persist the thread as it grows (debounced), ChatGPT-style
  useEffect(() => {
    if (msgs.length <= 1) return;
    sessionStorage.setItem('bw_chat_cur', chatId);
    const t = setTimeout(() => {
      const firstUser = msgs.find((m) => m.role === 'user');
      const title = (firstUser?.text || (firstUser?.images ? `${firstUser.images.length} reference${firstUser.images.length > 1 ? 's' : ''}` : 'New chat')).slice(0, 46);
      saveChat({ id: chatId, title, at: Date.now(), brandId: chatBrandId, msgs })
        .then(() => listChats().then(setChats))
        .catch(() => {});
    }, 500);
    return () => clearTimeout(t);
  }, [msgs, chatId, chatBrandId]);

  const newChat = () => {
    const id = mid();
    setChatId(id);
    sessionStorage.setItem('bw_chat_cur', id);
    setMsgs([GREETING]);
    setReplyTo(null);
    setAttach([]);
    setSideOpen(false);
  };
  const openChat = (c: StoredChat) => {
    setChatId(c.id);
    sessionStorage.setItem('bw_chat_cur', c.id);
    setMsgs(c.msgs as Msg[]);
    setChatBrandId(c.brandId);
    setReplyTo(null);
    setAttach([]);
    setSideOpen(false);
    const kitMsg = (c.msgs as Msg[]).slice().reverse().find((m) => m.kitCard);
    if (kitMsg?.kitCard) { setDemoKit(kitMsg.kitCard); st.getState().setKit(kitMsg.kitCard); }
  };
  const dropChat = (id: string) => {
    removeChat(id).then(() => listChats().then(setChats));
    if (id === chatId) newChat();
  };

  const push = (m: Omit<Msg, 'id'>) => { const id = mid(); setMsgs((s) => [...s, { id, ...m }]); return id; };
  const patch = (id: string, p: Partial<Msg>) => setMsgs((s) => s.map((m) => (m.id === id ? { ...m, ...p } : m)));

  const onFiles = (files: FileList | null) => {
    if (!files) return;
    Array.from(files).slice(0, 8).forEach((f) => {
      toRefDataUrl(f).then((u) => setAttach((a) => [...a, u])).catch(() => {});
    });
  };

  const openInEditor = (spec: DesignSpec) => {
    if (demoKit) st.getState().setKit(demoKit);
    st.getState().setDesigns([spec]);
    st.getState().openEditor(spec);
  };

  const send = async () => {
    const t = text.trim();
    if (busy || (!t && !attach.length)) return;
    setText('');
    setBusy(true);
    try {
      if (attach.length) {
        const images = attach;
        setAttach([]);
        push({ role: 'user', text: t || undefined, images });

        // 1 · vision-read every reference
        const readId = push({ role: 'bot', text: `Reading ${images.length} reference${images.length > 1 ? 's' : ''} — layout, blocks, rhythm…`, status: 'busy' });
        const { refs } = await post<{ refs: { structure: string }[] }>('/api/analyze-refs', { images });
        patch(readId, { text: `${refs.length} references read — structure extracted from each.`, status: 'ok' });

        // 2 · bind the brand kit — named brand in the prompt wins, else "demo"
        const brandId = detectBrand(t);
        setChatBrandId(brandId);
        const kitId = push({ role: 'bot', text: `Building brand kit “${brandId}” — palette, fonts, logos, assets…`, status: 'busy' });
        const kit = await getBrand(brandId);
        setDemoKit(kit);
        st.getState().setKit(kit);
        patch(kitId, { text: undefined, kitCard: kit, status: 'ok' });

        // 3 · N layered variations per reference
        const n = Math.min(4, parseInt(t.match(/(\d+)\s*(?:variation|take|version|design)/i)?.[1] || '2', 10) || 2);
        let total = 0;
        for (let i = 0; i < refs.length; i++) {
          const gid = push({ role: 'bot', title: `Reference ${i + 1} — ${n} layered takes`, text: 'designing…', status: 'busy' });
          try {
            const { specs } = await post<{ specs: DesignSpec[] }>('/api/remix', { brandId, structure: refs[i].structure, n });
            total += specs.length;
            patch(gid, { text: undefined, designs: specs, status: 'ok' });
          } catch (e: any) {
            patch(gid, { text: 'This reference failed — ' + (e?.message || e), status: 'err' });
          }
        }
        push({ role: 'bot', text: `Done — ${total} editable, layered designs, every colour, font and logo from the ${kit.name} kit. Click any design to edit it in chat, or open it in the editor.`, status: 'ok' });
      } else if (replyTo) {
        push({ role: 'user', text: `↪ ${replyTo.label} · ${t}` });
        const eid = push({ role: 'bot', text: 'Editing the layers — carrying everything you didn’t mention…', status: 'busy' });
        const spec = await editDesign({ brandId: chatBrandId, spec: replyTo.spec, instruction: t });
        patch(eid, { text: undefined, title: 'Edited — new layers, same commit history', designs: [spec], status: 'ok' });
        setReplyTo({ spec, label: 'edited design' }); // chain further edits onto the result
      } else {
        push({ role: 'user', text: t });
        push({ role: 'bot', text: 'Attach reference images for a new kit, or click a generated design first so I know which one to edit.', status: 'ok' });
      }
    } catch (e: any) {
      push({ role: 'bot', text: 'That step failed — ' + (e?.message || e), status: 'err' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="chatpage">
      <nav className="land-nav chat-nav">
        <div className="chat-navleft">
          <button className="cside-toggle" title="Chat history" onClick={() => setSideOpen((o) => !o)}><Icon name="listChecks" size={15} /></button>
          <div className="brandmark" onClick={() => st.getState().setView('landing')}>Brandwright</div>
        </div>
        <div className="land-links">
          <button className="ghost" onClick={() => st.getState().setView('home')}>Studio</button>
          <button className="ghost" onClick={() => st.getState().setView('library')}><Icon name="folder" size={13} /> Drafts</button>
        </div>
      </nav>

      <div className="chat-shell">
        <aside className={'chat-side' + (sideOpen ? ' open' : '')}>
          <button className="cside-new" onClick={newChat}>＋ New chat</button>
          <div className="cside-list">
            {chats.map((c) => (
              <div key={c.id} className={'cside-row' + (c.id === chatId ? ' cur' : '')} onClick={() => openChat(c)}>
                <span className="cside-title">{c.title}</span>
                <span className="cside-date">{new Date(c.at).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}</span>
                <button className="cside-del" title="Delete chat" onClick={(e) => { e.stopPropagation(); dropChat(c.id); }}>×</button>
              </div>
            ))}
            {!chats.length && <div className="cside-empty">No chats yet</div>}
          </div>
        </aside>

        <div className="chat-main">
      <div className="chat-thread">
        {msgs.map((m) => (
          <div key={m.id} className={'cmsg ' + m.role + (m.status === 'err' ? ' err' : '')}>
            {m.role === 'bot' && <span className="cavatar">❋</span>}
            <div className="cbody">
              {m.images && (
                <div className="cimgs">
                  {m.images.map((src, i) => <img key={i} src={src} alt={`reference ${i + 1}`} />)}
                </div>
              )}
              {m.title && <div className="ctitle">{m.title}</div>}
              {m.text && <div className="ctext">{m.status === 'busy' && <span className="cspin">❋</span>}{m.text}</div>}
              {m.kitCard && (
                <div className="ckit">
                  <div className="ckit-head"><Icon name="dna" size={15} /> Brand kit <b>{m.kitCard.name.toLowerCase()}</b> ready</div>
                  <div className="ckit-sw">{m.kitCard.colors.slice(0, 8).map((c: any, i: number) => <i key={i} style={{ background: c.value || c.hex || c }} />)}</div>
                  <div className="ckit-meta">{m.kitCard.colors.length} colours · {m.kitCard.fonts.length} type roles · {m.kitCard.assets.length} assets bound</div>
                </div>
              )}
              {m.designs && (
                <div className="cdesigns">
                  {m.designs.map((d, di) => (
                    <div key={m.id + ':' + d.id + ':' + di} className={'ccard' + (replyTo?.spec.id === d.id ? ' sel' : '')} onClick={() => setReplyTo({ spec: d, label: d.name || 'design' })}>
                      <DesignView spec={d} kit={demoKit || undefined} width={236} />
                      <div className="ccard-bar">
                        <span>{d.name}</span>
                        <button onClick={(e) => { e.stopPropagation(); openInEditor(d); }}>open in editor →</button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}
        <div ref={endRef} />
      </div>

      <div className="chat-composer">
        {replyTo && (
          <div className="creply">
            <Icon name="pen" size={12} /> editing <b>{replyTo.label}</b>
            <button onClick={() => setReplyTo(null)}>×</button>
          </div>
        )}
        {attach.length > 0 && (
          <div className="cattach">
            {attach.map((a, i) => (
              <span key={i}><img src={a} alt="" /><button onClick={() => setAttach((x) => x.filter((_, j) => j !== i))}>×</button></span>
            ))}
          </div>
        )}
        <div className="crow">
          <button className="cclip" title="Attach reference images" onClick={() => fileRef.current?.click()}><Icon name="image" size={16} /></button>
          <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={(e) => { onFiles(e.target.files); e.currentTarget.value = ''; }} />
          <input
            className="cinput"
            placeholder={replyTo ? 'Describe the edit — layers, copy, imagery, anything' : 'Drop references and describe what to create…'}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && send()}
            disabled={busy}
          />
          <button className="go csend" onClick={send} disabled={busy || (!text.trim() && !attach.length)}>{busy ? 'Working…' : 'Send'}</button>
        </div>
      </div>
        </div>
      </div>
    </div>
  );
}
