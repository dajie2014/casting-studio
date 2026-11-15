window.__ModuleLoader__.load({
  id: '@local/dsh-casting-studio',
  factory(require) {
    const React = require('react');
    const h = React.createElement;
    const { useState, useEffect, useRef, useCallback } = React;

    // 后端（创作台服务）—— 本机，带 CORS。
    // 开发期预览可以用 ?api=http://127.0.0.1:7871 指向另一份实例，
    // DSH 里没有这个变量，永远走 7870。
    const API = (typeof window !== 'undefined' && window.__CAST_API) || 'http://127.0.0.1:7870';

    // ── 面板开合的小状态仓：侧栏按钮和浮层是两个独立挂载点，靠它说话 ──
    // view: 'closed' 关着 | 'open' 展开 | 'min' 缩成右下角小卡
    const store = { view: 'closed' };
    const subs = new Set();
    const setView = (v) => { store.view = v; subs.forEach((f) => f()); };

    function useView() {
      const [, force] = useState(0);
      useEffect(() => {
        const f = () => force((n) => n + 1);
        subs.add(f);
        return () => subs.delete(f);
      }, []);
      return [store.view, setView];
    }

    async function api(path, opts = {}) {
      const r = await fetch(API + path, {
        ...opts,
        headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) },
      });
      const t = await r.text();
      let d; try { d = JSON.parse(t); } catch { d = { raw: t }; }
      if (!r.ok) throw new Error(d.error || `HTTP ${r.status}`);
      return d;
    }

    // ─────────────────────────── 样式 ───────────────────────────
    const BG = 'http://127.0.0.1:7870/bg-theater.jpg';
    const CSS = `
.cs-overlay{position:fixed;inset:0;z-index:9000;pointer-events:auto;display:flex;align-items:center;justify-content:center;
  background:rgba(6,5,10,.62);backdrop-filter:blur(3px)}
.cs-shell{width:min(1180px,94vw);height:min(850px,92vh);display:flex;flex-direction:column;position:relative;
  border-radius:16px;overflow:hidden;color:#f2ecf6;border:1px solid rgba(255,255,255,.14);
  background:
    linear-gradient(180deg, rgba(12,9,20,.46) 0%, rgba(8,6,14,.72) 42%, rgba(5,4,9,.88) 100%),
    url('${BG}') center/cover no-repeat, #0b0912;
  box-shadow:0 30px 90px rgba(0,0,0,.6), 0 0 0 1px rgba(255,255,255,.04) inset,
    0 0 160px rgba(0,0,0,.55) inset, 0 0 100px rgba(160,107,255,.14)}
.cs-shell::before{content:'';position:absolute;left:0;right:0;top:0;height:4px;z-index:5;pointer-events:none;
  background:linear-gradient(90deg,#ff5f7e,#ffb35c,#7cffb2,#5cc8ff,#b06bff,#ff5f7e)}
.cs-shell::after{content:'';position:absolute;left:0;right:0;top:0;height:55%;pointer-events:none;z-index:0;
  background:radial-gradient(70% 100% at 50% 0%, rgba(255,190,120,.18), transparent 70%)}
.cs-head{display:flex;align-items:center;gap:12px;padding:14px 18px;border-bottom:1px solid rgba(255,255,255,.10);
  background:linear-gradient(180deg, rgba(255,255,255,.05), rgba(255,255,255,0));position:relative;z-index:2}
.cs-title{font-size:15.5px;font-weight:650;letter-spacing:.6px;
  background:linear-gradient(90deg,#ffd9a8,#ffb0c8,#b79cff);-webkit-background-clip:text;background-clip:text;color:transparent}
.cs-sub{font-size:12px;color:rgba(255,255,255,.55)}
.cs-spacer{flex:1}
.cs-dot{width:8px;height:8px;border-radius:50%;display:inline-block;margin-right:4px}
.cs-body{flex:1;display:flex;min-height:0;position:relative;z-index:2}
.cs-title,.cs-screen-t{filter:drop-shadow(0 1px 6px rgba(0,0,0,.55))}
.cs-sub,.cs-label{text-shadow:0 1px 4px rgba(0,0,0,.5)}
.cs-side{width:236px;flex:0 0 236px;border-right:1px solid rgba(255,255,255,.10);
  display:flex;flex-direction:column;min-height:0;background:rgba(8,6,14,.22);backdrop-filter:blur(10px)}
.cs-side-top{padding:10px;display:flex;gap:6px}
.cs-side-new{padding:10px;border-bottom:1px solid rgba(255,255,255,.08);
  background:rgba(138,107,255,.08)}
.cs-list{flex:1;overflow:auto;padding:2px 8px 12px}
.cs-item{padding:8px 10px;border-radius:9px;cursor:pointer;font-size:13px;display:flex;flex-direction:column;gap:2px;
  border-left:3px solid transparent}
.cs-item:hover{background:rgba(255,255,255,.06)}
.cs-item[data-on="1"]{background:rgba(255,255,255,.09);box-shadow:0 6px 18px rgba(0,0,0,.25)}
.cs-main{flex:1;display:flex;flex-direction:column;min-width:0;min-height:0}
.cs-tabs{display:flex;gap:8px;padding:10px 14px;border-bottom:1px solid rgba(255,255,255,.08);flex-wrap:wrap}
.cs-tab{padding:6px 13px;border-radius:999px;font-size:12.5px;cursor:pointer;letter-spacing:.3px;
  border:1px solid rgba(255,255,255,.14);color:rgba(255,255,255,.72);background:rgba(255,255,255,.04)}
.cs-tab:hover{color:#fff;border-color:rgba(255,255,255,.28)}
.cs-tab[data-on="1"]{color:#0b0912;border-color:transparent;
  background:linear-gradient(135deg,var(--c1),var(--c2));box-shadow:0 8px 22px rgba(0,0,0,.35)}
.cs-scroll{flex:1;overflow:auto;padding:14px 16px 20px}
.cs-row{display:flex;gap:8px;align-items:center;margin-bottom:8px}
.cs-card{border:1px solid rgba(255,255,255,.13);border-radius:12px;padding:12px;margin-bottom:12px;
  background:linear-gradient(180deg, rgba(22,17,32,.72), rgba(10,8,16,.62));backdrop-filter:blur(12px);
  box-shadow:0 10px 30px rgba(0,0,0,.26);display:flex;gap:14px}
.cs-card-media{width:180px;flex:0 0 180px;display:flex;flex-direction:column;gap:8px}
.cs-thumb{width:180px;height:101px;object-fit:cover;border-radius:8px;border:1px solid rgba(255,255,255,.16);
  box-shadow:0 8px 24px rgba(0,0,0,.42);background:linear-gradient(135deg,#241a3a,#12101c)}
.cs-thumb-empty{display:flex;align-items:center;justify-content:center;font-size:24px;opacity:.6;
  background:linear-gradient(135deg, rgba(124,156,255,.22), rgba(160,107,255,.14) 55%, rgba(255,107,181,.12))}
.cs-card-body{flex:1;min-width:0;display:flex;flex-direction:column;gap:6px}
.cs-label{font-size:11px;color:rgba(255,255,255,.5);margin-bottom:2px}
.cs-input,.cs-area,.cs-select{width:100%;background:rgba(0,0,0,.46);border:1px solid rgba(255,255,255,.13);
  border-radius:8px;padding:6px 9px;color:#f4eef8;font-size:13px;font-family:inherit}
.cs-input:focus,.cs-area:focus,.cs-select:focus{outline:none;border-color:#8a6bff;box-shadow:0 0 0 3px rgba(138,107,255,.18)}
.cs-area{resize:vertical;min-height:42px}
.cs-btn{border:1px solid rgba(255,255,255,.14);background:rgba(255,255,255,.06);color:#efe9f5;
  border-radius:8px;padding:5px 11px;font-size:12.5px;cursor:pointer;white-space:nowrap;font-family:inherit}
.cs-btn:hover{border-color:rgba(255,255,255,.32);background:rgba(255,255,255,.11)}
.cs-btn[data-primary="1"]{background:linear-gradient(135deg,#8a6bff,#ff6bb5);border-color:transparent;color:#fff;
  box-shadow:0 8px 22px rgba(138,107,255,.32)}
.cs-btn:disabled{opacity:.42;cursor:default}
.cs-btn[data-danger="1"]{color:#ff8fa3}
.cs-foot{border-top:1px solid rgba(255,255,255,.09);padding:8px 16px;font-size:12px;color:rgba(255,255,255,.55);
  display:flex;gap:12px;align-items:center;background:rgba(0,0,0,.36);min-height:36px}
.cs-empty{padding:18px;color:rgba(255,255,255,.62);font-size:13px;line-height:1.95}
.cs-screen{position:relative;border-radius:12px;overflow:hidden;aspect-ratio:16/9;margin:6px 0 18px;
  border:1px solid rgba(255,255,255,.14);
  background:
    radial-gradient(80% 120% at 50% 0%, rgba(255,214,170,.22), transparent 60%),
    linear-gradient(160deg,#2a1c3f,#170f24 55%,#0d0a16);
  box-shadow:0 20px 50px rgba(0,0,0,.45), 0 0 60px rgba(160,107,255,.12) inset}
.cs-screen-in{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;
  gap:8px;text-align:center;padding:20px}
.cs-screen-t{font-size:16px;font-weight:600;letter-spacing:.6px;
  background:linear-gradient(90deg,#ffd9a8,#ffb0c8,#b79cff);-webkit-background-clip:text;background-clip:text;color:transparent}
.cs-screen-s{font-size:12.5px;color:rgba(255,255,255,.6);line-height:1.9}
.cs-tag{font-size:11px;padding:1px 7px;border-radius:99px;border:1px solid rgba(255,255,255,.18);
  color:rgba(255,255,255,.75);background:rgba(255,255,255,.05)}
.cs-err{color:#ff8fa3;font-size:12px}
.cs-block{border:1px solid rgba(255,255,255,.13);border-radius:12px;padding:12px 13px;margin-bottom:14px;
  background:linear-gradient(180deg, rgba(22,17,32,.72), rgba(10,8,16,.62));backdrop-filter:blur(12px);
  box-shadow:0 10px 30px rgba(0,0,0,.26)}
.cs-block-h{display:flex;align-items:center;gap:8px;margin-bottom:9px;font-size:13px;font-weight:650}
.cs-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px}
.cs-hint{font-size:11px;color:rgba(255,255,255,.45);line-height:1.75}
.cs-song{display:flex;gap:10px;align-items:center;padding:6px 9px;border-radius:9px;
  border:1px solid rgba(255,255,255,.1);background:rgba(255,255,255,.04);margin-bottom:6px}
.cs-sound-mark{font-size:11px;padding:1px 7px;border-radius:99px;border:1px solid rgba(124,255,178,.5);
  color:#9dffc9;background:rgba(124,255,178,.1)}
.cs-win{width:30px;height:30px;display:inline-flex;align-items:center;justify-content:center;
  border-radius:8px;border:1px solid rgba(255,255,255,.14);background:rgba(255,255,255,.06);
  color:#efe9f5;font-size:14px;line-height:1;cursor:pointer;font-family:inherit}
.cs-win:hover{background:rgba(255,255,255,.14);border-color:rgba(255,255,255,.3)}
.cs-win[aria-label="关闭"]:hover{background:rgba(255,92,124,.28);border-color:rgba(255,92,124,.55)}
.cs-mini{position:fixed;right:22px;bottom:22px;z-index:9000;width:280px;padding:12px 14px;
  border-radius:14px;cursor:pointer;color:#f2ecf6;border:1px solid rgba(255,255,255,.16);
  background:linear-gradient(180deg, rgba(22,16,32,.97), rgba(8,6,14,.98));
  box-shadow:0 18px 50px rgba(0,0,0,.5), 0 0 0 1px rgba(255,255,255,.04) inset}
.cs-mini:hover{border-color:rgba(160,107,255,.6)}
.cs-mini-t{display:flex;align-items:center;gap:8px;font-size:13px;font-weight:600}
.cs-mini-bar{height:4px;border-radius:99px;background:rgba(255,255,255,.12);overflow:hidden;margin-top:9px}
.cs-mini-bar > i{display:block;height:100%;border-radius:99px;background:linear-gradient(90deg,#8a6bff,#ff6bb5);
  transition:width .45s ease}
audio{color-scheme:dark;border-radius:999px;outline:none}
audio::-webkit-media-controls-enclosure{background:rgba(255,255,255,.07);border-radius:999px}
audio::-webkit-media-controls-panel{background:rgba(255,255,255,.02)}
`;

    // ─────────────────────────── 侧栏入口 ───────────────────────────
    // 跟「上下文洞察」排在一起，所以样式照它的规矩来：无边框、图标+文字、
    // 收起侧栏时只留图标。自带的样式标签随按钮一起渲染，面板没开时也有效。
    const ENTRY_CSS = `
.cs-entry{display:inline-flex;align-items:center;gap:8px;background:transparent;border:0;color:inherit;
  padding:6px 10px;border-radius:8px;cursor:pointer;font-size:13px;font-family:inherit;white-space:nowrap}
.cs-entry:hover{background:var(--dsw-alias-bg-layer-2)}
.cs-entry-rail{padding:6px;gap:0;justify-content:center}
.cs-entry-icon{font-size:15px;line-height:1}
`;

    function OpenButton(props) {
      const [view, setView] = useView();
      const open = view === 'open';
      const wide = !props || props.wide !== false;   // 侧栏展开时带文字
      return h(React.Fragment, null,
        h('style', null, ENTRY_CSS),
        h('button', {
          type: 'button',
          className: 'cs-entry' + (wide ? '' : ' cs-entry-rail'),
          title: open ? '收起创作台' : '打开创作台（有声幻灯片 / 课件 / 推广 / 广播剧）',
          'aria-label': '创作台',
          'aria-expanded': open,
          style: open ? { background: 'rgba(138,107,255,.18)' } : undefined,
          onClick: () => setView(open ? 'closed' : 'open'),
        },
        h('span', { className: 'cs-entry-icon', 'aria-hidden': true }, '🎬'),
        wide ? h('span', null, '创作台') : null),
      );
    }

    // ─────────────────────────── 主面板 ───────────────────────────
    const KINDS = [
      { id: 'slide', label: '有声幻灯片', hint: '分镜 → 台词 → 出图 → 成片', c1: '#7c9cff', c2: '#a06bff' },
      { id: 'course', label: '有声课件', hint: '讲稿 → 旁白 → 回到课件里', c1: '#38d6c4', c2: '#2ea8ff' },
      { id: 'promo', label: '产品推广', hint: '文案 → 旁白 → 画面 → 短片', c1: '#ff9a5c', c2: '#ff5f7e' },
      { id: 'radio', label: '广播剧', hint: '剧本 → 多角色 → 混音', c1: '#ff6bb5', c2: '#b06bff' },
    ];
    const kindOf = (id) => KINDS.find((k) => k.id === id) || KINDS[0];

    // 慢档的两台引擎（MIR 那边同一套契约）。ready 由后端 /api/health 的 engines 覆盖 ——
    // 没装的那台要如实标出来，不要给人一个点了空转的按钮。
    // 用户 2026-11-15：「现在有的是 yue2，stable audio 和 heartmula」——
    // Stable Audio 就是快档那个按钮（Caster 的模型），不在这个下拉里。
    const SONG_ENGINES = [
      { id: 'yue2', label: 'YuE2 · 带词唱（成品，唯一出谱的）', hint: '先写谱、再照谱唱；谱子只从这条线来' },
      { id: 'heartmula', label: 'HeartMuLa · 人声草稿（不出谱）', hint: '风格要写英文标签：pop,female vocal,piano,90 bpm' },
    ];

    function StudioPanel() {
      const [view, setView] = useView();
      const open = view === 'open';
      const [health, setHealth] = useState(null);
      const [projects, setProjects] = useState([]);
      const [project, setProject] = useState(null);
      const [kind, setKind] = useState('slide');
      const [busy, setBusy] = useState(null);
      const [queue, setQueue] = useState({ running: null, queued: [] });
      const [err, setErr] = useState('');
      const [title, setTitle] = useState('');
      const [selftest, setSelftest] = useState(null);
      const [voices, setVoices] = useState([]);
      // 角色库（VoiceCaster 那边）+ 情绪标签 + 术语表。一次拿齐，界面只问一次。
      const [voiceLib, setVoiceLib] = useState({ ok: false, characters: [], emotions: [], glossary: { terms: [] } });
      const poll = useRef(null);

      const refreshProjects = useCallback(async () => {
        try { setProjects(await api('/api/projects')); setErr(''); } catch (e) { setErr(String(e.message)); }
      }, []);

      // 角色库可能在别处变了（比如刚克隆了一个新声音）——重新拉一次
      const reloadVoices = useCallback(async () => {
        try { setVoiceLib(await api('/api/voice-library')); } catch { /* 没开就保持原样 */ }
      }, []);

      const refreshProject = useCallback(async (id) => {
        if (!id) return;
        try { setProject(await api(`/api/projects/${id}`)); } catch (e) { setErr(String(e.message)); }
      }, []);

      // 打开时拉一次基础信息
      useEffect(() => {
        if (view !== 'open') return;
        (async () => {
          try { setHealth(await api('/api/health')); } catch { setHealth(null); }
          refreshProjects();
          try { const v = await api('/api/voices'); setVoices(v.voices || []); } catch { /* 没起来就算了 */ }
          try { setVoiceLib(await api('/api/voice-library')); } catch { /* 角色库没开也不影响别的事 */ }
        })();
      }, [view, refreshProjects]);

      // 有活儿在跑就盯着队列（最小化时也盯，小卡要显示进度）
      useEffect(() => {
        if (view === 'closed') return undefined;
        poll.current = setInterval(async () => {
          try { setQueue(await api('/api/queue')); } catch { /* 服务可能关了 */ }
        }, 1500);
        return () => clearInterval(poll.current);
      }, [view]);

      const waitJob = async (job) => {
        setBusy(job);
        for (;;) {
          await new Promise((r) => setTimeout(r, 1200));
          let j;
          try { j = await api(`/api/jobs/${job.id}`); } catch (e) { setBusy(null); throw e; }
          setBusy(j);
          if (j.status === 'done') { setBusy(null); return j.result; }
          if (j.status === 'error') { setBusy(null); throw new Error(j.error); }
        }
      };

      const runJob = async (type, params) => {
        if (!project) return null;
        try {
          setErr('');
          const job = await api(`/api/projects/${project.id}/job`, {
            method: 'POST', body: JSON.stringify({ type, params }),
          });
          const result = await waitJob(job);
          await refreshProject(project.id);
          await refreshProjects();
          return result;
        } catch (e) { setErr(String(e.message)); return null; }
      };

      // 新建作品：**不用 window.prompt**。
      // DSH 桌面版是 Electron，它不支持 prompt —— 不弹框、直接返回 null，
      // 于是"点了没反应"（2026-11-14 用户当场踩到）。
      // 改在左栏原地展开一个输入框：回车建、Esc 算了。
      const [newName, setNewName] = useState(null);   // null = 没在新建
      const createProject = async (raw) => {
        const name = String(raw || '').trim() || '未命名作品';
        try {
          setErr('');
          const p = await api('/api/projects', { method: 'POST', body: JSON.stringify({ name, kind }) });
          setNewName(null);
          await refreshProjects();
          setProject(p);
        } catch (e) { setErr(String(e.message)); }
      };

      const patch = async (delta) => {
        if (!project) return;
        try {
          const p = await api(`/api/projects/${project.id}`, { method: 'PATCH', body: JSON.stringify(delta) });
          setProject(p);
        } catch (e) { setErr(String(e.message)); }
      };

      const setScene = (i, delta) => {
        const scenes = project.scenes.map((s, k) => (k === i ? { ...s, ...delta } : s));
        setProject({ ...project, scenes });
      };

      const addScene = () => {
        const scenes = [...(project.scenes || []), {
          id: `s${(project.scenes || []).length + 1}-${Math.random().toString(36).slice(2, 6)}`,
          text: '', voice: voices[0] || 'vivian', emotion: '', instruct: '', imagePrompt: '',
        }];
        setProject({ ...project, scenes });
      };

      const saveScenes = async () => { await patch({ scenes: project.scenes }); };

      const sayLine = async (i) => {
        const s = project.scenes[i];
        if (!s.text.trim()) { setErr('这句还没写'); return; }
        // 谁念：`char:3` = VoiceCaster 角色库里的第 3 号（含他自己的克隆声）；
        // 其余就是千问自带的音色名。
        const charId = (/^char:(\d+)$/.exec(s.voice || '') || [])[1] || null;
        const r = await runJob('tts', {
          text: s.text, voice: charId ? null : s.voice, character: charId,
          emotion: s.emotion || '', instruct: s.instruct, tag: s.id,
        });
        if (r) {
          const scenes = project.scenes.map((x, k) => (k === i ? { ...x, vo: r.file, voSeconds: r.seconds } : x));
          await patch({ scenes });
        }
      };

      const drawShot = async (i) => {
        const s = project.scenes[i];
        const prompt = (s.imagePrompt || s.text || '').trim();
        if (!prompt) { setErr('这句还没有画面提示'); return; }
        const r = await runJob('image', { prompt, style: 'scene', size: 'preview' });
        if (r) {
          const scenes = project.scenes.map((x, k) => (k === i ? { ...x, image: r.file } : x));
          await patch({ scenes });
        }
      };

      const buildTrack = async () => {
        await saveScenes();
        const r = await runJob('audiotrack', {});
        if (r) await refreshProject(project.id);
      };

      const buildFilm = async () => {
        await saveScenes();
        await runJob('render', { filename: project.name });
      };

      // ─────────────── 声音底板：配乐 / 音效 / 主题歌两档 ───────────────
      // 先声后图是这台机器的硬规矩；这里就是"先声"那一段。
      const [draft, setDraft] = useState({
        musicPrompt: '', musicSeconds: 40, sfxPrompt: '',
        songStyle: '', songTitle: '', lyrics: '', songSeconds: 90,
      });
      const setDraftField = (k, v) => setDraft((d) => ({ ...d, [k]: v }));

      // 换项目时把上次填过的东西拾回来
      useEffect(() => {
        if (!project) return;
        const t = project.theme || {};
        setDraft({
          musicPrompt: t.music?.prompt || t.musicPrompt || '',
          musicSeconds: 40,
          sfxPrompt: t.sfx?.prompt || t.sfxPrompt || '',
          songStyle: t.songPrompt || '',
          songTitle: t.title || project.name || '',
          lyrics: t.lyrics || '',
          songSeconds: 90,
        });
      }, [project?.id]);

      const patchTheme = async (delta) => {
        if (!project) return;
        const theme = { ...(project.theme || {}), ...delta };
        await patch({ theme });
      };

      const genMusic = async () => {
        if (!draft.musicPrompt.trim()) { setErr('先写一句配乐的味道'); return; }
        await patchTheme({ musicPrompt: draft.musicPrompt });
        await runJob('music', { prompt: draft.musicPrompt, seconds: Number(draft.musicSeconds) || 40 });
      };

      const genSfx = async () => {
        if (!draft.sfxPrompt.trim()) { setErr('先写一句要什么声音'); return; }
        await patchTheme({ sfxPrompt: draft.sfxPrompt });
        await runJob('sfx', { prompt: draft.sfxPrompt, seconds: 5 });
      };

      // 快档：Caster 纯音乐，几秒到几十秒出
      const genSongFast = async () => {
        if (!draft.songStyle.trim()) { setErr('先写一句风格'); return; }
        await patchTheme({ songPrompt: draft.songStyle, title: draft.songTitle });
        await runJob('music', {
          prompt: draft.songStyle, seconds: Number(draft.songSeconds) || 90,
          asSong: true, title: draft.songTitle,
        });
      };

      // 慢档用哪台引擎（MIR 的三台同一套契约）：界面挑，默认 YuE2
      const [songEngine, setSongEngine] = useState('yue2');

      // 慢档：MIR 带词，几分钟到十分钟（它得先写谱，再照谱唱）
      // 用户 2026-11-15：「把所有功能都切进去，主要是出歌和出谱子」——
      // 所以引擎不再固定 YuE2，三台都能点，界面自己选。
      const genSongSlow = async () => {
        if (!draft.songStyle.trim()) { setErr('先写一句风格'); return; }
        const eng = songEngine || 'yue2';
        const needLyrics = eng !== 'acestep';      // ACE-Step 是纯器乐
        if (needLyrics && !draft.lyrics.trim()) {
          setErr(eng === 'heartmula'
            ? 'HeartMuLa 要歌词（它是人声草稿机）；只想要音乐就换 ACE-Step'
            : '慢档要歌词 —— 它得照词唱；只想要音乐就用快档或 ACE-Step');
          return;
        }
        await patchTheme({ songPrompt: draft.songStyle, lyrics: draft.lyrics, title: draft.songTitle });
        await runJob('song', {
          prompt: draft.songStyle, lyrics: draft.lyrics, title: draft.songTitle,
          engine: eng, duration: Number(draft.songSeconds) || 90,
        });
      };

      const useAsMusic = (s) => patchTheme({
        music: { file: s.file, seconds: s.seconds, prompt: s.prompt || '', at: new Date().toISOString() },
      });
      const clearMusic = () => patchTheme({ music: null });

      // ─────────────── 有声课件：放 pptx → 念旁白 → 出音频包 ───────────────
      // 讲稿是后端用 VoiceCaster 那套规则抽出来的（备注优先、没备注读正文、
      // 拆成一句一句）；这里只管放进来、改字、念、拼成一条。
      const uploadDeck = async (file) => {
        if (!file) return;
        if (!/\.pptx$/i.test(file.name)) { setErr('只认 .pptx —— 老格式 .ppt 打不开'); return; }
        try {
          setErr('');
          setBusy({ type: '课件', message: `正在读 ${file.name}…`, progress: 0.3 });
          const r = await fetch(`${API}/api/projects/${project.id}/slides?name=${encodeURIComponent(file.name)}`, {
            method: 'POST', headers: { 'Content-Type': 'application/octet-stream' }, body: file,
          });
          const d = await r.json();
          if (!r.ok) throw new Error(d.error || `HTTP ${r.status}`);
          await refreshProject(project.id);
          await refreshProjects();
        } catch (e) {
          setErr(String(e.message));
        } finally {
          setBusy(null);
        }
      };

      const setSlide = (i, delta) => {
        const slides = (project.slides || []).map((s, k) => (k === i ? { ...s, ...delta } : s));
        setProject({ ...project, slides });
      };

      // 念一页。★ 每次都重新读一遍项目：连着念好几页时，若用界面里的旧快照，
      // 上一页刚写进去的音频会被下一页整块盖掉（真实踩过）。
      const sayPage = async (pageIndex, voice) => {
        const fresh = await api(`/api/projects/${project.id}`);
        const s = (fresh.slides || []).find((x) => x.index === pageIndex);
        if (!s) { setErr('这一页不见了，刷新一下'); return null; }
        const text = String(s.text || '').trim();
        if (!text) { setErr(`第 ${s.index} 页没有讲稿`); return null; }
        // 课件用「这一套用谁念」那个人（project.deckVoice），没设才落到千问第一个音色
        const pick = voice || project.deckVoice || voices[0] || 'vivian';
        const charId = (/^char:(\d+)$/.exec(pick) || [])[1] || null;
        const r = await runJob('tts', {
          text, voice: charId ? null : pick, character: charId,
          emotion: project.deckEmotion || '', tag: `p${s.index}`,
        });
        if (!r) return null;
        const now2 = await api(`/api/projects/${project.id}`);
        const slides = (now2.slides || []).map((x) => (x.index === s.index ? { ...x, vo: r.file, seconds: r.seconds } : x));
        await patch({ slides });
        return r;
      };

      const sayAllPages = async () => {
        if (!project) return;
        const fresh = await api(`/api/projects/${project.id}`);
        const todo = (fresh.slides || []).filter((s) => String(s.text || '').trim() && !s.vo);
        if (!todo.length) { setErr('该念的都念过了（没讲稿的页跳过）'); return; }
        const voice = project.deckVoice || voices[0] || 'vivian';
        for (const want of todo) {
          await sayPage(want.index, voice);   // 串行：机器一次只跑一件
        }
        await refreshProject(project.id);
      };

      const saveSlides = async () => { if (project) await patch({ slides: project.slides }); };

      const buildDeckTrack = async () => {
        await patch({ slides: project.slides });
        await runJob('deck_track', {});
      };

      // 选文件的框：现造现点，不进 React 树（免得每个项目都挂一个隐藏 input）
      const pickDeck = () => {
        const inp = document.createElement('input');
        inp.type = 'file';
        inp.accept = '.pptx';
        inp.onchange = () => { const f = inp.files && inp.files[0]; if (f) uploadDeck(f); };
        inp.click();
      };

      // 打开时量一遍“按钮能不能被点到”，结果发回后端备查
      useEffect(() => {
        if (view !== 'open') return undefined;
        const t = setTimeout(() => {
          try {
            const probe = (el) => {
              if (!el) return { err: '没找到元素' };
              const r = el.getBoundingClientRect();
              const x = Math.round(r.left + r.width / 2);
              const y = Math.round(r.top + r.height / 2);
              const top = document.elementFromPoint(x, y);
              return {
                rect: { x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) },
                pe: getComputedStyle(el).pointerEvents,
                hitSelf: Boolean(top && (top === el || el.contains(top))),
                top: top ? `${top.tagName}.${String(top.className).slice(0, 40)}` : null,
              };
            };
            const ov = document.querySelector('.cs-overlay');
            const sh = document.querySelector('.cs-shell');
            const win = document.querySelector('.cs-win[aria-label="关闭"]');
            const entry = document.querySelector('.cs-entry');
            const chain = [];
            let e = ov;
            while (e && chain.length < 10) { chain.push(`${e.tagName}.${String(e.className).slice(0, 24)}|${getComputedStyle(e).pointerEvents}|z${getComputedStyle(e).zIndex}`); e = e.parentElement; }
            const data = {
              viewport: { w: innerWidth, h: innerHeight, dpr: devicePixelRatio },
              overlay: probe(ov), shell: probe(sh), closeBtn: probe(win), entryBtn: probe(entry), chain,
            };
            setSelftest(data);
            fetch(API + '/api/diag', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }).catch(() => {});
          } catch (e) {
            fetch(API + '/api/diag', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ err: String(e) }) }).catch(() => {});
          }
        }, 400);
        return () => clearTimeout(t);
      }, [view]);

      if (view === 'closed') return null;

      // ── 最小化：右下角一张小卡，仍然报进度，点一下就展开 ──
      if (view === 'min') {
        const pct = busy ? Math.round((busy.progress || 0) * 100) : 0;
        return h('div', {
          className: 'cs-mini', role: 'button', tabIndex: 0,
          style: { pointerEvents: 'auto', zIndex: 9999 },
          title: '点一下展开创作台',
          onClick: () => setView('open'),
          onKeyDown: (e) => { if (e.key === 'Enter' || e.key === ' ') setView('open'); },
        },
        h('div', { className: 'cs-mini-t' },
          h('span', { 'aria-hidden': true }, '🎬'),
          h('span', null, project ? project.name : '创作台'),
          h('span', { className: 'cs-spacer' }),
          h('span', { className: 'cs-sub' }, busy ? `${busy.type} ${pct}%` : (queue.queued?.length ? `排队 ${queue.queued.length}` : '空闲'))),
        h('div', { className: 'cs-sub', style: { marginTop: 4 } }, busy ? (busy.message || '在跑') : '点在展开 / 后台不挡你'),
        h('div', { className: 'cs-mini-bar' }, h('i', { style: { width: `${busy ? Math.max(4, pct) : 100}%` } })),
        );
      }

      const be = health?.backends || {};
      const dot = (on) => h('span', { className: 'cs-dot', style: { background: on ? 'var(--dsw-alias-state-success-primary)' : 'var(--dsw-alias-state-error-primary)' } });

      return h('div', {
        className: 'cs-overlay',
        style: { pointerEvents: 'auto', zIndex: 9999 },
        onMouseDown: (e) => { if (e.target === e.currentTarget) setView('min'); },
      },
        h('style', null, CSS),
        h('div', {
          className: 'cs-shell',
          style: { pointerEvents: 'auto' },
          onMouseDown: (e) => e.stopPropagation(),
        },
          // 头
          h('div', { className: 'cs-head' },
            h('div', null,
              h('div', { className: 'cs-title' }, '创作台'),
              h('div', { className: 'cs-sub' },
              'CASTING STUDIO · 先做声音，再配画面；一次只跑一件 · 界面 11-15b',
              selftest && selftest.closeBtn && !selftest.closeBtn.hitSelf
                ? h('span', { style: { color: '#ff8fa3' }, title: '有东西挡在按钮上面' }, ' · 按钮被挡住')
                : null)),
            h('div', { className: 'cs-spacer' }),
            h('div', { className: 'cs-sub' },
              h('span', null, dot(be.tts), '念白 '),
              h('span', null, dot(be.caster), '音乐·图片 '),
              h('span', null, dot(be.voicecaster), '声库 ')),
            h('button', {
              type: 'button', className: 'cs-win', title: '最小化（缩到右下角，不挡你干别的）',
              'aria-label': '最小化', style: { pointerEvents: 'auto' },
              onClick: () => setView('min'),
            }, '–'),
            h('button', {
              type: 'button', className: 'cs-win', title: '关闭（任务还在后台跑）',
              'aria-label': '关闭', style: { pointerEvents: 'auto' },
              onClick: () => setView('closed'),
            }, '✕'),
          ),
          // 身体
          h('div', { className: 'cs-body' },
            h('aside', { className: 'cs-side' },
              newName === null
                ? h('div', { className: 'cs-side-top' },
                  h('button', { className: 'cs-btn', 'data-primary': '1', onClick: () => setNewName('') }, '＋ 新作品'),
                  h('button', { className: 'cs-btn', onClick: refreshProjects }, '刷新'))
                : h('div', { className: 'cs-side-new' },
                  h('input', {
                    className: 'cs-input', autoFocus: true, value: newName,
                    placeholder: '这个作品叫什么？',
                    onChange: (e) => setNewName(e.target.value),
                    onKeyDown: (e) => {
                      if (e.key === 'Enter') createProject(newName);
                      if (e.key === 'Escape') setNewName(null);
                    },
                  }),
                  h('div', { className: 'cs-row', style: { marginTop: 6, marginBottom: 0 } },
                    h('button', { className: 'cs-btn', 'data-primary': '1', onClick: () => createProject(newName) }, '建'),
                    h('button', { className: 'cs-btn', onClick: () => setNewName(null) }, '算了'),
                    h('span', { className: 'cs-hint', style: { marginLeft: 'auto' } }, `类型：${kindOf(kind).label}`))),
              h('div', { className: 'cs-list' },
                projects.length === 0
                  ? h('div', { className: 'cs-empty' }, '还没有作品。点「＋ 新作品」。')
                  : projects.map((p) => h('div', {
                    key: p.id, className: 'cs-item', 'data-on': project?.id === p.id ? '1' : '0',
                    style: { borderLeftColor: kindOf(p.kind).c1 },
                    onClick: () => { setProject(null); refreshProject(p.id); },
                  },
                  h('div', { style: { display: 'flex', gap: 6, alignItems: 'center' } },
                    h('span', { className: 'cs-tag' }, KINDS.find((k) => k.id === p.kind)?.label || p.kind),
                    h('span', null, p.name)),
                  h('div', { className: 'cs-sub' }, `${p.scenes} 个镜头 · ${p.renders} 个成片`)))),
            ),
            h('main', { className: 'cs-main' },
              h('div', { className: 'cs-tabs' },
                KINDS.map((k) => h('div', {
                  key: k.id, className: 'cs-tab', 'data-on': (project?.kind || kind) === k.id ? '1' : '0',
                  style: { '--c1': k.c1, '--c2': k.c2 },
                  onClick: async () => {
                    setKind(k.id);
                    if (project) await patch({ kind: k.id });
                  },
                }, k.label))),
              h('div', { className: 'cs-scroll' },
                err ? h('div', { className: 'cs-err', style: { marginBottom: 8 } }, err) : null,
                !project
                  ? h('div', null,
                    h('div', { className: 'cs-screen' },
                      h('div', { className: 'cs-screen-in' },
                        h('div', { className: 'cs-screen-t' }, '灯亮，幕起'),
                        h('div', { className: 'cs-screen-s' },
                          '左边挑一个作品，或者点「＋ 新作品」。\n先做声音，再配画面。'))),
                    h('div', { className: 'cs-empty' },
                      KINDS.map((k) => h('div', {
                        key: k.id, style: { display: 'flex', gap: 8, alignItems: 'center' },
                      },
                      h('span', { className: 'cs-tag', style: { borderColor: k.c1, color: k.c1 } }, k.label),
                      h('span', null, k.hint)))))
                  : h(ProjectView, {
                    project, voices, busy, setProject, patch, setScene, saveScenes,
                    addScene, sayLine, drawShot, buildTrack, buildFilm, runJob,
                    draft, setDraftField, genMusic, genSfx, genSongFast, genSongSlow,
                    songEngine, setSongEngine,
                    patchTheme, useAsMusic, clearMusic, voiceLib, health, setErr,
                    uploadDeck, pickDeck, setSlide, saveSlides, sayPage, sayAllPages, buildDeckTrack,
                    setBusy, refreshProject, reloadVoices,
                    kindLabel: KINDS.find((k) => k.id === project.kind)?.label || '',
                  }),
              ),
            ),
          ),
          // 脚
          h('div', { className: 'cs-foot' },
            busy
              ? h('span', null, `⏳ ${busy.message || busy.type} ${Math.round((busy.progress || 0) * 100)}%`)
              : h('span', null, queue.running ? `在跑：${queue.running.type}` : '空闲'),
            h('span', null, queue.queued?.length ? `排队 ${queue.queued.length}` : ''),
            h('span', { className: 'cs-spacer' }),
            health
              ? h('span', null, health.disk?.ok
                ? `作品存在 ${health.disk.workRoot}`
                : h('span', { className: 'cs-err' }, '作品目录不可用：看 CAST_WORK'))
              : h('span', { className: 'cs-err' }, '服务未连上'),
          ),
        ),
      );
    }

    // ─────────────────────────── 项目视图 ───────────────────────────
    // 情绪标签的短写法：「难过地说，声音有点低」→「难过」
    const emoLabel = (t) => String(t || '').replace(/地说.*$/, '') || String(t || '');

    function ProjectView({ project, voices, busy, setProject, patch, setScene, saveScenes, addScene, sayLine, drawShot, buildTrack, buildFilm, kindLabel,
      draft, setDraftField, genMusic, genSfx, genSongFast, genSongSlow,
      songEngine, setSongEngine,
      patchTheme, useAsMusic, clearMusic, voiceLib, health, runJob, setErr,
      uploadDeck, pickDeck, setSlide, saveSlides, sayPage, sayAllPages, buildDeckTrack,
      setBusy, refreshProject, reloadVoices }) {
      const scenes = project.scenes || [];
      const fileUrl = (rel) => (rel ? `${API}/files/${project.id}/${rel}` : '');
      const track = project.audioTrack;
      const theme = project.theme || {};
      const songs = theme.songs || [];
      const engineName = (e) => {
        if (!e) return '歌';
        if (/caster/i.test(e)) return '快档 · Stable Audio';
        if (/heartmula/i.test(e)) return 'HeartMuLa';
        if (/yue2/i.test(e)) return 'YuE2';
        if (/render/i.test(e)) return 'ACE-Step';
        return 'MIR 慢档';
      };
      const slides = project.slides || [];
      const deck = project.deck || null;
      const deckTrack = project.deckTrack || null;

      // ── 修整台（换嗓子 / 转谱）与术语表的小状态 ──
      const [swapFrom, setSwapFrom] = useState('');
      const [swapWho, setSwapWho] = useState('');
      const [swapOwn, setSwapOwn] = useState('');     // 自己上传的一段参考录音
      const [swapOut, setSwapOut] = useState(null);
      const [scoreFrom, setScoreFrom] = useState('');
      const [scoreOut, setScoreOut] = useState(null);
      // MIR 那边剩下的两口：谱子（送进 MIR Studio / 导出 MusicXML）、量（BPM / 响度）、送出去
      const [tidyFrom, setTidyFrom] = useState('');
      const [tidyOut, setTidyOut] = useState(null);
      const [studioOut, setStudioOut] = useState(null);
      const [measureFrom, setMeasureFrom] = useState('');
      const [measureOut, setMeasureOut] = useState(null);
      const [sendFrom, setSendFrom] = useState('');
      const [sendOut, setSendOut] = useState(null);
      const [glossOpen, setGlossOpen] = useState(false);
      const [glossTerms, setGlossTerms] = useState(null);
      const [glossTerm, setGlossTerm] = useState('');
      const [glossBusy, setGlossBusy] = useState(false);

      // 这个作品里现成的音频 —— 换嗓子、转谱都从这儿挑，不用去翻文件夹
      const audioPool = [];
      const addAudio = (file, label) => {
        if (file && !audioPool.some((x) => x.file === file)) audioPool.push({ file, label });
      };
      scenes.forEach((s, i) => addAudio(s.vo, `镜头 ${i + 1}：${String(s.text || '').slice(0, 12)}`));
      slides.forEach((s) => addAudio(s.vo, `课件第 ${s.index} 页`));
      if (track) addAudio(track.file, '整条音轨');
      if (theme.music?.file) addAudio(theme.music.file, '配乐底板');
      if (theme.sfx?.file) addAudio(theme.sfx.file, '音效');
      songs.forEach((s, i) => addAudio(s.file, `主题歌 ${i + 1}${s.title ? `：${s.title}` : ''}`));
      (project.swaps || []).forEach((s, i) => addAudio(s.file, `换过嗓子的第 ${i + 1} 条`));

      const charsForSwap = (voiceLib.characters || []).filter((c) => c.kind !== 'official');

      // ─────────────── 广播剧：剧本 / 导出包 / 视频打点 / 跨语种 ───────────────
      // 剧本的读法、人物名匹配全在 VoiceCaster（/api/parse）；这边只负责
      // 「放进文稿 → 谁念 → 一句一句念 → 打包 → 对时间」。
      const fmtSec = (s) => {
        const n = Number(s) || 0;
        const m = Math.floor(n / 60);
        return `${String(m).padStart(2, '0')}:${(n - m * 60).toFixed(2).padStart(5, '0')}`;
      };
      const script = project.script || {};
      const scriptLines = script.lines || [];
      const [pickNo, setPickNo] = useState(null);      // 打点绑到哪一句
      const [packFmt, setPackFmt] = useState('mp3');
      const [packTracks, setPackTracks] = useState('none');
      const [xText, setXText] = useState('');
      const [xLang, setXLang] = useState('English');
      const [xChar, setXChar] = useState('');
      const [xfresh, setXfresh] = useState(null);
      const [cloneOpen, setCloneOpen] = useState(false);
      const [cloneName, setCloneName] = useState('');
      const [cloneBusy, setCloneBusy] = useState(false);
      const videoRef = useRef(null);
      const clockRef = useRef(null);

      const importScript = async (file) => {
        if (!file) return;
        try {
          setErr('');
          setBusy({ type: '剧本', message: `正在读 ${file.name}…`, progress: 0.3 });
          const r = await fetch(`${API}/api/projects/${project.id}/script?name=${encodeURIComponent(file.name)}`, {
            method: 'POST', headers: { 'Content-Type': 'application/octet-stream' }, body: file,
          });
          const d = await r.json();
          if (!r.ok) throw new Error(d.error || `HTTP ${r.status}`);
          const fresh = await api(`/api/projects/${project.id}`);
          setProject(fresh);
        } catch (e) { setErr(String(e.message)); } finally { setBusy(null); }
      };
      const pickScript = () => {
        const inp = document.createElement('input');
        inp.type = 'file'; inp.accept = '.docx,.doc,.txt,.md,.pdf';
        inp.onchange = () => { const f = inp.files && inp.files[0]; if (f) importScript(f); };
        inp.click();
      };

      const setLine = (no, delta) => {
        const lines = scriptLines.map((l) => (String(l.no) === String(no) ? { ...l, ...delta } : l));
        setProject({ ...project, script: { ...script, lines } });
      };

      const sayScriptLine = async (no, textOverride) => {
        const fresh = await api(`/api/projects/${project.id}`);
        const lines = fresh.script?.lines || [];
        const l = lines.find((x) => String(x.no) === String(no));
        if (!l) { setErr('这一句不见了，刷新一下'); return null; }
        const want = String(textOverride == null ? (l.text || '') : textOverride);
        if (!want.trim()) { setErr(`第 ${l.no} 句是空的`); return null; }
        // 先把手打的字存进去 —— 不然念的是上一版稿子（念白和改字不同步）
        await patch({
          script: {
            ...(fresh.script || {}),
            lines: lines.map((x) => (String(x.no) === String(l.no) ? { ...x, text: want } : x)),
          },
        });
        const pick = l.voice || (l.char_id ? `char:${l.char_id}` : (voices[0] || 'vivian'));
        const charId = (/^char:(\d+)$/.exec(pick) || [])[1] || null;
        const instruct = [l.instruct, ...(l.prompts || [])].filter(Boolean).join('，');
        const r = await runJob('tts', {
          text: want, voice: charId ? null : pick, character: charId,
          emotion: l.emotion || '', instruct, tag: `s${l.no}`,
        });
        if (!r) return null;
        const now2 = await api(`/api/projects/${project.id}`);
        const ls = (now2.script?.lines || []).map((x) => (
          String(x.no) === String(l.no) ? { ...x, vo: r.file, seconds: r.seconds } : x));
        await patch({ script: { ...(now2.script || {}), lines: ls } });
        return r;
      };

      const saySection = async (section) => {
        const fresh = await api(`/api/projects/${project.id}`);
        const todo = (fresh.script?.lines || []).filter((l) => String(l.text || '').trim()
          && String(l.section || '') === String(section || '') && !l.vo);
        if (!todo.length) { setErr('这一场该念的都念过了'); return; }
        for (const l of todo) await sayScriptLine(l.no, l.text);   // 串行：机器一次只跑一件
        await refreshProject(project.id);
      };

      const saveScript = async () => {
        if (!project) return;
        await patch({ script: project.script || {} });
      };

      const doEmbed = async () => {
        await patch({ slides: project.slides });
        await runJob('embed_deck', {});
      };

      const doExport = async () => {
        // 先把界面上的字存下来（清单里的台词取的是存盘那份）
        await patch({ script: project.script || {}, scenes: project.scenes || [] });
        await runJob('export_package', { format: packFmt, tracks: packTracks, srt: true });
      };

      const uploadVideo = async (file) => {
        if (!file) return;
        try {
          setErr('');
          setBusy({ type: '视频', message: `正在读 ${file.name}…`, progress: 0.4 });
          const r = await fetch(`${API}/api/projects/${project.id}/video?name=${encodeURIComponent(file.name)}`, {
            method: 'POST', headers: { 'Content-Type': 'application/octet-stream' }, body: file,
          });
          const d = await r.json();
          if (!r.ok) throw new Error(d.error || `HTTP ${r.status}`);
          const fresh = await api(`/api/projects/${project.id}`);
          setProject(fresh);
        } catch (e) { setErr(String(e.message)); } finally { setBusy(null); }
      };
      const pickVideo = () => {
        const inp = document.createElement('input');
        inp.type = 'file'; inp.accept = 'video/*';
        inp.onchange = () => { const f = inp.files && inp.files[0]; if (f) uploadVideo(f); };
        inp.click();
      };
      // 打点：把视频当前秒数绑到这一句（导出包的 Manifest 会用它的时间）
      const markLine = async (no) => {
        const v = videoRef.current;
        if (!v) { setErr('先放进一个视频再打点'); return; }
        const t = Math.round(v.currentTime * 1000) / 1000;
        await patch({ marks: { ...(project.marks || {}), [String(no)]: t } });
        setPickNo(String(no));
      };

      const doXlang = async () => {
        if (!xText.trim()) { setErr('先写要念的外文稿'); return; }
        if (!xChar) { setErr('先挑一个带定妆录音的角色'); return; }
        const cid = (/^char:(\d+)$/.exec(xChar) || [])[1] || String(xChar).replace(/[^0-9]/g, '');
        const r = await runJob('crosslingual', { text: xText, lang: xLang, character: cid });
        if (r) { setXfresh(r); await refreshProject(project.id); }
      };

      // 克隆一个新声音：录音 → VoiceCaster 降噪、统一 48k → 编号进它的角色库。
      // 造完立刻刷新角色库，下拉里就能选到 —— 不用去 VoiceCaster 那边操作。
      const cloneVoice = async (file) => {
        if (!file) return;
        const who = (cloneName || '').trim();
        if (!who) { setErr('先给它起个名字'); return; }
        setCloneBusy(true);
        setErr('');
        try {
          const r = await fetch(`${API}/api/clone-voice?name=${encodeURIComponent(file.name)}&name_who=${encodeURIComponent(who)}`, {
            method: 'POST', headers: { 'Content-Type': 'application/octet-stream' }, body: file,
          });
          const d = await r.json();
          if (!r.ok) throw new Error(d.error || `HTTP ${r.status}`);
          await reloadVoices();
          setCloneOpen(false);
          setCloneName('');
        } catch (e) { setErr(String(e.message)); } finally { setCloneBusy(false); }
      };
      const pickCloneAudio = () => {
        const inp = document.createElement('input');
        inp.type = 'file'; inp.accept = 'audio/*,.wav,.mp3,.m4a';
        inp.onchange = () => { const f = inp.files && inp.files[0]; if (f) cloneVoice(f); };
        inp.click();
      };

      const audioPick = (value, onChange, placeholder) => h('select', {
        className: 'cs-select', value,
        onChange: (e) => onChange(e.target.value),
      },
      h('option', { value: '' }, placeholder),
      audioPool.map((a) => h('option', { key: a.file, value: a.file }, a.label)));

      // 通用版：传进来的池子里可能是音频、也可能是谱子（送出去那块两种都收）
      const poolPick = (pool, value, onChange, placeholder) => h('select', {
        className: 'cs-select', value: value || '',
        onChange: (e) => onChange(e.target.value),
      },
      h('option', { value: '' }, placeholder),
      pool.map((a) => h('option', { key: a.file, value: a.file }, a.label)));

      // 「谁念」下拉：角色库（含克隆声）+ 千问自带。值写成 char:<编号> 或音色名。
      const voiceSelect = (value, onChange) => {
        const chars = voiceLib.characters || [];
        const known = /^char:/.test(value || '') && chars.some((c) => `char:${c.id}` === value);
        return h('select', {
          className: 'cs-select', value: value || '',
          onChange: (e) => onChange(e.target.value),
        },
        // 空值也要看得见：不加的话浏览器会把第一项（第一个角色）显示出来，
        // 看着像「已经选了某个角色」，其实没选（2026-11-15 实拍抓到）。
        !value ? h('option', { value: '' }, '（还没挑 · 用默认嗓子）') : null,
        /^char:/.test(value || '') && !known
          ? h('option', { value }, `角色 ${String(value).slice(5)}（角色库没开着）`)
          : null,
        chars.length
          ? h('optgroup', { label: '角色库（含你自己的声音）' },
            chars.map((c) => h('option', { key: `c${c.id}`, value: `char:${c.id}` },
              `${c.id}. ${c.name}${c.kind === 'clone' ? '（克隆）' : ''}`)))
          : null,
        h('optgroup', { label: '千问自带' },
          (voices.length ? voices : ['vivian']).map((v) => h('option', { key: v, value: v }, v))),
        );
      };

      const emoSelect = (value, onChange) => h('select', {
        className: 'cs-select', value: value || '',
        onChange: (e) => onChange(e.target.value),
      },
      h('option', { value: '' }, '本来语气'),
      (voiceLib.emotions || []).map((e2) => h('option', { key: e2, value: e2 }, emoLabel(e2))));

      // 试听：听一耳朵比看名字靠谱（尤其挑你自己的克隆声时）
      const previewVoice = async (value, emotion) => {
        const cid = (/^char:(\d+)$/.exec(value || '') || [])[1];
        if (!cid) { setErr('先挑一个角色，再试听（千问那些音色本来就听得出）'); return; }
        try {
          const r = await fetch(`${API}/api/voice-preview`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ character: cid, emotion: emotion || '' }),
          });
          if (!r.ok) {
            let m = '试听失败';
            try { m = (await r.json()).error || m; } catch { /* 就这句 */ }
            setErr(m);
            return;
          }
          const a = new Audio(URL.createObjectURL(await r.blob()));
          a.play();
        } catch (e) { setErr(String(e.message || e)); }
      };

      // 从外面拿一段音频进来（换嗓子的源，或目标嗓音的样板）
      const uploadAudio = (then) => {
        const inp = document.createElement('input');
        inp.type = 'file';
        inp.accept = 'audio/*,.wav,.mp3,.m4a,.flac,.aiff';
        inp.onchange = async () => {
          const f = inp.files && inp.files[0];
          if (!f) return;
          try {
            const r = await fetch(`${API}/api/projects/${project.id}/audio?name=${encodeURIComponent(f.name)}`, {
              method: 'POST', headers: { 'Content-Type': 'application/octet-stream' }, body: f,
            });
            const d = await r.json();
            if (!r.ok) throw new Error(d.error || `HTTP ${r.status}`);
            then(d);
          } catch (e) { setErr(String(e.message || e)); }
        };
        inp.click();
      };

      const doSwap = async () => {
        const from = swapFrom || (audioPool[0] && audioPool[0].file);
        if (!from) return;
        if (!swapWho && !swapOwn) return;
        const r = await runJob('voice_convert', {
          source: from,
          targetChar: swapWho ? swapWho.replace(/^char:/, '') : null,
          targetFile: swapWho ? null : swapOwn,
          targetClean: !!swapOwn,
        });
        if (r) setSwapOut(r);
      };

      const doScore = async () => {
        const from = scoreFrom || (audioPool[0] && audioPool[0].file);
        if (!from) return;
        const r = await runJob('transcribe', { source: from, tag: 'score' });
        if (r) setScoreOut(r);
      };

      // ── 谱子：送给 MIR Studio 打开（改谱/简谱/PDF），或导出 MusicXML ──
      // 用户 2026-11-15：「谱子上面的歌词不用管，就是打开 MIR studio」。
      // 所以创作台不自己画谱，只把谱送过去、把页面开出来。
      const scorePool = [];
      songs.forEach((s, i) => {
        if (s.score) scorePool.push({ file: s.score, label: `主题歌 ${i + 1}：${s.title || '未命名'} 的谱` });
      });
      (project.scores || []).forEach((s, i) => {
        if (/\.abc$/i.test(s.file || '')) scorePool.push({ file: s.file, label: `转出来的第 ${i + 1} 份谱` });
      });

      const openInStudio = async () => {
        const from = tidyFrom || (scorePool[0] && scorePool[0].file);
        if (!from) { setErr('作品里还没有谱子：先出首歌，或把一段录音转成谱'); return; }
        try {
          setErr('');
          setBusy({ type: 'MIR Studio', message: '把谱子送进 MIR Studio…', progress: 0.5 });
          const r = await fetch(`${API}/api/projects/${project.id}/studio`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ file: from, title: project.name }),
          });
          const d = await r.json();
          if (!r.ok) throw new Error(d.error || `HTTP ${r.status}`);
          setStudioOut(d);
        } catch (e) { setErr(String(e.message || e)); } finally { setBusy(null); }
      };

      const doTidy = async () => {
        const from = tidyFrom || (scorePool[0] && scorePool[0].file);
        if (!from) { setErr('作品里还没有谱子'); return; }
        const r = await runJob('score', { file: from, ops: ['clef', 'split'], style: draft.songStyle || '' });
        if (r) setTidyOut(r);
      };

      // ── 量：速度 + 响度（只量，不替人判断好不好听）──
      const doMeasure = async () => {
        const from = measureFrom || (audioPool[0] && audioPool[0].file);
        if (!from) { setErr('先挑一段音频'); return; }
        const r = await runJob('analyze', { source: from });
        if (r) setMeasureOut(r);
      };

      // 把数字翻成人话（§2.3）：先说这意味着什么，再说要不要管。
      const sayLoudness = (d) => {
        if (!d || d.lufs == null) return '';
        const parts = [];
        // 流媒体常见目标：约 -14 LUFS；播客/有声书约 -16
        const diff = Math.round((d.lufs - (-14)) * 10) / 10;
        if (Math.abs(diff) <= 1) parts.push('响度正好在流媒体平台上常见的水平（-14 左右），传上去不用再调。');
        else if (diff < 0) parts.push(`比流媒体常见的响度轻约 ${Math.abs(diff)} 格 —— 放到平台上有时候会显得小一点，要不要提就看你想不想压。`);
        else parts.push(`比流媒体常见的响度响约 ${diff} 格 —— 手机上可能偏吵，平台有时还会自己压回来。`);
        if (d.peak != null && d.peak > -1) parts.push('峰值已经贴到顶了，再响一点就会削掉。');
        else if (d.peak != null) parts.push(`峰值还留了 ${Math.abs(d.peak).toFixed(1)} 格的余量，没有被削。`);
        return parts.join('');
      };

      const sayBpm = (d) => {
        if (!d || d.bpm == null) return '';
        const alt = d.bpmAlt ? `（量的时候它还给出过 ${d.bpmAlt} 的读法 —— 同一段，两倍速，按低的那个用）` : '';
        return `约 ${d.bpm} 拍/分钟${alt}。`;
      };

      // ── 送出去精修：交给 MIR 那四座桥（ACE Studio / Ableton Live）──
      const sendPool = [...audioPool];
      scorePool.forEach((s) => sendPool.push({ file: s.file, label: s.label }));

      const doSend = async (target) => {
        const from = sendFrom || (sendPool[0] && sendPool[0].file);
        if (!from) { setErr('先挑一份要送出去的东西'); return; }
        const r = await runJob('handoff', {
          target, file: from, title: project.theme?.title || project.name,
        });
        if (r) setSendOut(r);
      };

      // 术语表：改的是 VoiceCaster 那张表（两边共一张）
      const openGlossary = () => {
        setGlossTerms((voiceLib.glossary?.terms || []).map((t) => ({ ...t })));
        setGlossOpen(true);
      };
      const saveGlossary = async (terms) => {
        setGlossBusy(true);
        try {
          await fetch(`${API}/api/glossary`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ terms }),
          });
          setGlossBusy(false);
          // 重新拉一次，让界面和表一致
          try {
            const g = await fetch(`${API}/api/glossary`).then((x) => x.json());
            if (g && Array.isArray(g.terms)) voiceLib.glossary = g;
          } catch { /* 拉不到就先用本地的 */ }
          setGlossOpen(false);
          setGlossTerm('');
        } catch { setGlossBusy(false); }
      };

      return h('div', null,
        h('div', { className: 'cs-row' },
          h('input', {
            className: 'cs-input', value: project.name,
            onChange: (e) => setProject({ ...project, name: e.target.value }),
            onBlur: () => patch({ name: project.name }),
            style: { maxWidth: 320, fontWeight: 600 },
          }),
          h('span', { className: 'cs-tag' }, kindLabel),
          h('span', { className: 'cs-spacer' }),
          h('button', {
            className: 'cs-btn', disabled: !!busy,
            onClick: project.kind === 'course' ? saveSlides
              : project.kind === 'radio' ? saveScript : saveScenes,
          }, project.kind === 'course' ? '保存讲稿'
            : project.kind === 'radio' ? '保存剧本' : '保存分镜'),
        ),

        // ───────────────────────── 有声课件 ─────────────────────────
        // 这一块只在「有声课件」项目里出现。别拿幻灯片那套镜头卡片硬塞课件 ——
        // 课件是一页一页念，幻灯片是一个镜头一个镜头接。
        project.kind === 'course' ? h('div', { className: 'cs-block' },
          h('div', { className: 'cs-block-h' },
            h('span', null, '📑 课件'),
            deck ? h('span', { className: 'cs-tag' }, `${deck.name} · ${deck.pages} 页`) : null,
            h('span', { className: 'cs-hint', style: { marginLeft: 'auto' } },
              '备注优先；这页没备注就读页面正文')),
          h('div', { className: 'cs-row' },
            h('button', { className: 'cs-btn', 'data-primary': '1', disabled: !!busy, onClick: pickDeck },
              slides.length ? '换一份 PPT…' : '放入 PPT…'),
            slides.length ? (() => {
              const todo = slides.filter((s) => !s.vo && String(s.text || '').trim()).length;
              return h('button', {
                className: 'cs-btn', disabled: !!busy || todo === 0, onClick: sayAllPages,
              }, todo ? `全部念一遍（还有 ${todo} 页没念）` : '都念过了');
            })() : null,
            slides.length ? h('button', {
              className: 'cs-btn', 'data-primary': '1',
              disabled: !!busy || !slides.some((s) => s.vo),
              onClick: buildDeckTrack,
            }, '出音频包') : null,
            slides.length ? h('button', {
              className: 'cs-btn', 'data-primary': '1',
              title: '每页右下角放一个播放按钮；放映时点了才响',
              disabled: !!busy || !slides.some((s) => s.vo),
              onClick: doEmbed,
            }, busy && busy.type === 'embed_deck' ? '在嵌…' : '嵌回 PPT') : null,
            deckTrack ? h('span', { className: 'cs-sub' }, `${deckTrack.pages} 页 · 共 ${deckTrack.total} 秒`) : null,
          ),
          project.deckAudio ? h('div', { className: 'cs-row' },
            h('span', { className: 'cs-sound-mark' }, `已嵌 ${project.deckAudio.pages} 页`),
            h('span', { className: 'cs-hint' }, '每页一个播放按钮，放映时点了才响'),
            h('a', {
              className: 'cs-btn', 'data-primary': '1',
              href: fileUrl(project.deckAudio.file) + '?dl', download: true,
            }, '下载有声课件'),
          ) : null,
          // 这一套课件用谁的嗓子念：选角色（含你自己的声音），再挑个情绪。
          // 改完对「全部念一遍」和新念的页生效；已经念过的页要重念才会变。
          slides.length ? h('div', { className: 'cs-row' },
            h('div', { style: { flex: '0 0 240px' } },
              h('div', { className: 'cs-label' }, '这一套用谁念'),
              h('div', { className: 'cs-row', style: { marginBottom: 0 } },
                voiceSelect(project.deckVoice || '', (v) => patch({ deckVoice: v })),
                h('button', {
                  className: 'cs-btn', title: '听一耳朵这个嗓子',
                  onClick: () => previewVoice(project.deckVoice, project.deckEmotion),
                }, '▶'))),
            h('div', { style: { flex: '0 0 150px' } },
              h('div', { className: 'cs-label' }, '情绪'),
              emoSelect(project.deckEmotion || '', (v) => patch({ deckEmotion: v }))),
            h('span', { className: 'cs-hint' }, '改了以后，重念才会变'),
          ) : null,
          !slides.length
            ? h('div', { className: 'cs-hint' },
              '放一份 .pptx 进来：我把每页要讲的话读出来 → 你改字 → 我念 → 最后拼成一条，附一张每页对应几秒的清单。')
            : null,
          deckTrack ? h('div', { className: 'cs-row' },
            h('span', { className: 'cs-sound-mark' }, '整条'),
            h('audio', { controls: true, src: fileUrl(deckTrack.file), style: { flex: 1, height: 30 } }),
            h('a', { className: 'cs-btn', href: fileUrl(deckTrack.manifest) + '?dl', download: true }, '时间清单')) : null,
          slides.map((s, i) => h('div', {
            key: s.index, className: 'cs-card', style: { display: 'block', padding: 10, marginBottom: 8 },
          },
          h('div', { className: 'cs-row', style: { marginBottom: 4 } },
            h('span', { className: 'cs-tag' }, `第 ${s.index} 页`),
            h('span', { className: 'cs-hint' },
              s.source === 'notes' ? '念的是备注' : s.source === 'body' ? '这页没备注，念页面正文' : '这页空的'),
            h('span', { className: 'cs-spacer' }),
            h('button', { className: 'cs-btn', disabled: !!busy, onClick: () => sayPage(s.index) },
              s.vo ? '重念' : '念这页'),
            s.vo ? h('audio', { controls: true, src: fileUrl(s.vo), style: { height: 30, width: 200 } }) : null,
            s.seconds ? h('span', { className: 'cs-sub' }, `${s.seconds} 秒`) : null),
          h('textarea', {
            className: 'cs-area', value: s.text || '', placeholder: '这页要讲的话（可以改）',
            onChange: (e) => setSlide(i, { text: e.target.value }),
            style: { minHeight: 46 },
          }),
          )),
        ) : null,

        // ───────────────────────── 广播剧：剧本 ─────────────────────────
        // 只在「广播剧」项目里出现。剧本按「名字：台词」拆行，场次是从
        // ───── [01] 场次名 ───── 里读出来的；括号整行是动作提示，不念。
        project.kind === 'radio' ? h('div', { className: 'cs-block' },
          h('div', { className: 'cs-block-h' },
            h('span', null, '📖 剧本'),
            script.source ? h('span', { className: 'cs-tag' }, script.source) : null,
            scriptLines.length ? h('span', { className: 'cs-tag' }, `${scriptLines.length} 句`) : null,
            h('span', { className: 'cs-hint', style: { marginLeft: 'auto' } },
              '每行「名字：台词」；括号整行是动作提示，不念')),
          h('div', { className: 'cs-row' },
            h('button', {
              className: 'cs-btn', 'data-primary': '1', disabled: !!busy, onClick: pickScript,
            }, scriptLines.length ? '换一份剧本…' : '放入剧本（Word / txt / pdf）…'),
            scriptLines.length ? h('button', {
              className: 'cs-btn', disabled: !!busy, onClick: saveScript,
            }, '保存剧本') : null,
            h('span', { className: 'cs-hint', style: { marginLeft: 'auto' } },
              '人物名去角色库找最像的那个，绝不自动新建')),
          (script.unmapped || []).length
            ? h('div', { className: 'cs-hint', style: { color: '#ffb0c8', lineHeight: 1.9 } },
              `还没配声音：${script.unmapped.join('、')} —— 在每行下拉里挑一个。`)
            : null,
          !scriptLines.length
            ? h('div', { className: 'cs-hint', style: { lineHeight: 1.9 } },
              '放一份剧本进来：我按「名字：台词」拆行、按 ─── 分场，'
              + '人物名去角色库找最像的那个；找不到不会瞎建，会让你手动挑。')
            : null,
          scriptLines.map((l, i) => {
            const no = String(l.no);
            const newSection = i === 0 || scriptLines[i - 1].section !== l.section;
            const chosen = l.voice || (l.char_id ? `char:${l.char_id}` : '');
            const mark = project.marks && project.marks[no] != null ? Number(project.marks[no]) : null;
            return h('div', { key: no },
              newSection ? h('div', {
                className: 'cs-row',
                style: { marginTop: 6, padding: '4px 8px', borderRadius: 8, background: 'rgba(255,154,60,.10)' },
              },
              h('span', { style: { color: '#ffbf80', fontSize: 12.5 } }, l.section || '（开场）'),
              h('span', { className: 'cs-spacer' }),
              l.section ? h('button', {
                className: 'cs-btn', disabled: !!busy, onClick: () => saySection(l.section),
              }, '念这一场') : null) : null,
              h('div', {
                className: 'cs-card',
                style: {
                  display: 'block', padding: 10, marginBottom: 8,
                  borderColor: pickNo === no ? 'rgba(255,154,60,.6)' : undefined,
                },
              },
              h('div', { className: 'cs-row', style: { marginBottom: 4 } },
                h('span', { className: 'cs-tag' }, no),
                h('span', { style: { fontSize: 12.5, minWidth: 54 } }, l.name),
                chosen ? null : h('span', {
                  className: 'cs-tag',
                  style: { color: '#ffb0c8', borderColor: 'rgba(255,176,200,.45)' },
                }, '还没配声音'),
                h('span', { className: 'cs-spacer' }),
                h('button', {
                  className: 'cs-btn', title: '把视频当前的秒数绑到这一句',
                  onClick: () => markLine(no),
                }, mark != null ? `🎯 ${fmtSec(mark)}` : '🎯 打点'),
                l.seconds ? h('span', { className: 'cs-sub' }, `${l.seconds} 秒`) : null),
              h('textarea', {
                className: 'cs-area', value: l.text || '',
                placeholder: '这一句台词（可以改）',
                onChange: (e) => setLine(no, { text: e.target.value }),
                style: { minHeight: 42 },
              }),
              (l.prompts || []).length
                ? h('div', { className: 'cs-hint' }, `动作/音效：${l.prompts.join('；')}（不念，会当语气提示）`)
                : null,
              h('div', { className: 'cs-row', style: { marginBottom: 0, marginTop: 4 } },
                h('div', { style: { flex: '0 0 180px' } },
                  h('div', { className: 'cs-label' }, '谁念'),
                  h('div', { className: 'cs-row', style: { marginBottom: 0 } },
                    voiceSelect(chosen, (v) => setLine(no, { voice: v })),
                    h('button', {
                      className: 'cs-btn', title: '听一耳朵这个嗓子',
                      onClick: () => previewVoice(chosen, l.emotion),
                    }, '▶'))),
                h('div', { style: { flex: '0 0 116px' } },
                  h('div', { className: 'cs-label' }, '情绪'),
                  emoSelect(l.emotion || '', (v) => setLine(no, { emotion: v }))),
                h('div', { style: { flex: 1 } },
                  h('div', { className: 'cs-label' }, '语气（可以留空）'),
                  h('input', {
                    className: 'cs-input', value: l.instruct || '',
                    placeholder: '压着嗓子，有点担心',
                    onChange: (e) => setLine(no, { instruct: e.target.value }),
                  })),
                h('button', {
                  className: 'cs-btn', 'data-primary': l.vo ? '0' : '1',
                  disabled: !!busy, onClick: () => sayScriptLine(no, l.text),
                }, l.vo ? '重念' : '念这句'),
                l.vo ? h('audio', {
                  controls: true, src: fileUrl(l.vo), style: { height: 30, width: 170 },
                }) : null),
              ),
            );
          }),
          scriptLines.length ? h('div', { className: 'cs-row', style: { marginTop: 4 } },
            h('button', {
              className: 'cs-btn', onClick: buildTrack,
              disabled: !!busy || !scriptLines.some((x) => x.vo),
            }, '① 接成一条音轨'),
            h('span', { className: 'cs-hint' }, '按句序接起来；配乐/音效底板会垫在下面'),
            track ? h('span', { className: 'cs-sub' }, `音轨 ${track.total} 秒`) : null) : null,
        ) : null,

        // ───────────────────────── 对时间（视频 + 打点）─────────────────────────
        // 视频只用来对时间，不进成片（VoiceCaster 的规矩）。打点存进 project.marks，
        // 导出包写 Manifest 时一句一个时间。
        project.kind === 'course' ? null : h('div', { className: 'cs-block' },
          h('div', { className: 'cs-block-h' },
            h('span', null, '🎬 对时间'),
            project.video
              ? h('span', { className: 'cs-tag' }, `${project.video.name} · ${project.video.seconds} 秒`)
              : h('span', { className: 'cs-hint' }, '还没放视频'),
            h('span', { className: 'cs-hint', style: { marginLeft: 'auto' } }, '视频只预览，不进成片')),
          h('div', { className: 'cs-row' },
            h('button', { className: 'cs-btn', disabled: !!busy, onClick: pickVideo },
              project.video ? '换一个视频…' : '放一个视频…'),
            h('span', { ref: clockRef, className: 'cs-sub' }, '00:00.00'),
            h('span', { className: 'cs-hint' }, '在剧本每行点「🎯 打点」，就记下这一刻')),
          project.video ? h('video', {
            ref: videoRef, controls: true, src: fileUrl(project.video.file),
            style: { width: '100%', maxHeight: 250, borderRadius: 10, background: '#000' },
            onTimeUpdate: () => {
              if (clockRef.current && videoRef.current) {
                clockRef.current.textContent = fmtSec(videoRef.current.currentTime);
              }
            },
          }) : null,
          Object.keys(project.marks || {}).length
            ? h('div', { className: 'cs-hint', style: { marginTop: 6, lineHeight: 1.9 } },
              '已打点：' + Object.entries(project.marks || {})
                .sort((a, b) => Number(a[1]) - Number(b[1]))
                .map(([no, t]) => `第 ${no} 句 ${fmtSec(t)}`).join('；'))
            : null,
        ),

        // ───────────────────────── 导出包 ─────────────────────────
        // 编号音频 + Manifest + 字幕 + 按角色分轨。这套规矩全在 VoiceCaster，
        // 这边只负责把句子喂过去、把 zip 收回来。
        project.kind === 'course' ? null : h('div', { className: 'cs-block' },
          h('div', { className: 'cs-block-h' },
            h('span', null, '📦 导出包'),
            h('span', { className: 'cs-hint', style: { marginLeft: 'auto' } },
              '001/002… + 清单 + 字幕 + 按角色分轨')),
          h('div', { className: 'cs-row' },
            h('div', { style: { flex: '0 0 96px' } },
              h('div', { className: 'cs-label' }, '格式'),
              h('select', {
                className: 'cs-select', value: packFmt,
                onChange: (e) => setPackFmt(e.target.value),
              },
              ['mp3', 'm4a', 'wav'].map((f) => h('option', { key: f, value: f }, f)))),
            h('div', { style: { flex: 1 } },
              h('div', { className: 'cs-label' }, '按角色分轨（进 DAW 用）'),
              h('select', {
                className: 'cs-select', value: packTracks,
                onChange: (e) => setPackTracks(e.target.value),
              },
              h('option', { value: 'none' }, '不分轨（只要分句 + 整段）'),
              h('option', { value: 'compact' }, '分轨：紧凑版（只留他的话，串起来）'),
              h('option', { value: 'aligned' }, '分轨：对齐版（和整部一样长，话在原位）'),
              h('option', { value: 'both' }, '分轨：两个都要'))),
            h('button', {
              className: 'cs-btn', 'data-primary': '1', disabled: !!busy, onClick: doExport,
            }, busy && busy.type === 'export_package' ? '在打包…' : '导出一个包'),
          ),
          (project.exports || []).length
            ? h('div', { style: { marginTop: 8 } },
              h('div', { className: 'cs-label' }, `导过的包（${project.exports.length}）`),
              project.exports.map((x) => h('div', { key: x.file, className: 'cs-row', style: { marginBottom: 4 } },
                h('span', { className: 'cs-tag' }, `${x.count} 句`),
                h('span', { className: 'cs-sub' }, x.seconds ? `${x.seconds} 秒` : ''),
                (x.tracks || []).length ? h('span', { className: 'cs-sub' }, `+ ${x.tracks.length} 条分轨`) : null,
                h('span', { className: 'cs-spacer' }),
                h('a', {
                  className: 'cs-btn', href: fileUrl(x.file) + '?dl', download: true,
                }, '下载 zip'))))
            : null,
        ),

        // ───────────────────────── 声音底板 ─────────────────────────
        h('div', { className: 'cs-block' },
          h('div', { className: 'cs-block-h' },
            h('span', null, '🎵 声音底板'),
            h('span', { className: 'cs-hint', style: { marginLeft: 'auto' } },
              '先做声音，再配画面 —— 底板会铺在整条音轨下面')),

          // 配乐
          h('div', { className: 'cs-row' },
            h('div', { style: { flex: 1 } },
              h('div', { className: 'cs-label' }, '配乐（铺在音轨下面，压得很低）'),
              h('input', {
                className: 'cs-input', value: draft.musicPrompt,
                placeholder: '夜深，钢琴单音，很慢，带一点不安',
                onChange: (e) => setDraftField('musicPrompt', e.target.value),
              })),
            h('div', { style: { flex: '0 0 92px' } },
              h('div', { className: 'cs-label' }, '多长（秒）'),
              h('input', {
                className: 'cs-input', type: 'number', min: 5, max: 380,
                value: draft.musicSeconds,
                onChange: (e) => setDraftField('musicSeconds', e.target.value),
              })),
            h('button', {
              className: 'cs-btn', 'data-primary': '1', disabled: !!busy, onClick: genMusic,
            }, busy && busy.type === 'music' ? '在做…' : '做配乐'),
          ),
          theme.music
            ? h('div', { className: 'cs-row', style: { marginBottom: 6 } },
              h('span', { className: 'cs-sound-mark' }, '当前底板'),
              h('audio', { controls: true, src: fileUrl(theme.music.file), style: { flex: 1, height: 30 } }),
              h('span', { className: 'cs-sub' }, `${theme.music.seconds} 秒`),
              h('button', { className: 'cs-btn', disabled: !!busy, onClick: clearMusic }, '撤掉'))
            : null,

          // 音效
          h('div', { className: 'cs-row', style: { marginTop: 2 } },
            h('div', { style: { flex: 1 } },
              h('div', { className: 'cs-label' }, '音效（可留空；塞在音轨开头）'),
              h('input', {
                className: 'cs-input', value: draft.sfxPrompt,
                placeholder: '门被推开，老木头的吱呀声',
                onChange: (e) => setDraftField('sfxPrompt', e.target.value),
              })),
            h('button', {
              className: 'cs-btn', disabled: !!busy, onClick: genSfx,
            }, busy && busy.type === 'sfx' ? '在做…' : '做音效'),
          ),
          theme.sfx
            ? h('div', { className: 'cs-row', style: { marginBottom: 6 } },
              h('span', { className: 'cs-tag' }, '音效'),
              h('audio', { controls: true, src: fileUrl(theme.sfx.file), style: { flex: 1, height: 30 } }),
              h('button', { className: 'cs-btn', disabled: !!busy, onClick: () => patchTheme({ sfx: null }) }, '撤掉'))
            : null,

          // 主题歌：两档
          h('div', { style: { marginTop: 10, paddingTop: 10, borderTop: '1px solid rgba(255,255,255,.08)' } },
            h('div', { className: 'cs-label' }, '主题歌'),
            h('div', { className: 'cs-row' },
              h('div', { style: { flex: '0 0 200px' } },
                h('input', {
                  className: 'cs-input', value: draft.songTitle, placeholder: '歌名',
                  onChange: (e) => setDraftField('songTitle', e.target.value),
                })),
              h('div', { style: { flex: 1 } },
                h('input', {
                  className: 'cs-input', value: draft.songStyle,
                  placeholder: '风格：慢板民谣，女声，木吉他，微微沙哑',
                  onChange: (e) => setDraftField('songStyle', e.target.value),
                })),
            ),
            h('div', { style: { marginTop: 6 } },
              h('div', { className: 'cs-label' }, '歌词（快档不用；慢档必须有词它才唱）'),
              h('textarea', {
                className: 'cs-area', value: draft.lyrics,
                placeholder: '夜深了 灯还亮着\n我把门轻轻带上…',
                onChange: (e) => setDraftField('lyrics', e.target.value),
                style: { minHeight: 64 },
              })),
            h('div', { className: 'cs-row', style: { marginTop: 6 } },
              h('div', { style: { flex: '0 0 300px' } },
                h('div', { className: 'cs-label' }, '慢档用哪台引擎'),
                h('select', {
                  className: 'cs-select', value: songEngine,
                  onChange: (e) => setSongEngine(e.target.value),
                },
                (health?.engines || SONG_ENGINES).map((e) => h('option', {
                  key: e.id, value: e.id,
                  disabled: e.ready === false,
                }, `${e.label || e.name || e.id}${e.ready === false ? '（没装）' : ''}`)))),
              h('span', { className: 'cs-hint', style: { marginLeft: 'auto', textAlign: 'right' } },
                (() => {
                  const st = (health?.engines || []).find((e) => e.id === songEngine);
                  const meta = SONG_ENGINES.find((e) => e.id === songEngine);
                  if (st && st.ready === false) return `这台用不了：${st.why}`;
                  return meta ? meta.hint : '';
                })()),
            ),
            h('div', { className: 'cs-row', style: { marginBottom: 0 } },
              h('button', { className: 'cs-btn', disabled: !!busy, onClick: genSongFast },
                busy && busy.type === 'music' ? '在做…' : '快档 · Stable Audio 纯音乐（十几秒到一分钟）'),
              h('button', { className: 'cs-btn', disabled: !!busy, onClick: genSongSlow },
                busy && busy.type === 'song' ? '在写歌…' : '慢档 · 用这台引擎出歌（几分钟）'),
              h('span', { className: 'cs-hint', style: { marginLeft: 'auto' } },
                '都走本机模型，机器一次只跑一件'),
            ),
          ),

          // 做过的歌
          songs.length
            ? h('div', { style: { marginTop: 10 } },
              h('div', { className: 'cs-label' }, `做过的歌（${songs.length}）`),
              songs.slice().reverse().map((s, k) => h('div', { key: (s.file || '') + k, className: 'cs-song' },
                h('span', { className: 'cs-tag' }, engineName(s.engine)),
                h('span', { style: { fontSize: 12.5, minWidth: 80 } }, s.title || '未命名'),
                h('span', { className: 'cs-sub' }, s.seconds ? `${s.seconds} 秒` : ''),
                h('audio', { controls: true, src: fileUrl(s.file), style: { flex: 1, height: 30 } }),
                s.score ? h('a', {
                  className: 'cs-btn', href: fileUrl(s.score) + '?dl', download: true,
                }, '谱子') : null,
                h('button', { className: 'cs-btn', disabled: !!busy, onClick: () => useAsMusic(s) }, '当配乐底板'),
              )))
            : null,
        ),

        // ───────────────────────── 修整台 ─────────────────────────
        // 换嗓子与转谱都来自 MIR 那边（引擎在 my-songwriter，不在这儿重写）。
        h('div', { className: 'cs-block' },
          h('div', { className: 'cs-block-h' },
            h('span', null, '🛠 修整台'),
            h('span', { className: 'cs-hint' }, '换嗓子 / 转谱 / 谱子 / 量 / 送出去'),
            h('button', {
              className: 'cs-btn', style: { marginLeft: 'auto' }, onClick: openGlossary,
            }, `专业词读音（${(voiceLib.glossary?.terms || []).length} 条）`)),
          h('div', { className: 'cs-hint', style: { marginBottom: 8 } },
            '换嗓子：把一首歌的人声换成另一个人的嗓子（先拆人声 → 换 → 合回伴奏）。转谱：丢一段录音，出一份谱子。'),
          // 克隆新声音：造完直接进角色库，全台都能用
          h('div', { className: 'cs-row' },
            h('button', {
              className: 'cs-btn', onClick: () => setCloneOpen((v) => !v),
            }, cloneOpen ? '收起克隆' : '＋ 克隆一个新声音'),
            h('span', { className: 'cs-hint' }, '放一段 5–30 秒干净人声（15 秒左右最好）'),
          ),
          cloneOpen ? h('div', { className: 'cs-row' },
            h('input', {
              className: 'cs-input', value: cloneName, placeholder: '给这个声音起个名字',
              onChange: (e) => setCloneName(e.target.value), style: { flex: 1 },
            }),
            h('button', {
              className: 'cs-btn', 'data-primary': '1', disabled: cloneBusy || !cloneName.trim(),
              onClick: pickCloneAudio,
            }, cloneBusy ? '在上传…' : '选一段录音…'),
            h('span', { className: 'cs-hint' }, '会过一遍降噪，编进角色库'),
          ) : null,

          h('div', { className: 'cs-row' },
            h('div', { style: { flex: 1 } },
              h('div', { className: 'cs-label' }, '把哪一首换嗓子'),
              audioPick(swapFrom, setSwapFrom, audioPool.length ? '挑一段（不挑就取第一条）' : '还没有音频：先念一句或做首歌')),
            h('button', { className: 'cs-btn', onClick: () => uploadAudio((d) => setSwapFrom(d.file)) }, '从磁盘放进来…'),
          ),
          h('div', { className: 'cs-row' },
            h('div', { style: { flex: 1 } },
              h('div', { className: 'cs-label' }, '换成谁的嗓子'),
              h('select', {
                className: 'cs-select', value: swapWho,
                onChange: (e) => { setSwapWho(e.target.value); if (e.target.value) setSwapOwn(''); },
              },
              h('option', { value: '' }, charsForSwap.length ? '挑一个（只用带定妆录音的）' : '角色库里没有能换的嗓子'),
              charsForSwap.map((c) => h('option', { key: c.id, value: `char:${c.id}` }, `${c.id}. ${c.name}`))),
            ),
            h('div', { style: { flex: 1 } },
              h('div', { className: 'cs-label' }, '……或者用你上传的一段录音'),
              h('div', { className: 'cs-row', style: { marginBottom: 0 } },
                h('input', { className: 'cs-input', value: swapOwn, readOnly: true, placeholder: '还没选' }),
                h('button', {
                  className: 'cs-btn',
                  onClick: () => uploadAudio((d) => { setSwapOwn(d.file); setSwapWho(''); }),
                }, '选…')),
            ),
            h('button', {
              className: 'cs-btn', 'data-primary': '1',
              disabled: !!busy || !(swapWho || swapOwn), onClick: doSwap,
            }, busy && busy.type === 'voice_convert' ? '在换…' : '开始换'),
          ),
          swapOut ? h('div', { className: 'cs-row' },
            h('span', { className: 'cs-sound-mark' }, '换好了'),
            h('audio', { controls: true, src: fileUrl(swapOut.file), style: { flex: 1, height: 30 } }),
            h('span', { className: 'cs-sub' }, `${swapOut.seconds} 秒`),
          ) : null,
          (project.swaps || []).length
            ? h('div', { className: 'cs-row' },
              h('span', { className: 'cs-hint' }, `之前换过 ${project.swaps.length} 条（在上面的下拉里能挑到）`))
            : null,

          h('div', { className: 'cs-row', style: { marginTop: 10 } },
            h('div', { style: { flex: 1 } },
              h('div', { className: 'cs-label' }, '把哪一段转成谱子'),
              audioPick(scoreFrom, setScoreFrom, audioPool.length ? '挑一段（不挑就取第一条）' : '还没有音频')),
            h('button', { className: 'cs-btn', onClick: () => uploadAudio((d) => setScoreFrom(d.file)) }, '从磁盘放进来…'),
            h('button', {
              className: 'cs-btn', 'data-primary': '1', disabled: !!busy, onClick: doScore,
            }, busy && busy.type === 'transcribe' ? '在听…' : '出谱子'),
          ),
          health?.backends && !health.backends.transcribeWeights
            ? h('div', { className: 'cs-hint' },
              '转谱的模型还没装好（2.8G）——装好了这里就能用；现在点会明说没装。')
            : null,
          scoreOut ? h('div', null,
            h('div', { className: 'cs-row' },
              h('span', { className: 'cs-sound-mark' }, `谱子：${scoreOut.bars} 小节`),
              h('a', { className: 'cs-btn', href: fileUrl(scoreOut.file) + '?dl', download: true }, '下载 .abc')),
            h('textarea', {
              className: 'cs-area', value: scoreOut.abc || '', readOnly: true,
              style: { minHeight: 92, fontFamily: 'ui-monospace,Menlo,monospace', fontSize: 11.5 },
            }),
          ) : null,

          // ─── 谱子：改谱 / 看简谱 / 打 PDF → 交给 MIR Studio ───
          // 用户 2026-11-15 定：「谱子上面的歌词不用管，就是打开 MIR studio」。
          h('div', { style: { marginTop: 10, paddingTop: 10, borderTop: '1px solid rgba(255,255,255,.08)' } },
            h('div', { className: 'cs-label' }, '谱子：送进 MIR Studio 看 / 改 / 打 PDF'),
            h('div', { className: 'cs-row' },
              h('div', { style: { flex: 1 } },
                poolPick(scorePool, tidyFrom, setTidyFrom,
                  scorePool.length ? '挑一份谱子' : '还没有谱子：先出首歌，或把录音转成谱')),
              h('button', {
                className: 'cs-btn', 'data-primary': '1', disabled: !!busy || !scorePool.length,
                onClick: openInStudio,
              }, busy && busy.type === 'MIR Studio' ? '在送…' : '在 MIR Studio 里打开'),
              h('button', {
                className: 'cs-btn', disabled: !!busy || !scorePool.length, onClick: doTidy,
              }, busy && busy.type === 'score' ? '在转…' : '导出 MusicXML')),
            h('div', { className: 'cs-hint' },
              'MIR Studio 是 MIR 自带的改谱网页（能改音高、五线谱/简谱切换、导出 PDF）。'
              + '点一下会把这份谱带进去，页面自己打开（Chrome）。'
              + '「导出 MusicXML」给 Dorico / MuseScore / ACE 用。'),
            studioOut ? h('div', { className: 'cs-row' },
              h('span', { className: 'cs-sound-mark' }, '已在 MIR Studio 里打开'),
              h('a', {
                className: 'cs-btn', href: studioOut.url, target: '_blank', rel: 'noreferrer',
              }, '再打开一次')) : null,
            tidyOut ? h('div', { className: 'cs-row', style: { flexWrap: 'wrap', rowGap: 6 } },
              h('span', { className: 'cs-sound-mark' }, 'MusicXML 出来了'),
              h('a', { className: 'cs-btn', href: fileUrl(tidyOut.file) + '?dl', download: true }, '下载主谱'),
              tidyOut.vocal ? h('a', { className: 'cs-btn', href: fileUrl(tidyOut.vocal) + '?dl', download: true },
                `唱的那条${tidyOut.vocalName ? `（${tidyOut.vocalName}）` : ''}`) : null,
              tidyOut.others ? h('a', { className: 'cs-btn', href: fileUrl(tidyOut.others) + '?dl', download: true }, '其余的') : null,
              tidyOut.clef ? h('span', { className: 'cs-hint' }, tidyOut.clef) : null) : null,
          ),

          // ─── 量：速度 / 响度（只量，判断归人）───
          h('div', { style: { marginTop: 10, paddingTop: 10, borderTop: '1px solid rgba(255,255,255,.08)' } },
            h('div', { className: 'cs-label' }, '量一下：速度 / 响度'),
            h('div', { className: 'cs-row' },
              h('div', { style: { flex: 1 } },
                audioPick(measureFrom, setMeasureFrom,
                  audioPool.length ? '挑一段（不挑就取第一条）' : '还没有音频')),
              h('button', {
                className: 'cs-btn', 'data-primary': '1', disabled: !!busy, onClick: doMeasure,
              }, busy && busy.type === 'analyze' ? '在量…' : '量一下')),
            measureOut ? h('div', { className: 'cs-hint', style: { lineHeight: 1.9 } },
              h('div', null, `速度：${sayBpm(measureOut)}`),
              h('div', null, `响度：${sayLoudness(measureOut)}`),
              h('div', { className: 'cs-sub' },
                `原始数：${measureOut.bpm ?? '—'} BPM · ${measureOut.lufs} LUFS · 峰值 ${measureOut.peak} dBFS · 起伏 ${measureOut.lra} LU`)) : null,
          ),

          // ─── 送出去精修：ACE Studio / Ableton Live ───
          h('div', { style: { marginTop: 10, paddingTop: 10, borderTop: '1px solid rgba(255,255,255,.08)' } },
            h('div', { className: 'cs-label' }, '送出去精修（ACE Studio / Ableton Live）'),
            h('div', { className: 'cs-row' },
              h('div', { style: { flex: 1 } },
                poolPick(sendPool, sendFrom, setSendFrom,
                  sendPool.length ? '挑一份（音频 / 谱子）' : '还没有能送的东西')),
              h('button', { className: 'cs-btn', disabled: !!busy, onClick: () => doSend('ace') },
                busy && busy.type === 'handoff' ? '在送…' : '送进 ACE'),
              h('button', { className: 'cs-btn', disabled: !!busy, onClick: () => doSend('live') }, '送进 Live')),
            h('div', { className: 'cs-hint' },
              '音频、MIDI、谱子都能送 ACE；Live 只收音频和 MIDI。'
              + '歌要送 ACE 精修，用「谱子」+「送进 ACE」（谱子进唱轨、音频进音频轨）。'),
            sendOut ? h('div', { className: 'cs-hint' }, sendOut.message || '已送出') : null,
          ),

          // ─── 跨语种：同一副嗓子去说外语（VoiceStudio / OmniVoice）───
          // 拿角色的定妆录音当参考，零训练换语言。官方音色没有参考录音，不列。
          h('div', { style: { marginTop: 10, paddingTop: 10, borderTop: '1px solid rgba(255,255,255,.08)' } },
            h('div', { className: 'cs-label' }, '跨语种：让同一个嗓子去说外语'),
            h('div', { className: 'cs-row' },
              h('div', { style: { flex: '0 0 220px' } },
                h('select', {
                  className: 'cs-select', value: xChar,
                  onChange: (e) => setXChar(e.target.value),
                },
                h('option', { value: '' }, charsForSwap.length ? '挑一个（要带定妆录音）' : '角色库里没有能换的嗓子'),
                charsForSwap.map((c) => h('option', { key: c.id, value: `char:${c.id}` }, `${c.id}. ${c.name}`)))),
              h('div', { style: { flex: '0 0 120px' } },
                h('select', {
                  className: 'cs-select', value: xLang,
                  onChange: (e) => setXLang(e.target.value),
                },
                ['English', 'Japanese', 'Spanish', 'Arabic', 'German', 'French', 'Korean']
                  .map((x) => h('option', { key: x, value: x }, x)))),
              h('div', { style: { flex: 1 } },
                h('input', {
                  className: 'cs-input', value: xText,
                  placeholder: '要念的外文稿（译文；先自己写好）',
                  onChange: (e) => setXText(e.target.value),
                })),
              h('button', {
                className: 'cs-btn', 'data-primary': '1',
                disabled: !!busy || !xText.trim() || !xChar, onClick: doXlang,
              }, busy && busy.type === 'crosslingual' ? '在说…' : '说这句'),
            ),
            xfresh ? h('div', { className: 'cs-row' },
              h('span', { className: 'cs-sound-mark' }, `跨语种 · ${xfresh.lang || ''}`),
              h('audio', { controls: true, src: fileUrl(xfresh.file), style: { flex: 1, height: 30 } }),
              h('span', { className: 'cs-sub' }, `${xfresh.seconds} 秒`),
            ) : null,
            (project.crosslinguals || []).length
              ? h('div', { style: { marginTop: 6 } },
                (project.crosslinguals || []).slice(0, 6).map((x) => h('div', { key: x.file, className: 'cs-row', style: { marginBottom: 4 } },
                  h('span', { className: 'cs-tag' }, x.lang || ''),
                  h('span', { className: 'cs-sub', style: { flex: '0 0 120px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, x.text),
                  h('audio', { controls: true, src: fileUrl(x.file), style: { flex: 1, height: 30 } }))))
              : null,
          ),
        ),

        project.kind === 'course' || project.kind === 'radio' ? null : h('div', { className: 'cs-row', style: { marginTop: 4 } },
          h('button', { className: 'cs-btn', onClick: addScene }, '＋ 加一个镜头'),
          h('button', { className: 'cs-btn', onClick: buildTrack, disabled: !!busy || !scenes.some((s) => s.vo) }, '① 接成一条音轨'),
          h('button', { className: 'cs-btn', 'data-primary': '1', onClick: buildFilm, disabled: !!busy || !scenes.length }, '② 拼成影片'),
          track ? h('span', { className: 'cs-sub' }, `音轨 ${track.total} 秒`) : null,
        ),

        // 时间表
        track ? h('div', { style: { margin: '6px 0 12px' } },
          h('audio', { controls: true, src: fileUrl(track.file), style: { width: '100%' } })) : null,

        project.kind === 'radio' ? null : scenes.map((s, i) => h('div', { key: s.id || i, className: 'cs-card' },
          h('div', { className: 'cs-card-media' },
            s.image
              ? h('img', { className: 'cs-thumb', src: fileUrl(s.image), alt: '' })
              : h('div', { className: 'cs-thumb cs-thumb-empty' }, h('span', { 'aria-hidden': true }, '🎞')),
            s.vo ? h('audio', { controls: true, src: fileUrl(s.vo), style: { width: '100%' } }) : null,
          ),
          h('div', { className: 'cs-card-body' },
            h('div', { className: 'cs-row', style: { marginBottom: 2 } },
              h('span', { className: 'cs-tag' }, `${i + 1}`),
              s.start != null ? h('span', { className: 'cs-sub' }, `${s.start}s → ${s.end}s`) : null,
              h('span', { className: 'cs-spacer' }),
              h('button', {
                className: 'cs-btn', 'data-danger': '1', disabled: !!busy,
                onClick: () => setProject({ ...project, scenes: scenes.filter((_, k) => k !== i) }),
              }, '删'),
            ),
            h('div', { className: 'cs-label' }, '台词（这一句会被念出来）'),
            h('textarea', {
              className: 'cs-area', value: s.text || '', placeholder: '母亲：这么晚了，你怎么才回来？',
              onChange: (e) => setScene(i, { text: e.target.value }),
            }),
            h('div', { className: 'cs-row', style: { marginBottom: 0 } },
              h('div', { style: { flex: '0 0 190px' } },
                h('div', { className: 'cs-label' }, '谁念'),
                h('div', { className: 'cs-row', style: { marginBottom: 0 } },
                  voiceSelect(s.voice || '', (v) => setScene(i, { voice: v })),
                  h('button', {
                    className: 'cs-btn', title: '听一耳朵这个嗓子',
                    onClick: () => previewVoice(s.voice, s.emotion),
                  }, '▶')),
              ),
              h('div', { style: { flex: '0 0 120px' } },
                h('div', { className: 'cs-label' }, '情绪'),
                emoSelect(s.emotion || '', (v) => setScene(i, { emotion: v })),
              ),
              h('div', { style: { flex: 1 } },
                h('div', { className: 'cs-label' }, '语气（可以留空）'),
                h('input', {
                  className: 'cs-input', value: s.instruct || '', placeholder: '压着嗓子，有点担心',
                  onChange: (e) => setScene(i, { instruct: e.target.value }),
                }),
              ),
              h('button', { className: 'cs-btn', disabled: !!busy, onClick: () => sayLine(i) }, s.vo ? '重念' : '念这句'),
            ),
            h('div', { className: 'cs-label', style: { marginTop: 6 } }, '画面提示（给画图用）'),
            h('textarea', {
              className: 'cs-area', value: s.imagePrompt || '', placeholder: '深夜的老式公寓玄关，昏黄的壁灯…',
              onChange: (e) => setScene(i, { imagePrompt: e.target.value }),
            }),
            h('div', { className: 'cs-row', style: { marginBottom: 0, justifyContent: 'flex-end' } },
              h('button', { className: 'cs-btn', disabled: !!busy, onClick: () => drawShot(i) }, s.image ? '重画这张' : '出图（这张要等二十多秒）'),
            ),
          ),
        )),

        scenes.length === 0 && project.kind !== 'radio' ? h('div', { className: 'cs-empty' }, '先加镜头：一句话 + 一个画面提示。') : null,

        // 成片
        (project.renders || []).length
          ? h('div', { style: { marginTop: 18 } },
            h('div', { className: 'cs-label' }, '成片'),
            project.renders.map((r) => h('div', { key: r.file, style: { marginBottom: 12 } },
              h('div', { className: 'cs-row' },
                h('span', { className: 'cs-sub' }, `${r.seconds} 秒`),
                h('a', { className: 'cs-btn', href: fileUrl(r.file) + '?dl', download: true }, '下载'),
              ),
              h('video', { controls: true, src: fileUrl(r.file), style: { width: '100%', borderRadius: 8 } }))))
          : null,

        // ───────────────────────── 术语表（弹层）─────────────────────────
        glossOpen && glossTerms ? h('div', {
          style: {
            position: 'fixed', inset: 0, zIndex: 9600, background: 'rgba(4,3,8,.74)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'auto',
          },
          onClick: (e) => { if (e.target === e.currentTarget) setGlossOpen(false); },
        },
        h('div', {
          style: {
            width: 'min(660px,92vw)', maxHeight: '82vh', overflow: 'auto', borderRadius: 14, padding: 16,
            background: 'linear-gradient(180deg,#171225,#0c0a14)', border: '1px solid rgba(255,255,255,.16)',
            boxShadow: '0 30px 90px rgba(0,0,0,.62)',
          },
        },
        h('div', { className: 'cs-row' },
          h('span', { style: { fontWeight: 600 } }, '专业词读音'),
          h('span', { className: 'cs-spacer' }),
          h('button', { className: 'cs-btn', onClick: () => setGlossOpen(false) }, '关')),
        h('div', { className: 'cs-hint', style: { marginBottom: 8, lineHeight: 1.9 } },
          '中文里夹的外语词（Allegro、Dorico）念之前会在两边断开，免得被按中文语流吞掉。'
          + '\n这张表就是 VoiceCaster 那张，两边共用；这里改了那边也变。'),
        glossTerms.map((t, k) => h('div', { className: 'cs-row', key: k },
          h('input', {
            className: 'cs-input', value: t.term || '', style: { flex: '0 0 150px' },
            onChange: (e) => setGlossTerms(glossTerms.map((x, j) => (j === k ? { ...x, term: e.target.value } : x))),
          }),
          h('input', {
            className: 'cs-input', value: t.lang || '', placeholder: '语言', style: { flex: '0 0 64px' },
            onChange: (e) => setGlossTerms(glossTerms.map((x, j) => (j === k ? { ...x, lang: e.target.value } : x))),
          }),
          h('input', {
            className: 'cs-input', value: t.note || '', placeholder: '备忘（可以不填）', style: { flex: 1 },
            onChange: (e) => setGlossTerms(glossTerms.map((x, j) => (j === k ? { ...x, note: e.target.value } : x))),
          }),
          h('button', {
            className: 'cs-btn', 'data-danger': '1',
            onClick: () => setGlossTerms(glossTerms.filter((_, j) => j !== k)),
          }, '删'))),
        h('div', { className: 'cs-row', style: { marginTop: 10 } },
          h('input', {
            className: 'cs-input', value: glossTerm, placeholder: '加一个词，比如 Adagio',
            style: { flex: 1 },
            onChange: (e) => setGlossTerm(e.target.value),
            onKeyDown: (e) => {
              if (e.key === 'Enter' && glossTerm.trim()) {
                setGlossTerms([...glossTerms, { term: glossTerm.trim(), lang: '', note: '' }]);
                setGlossTerm('');
              }
            },
          }),
          h('button', {
            className: 'cs-btn', disabled: !glossTerm.trim(),
            onClick: () => {
              setGlossTerms([...glossTerms, { term: glossTerm.trim(), lang: '', note: '' }]);
              setGlossTerm('');
            },
          }, '加'),
          h('button', {
            className: 'cs-btn', 'data-primary': '1', disabled: glossBusy,
            onClick: () => saveGlossary(glossTerms.filter((t) => String(t.term || '').trim())),
          }, glossBusy ? '存…' : '存进去'),
        ),
        ),
        ) : null,
      );
    }

    return {
      inject: ['slots'],
      apply(ctx) {
        ctx.slots.inject('sidebar.footer.action', () => ctx.slots.register({
          name: 'sidebar.footer.action', id: 'casting-studio-open', order: 30, label: '创作台',
        }, OpenButton));
        ctx.slots.inject('shell.overlay', () => ctx.slots.register({
          name: 'shell.overlay', id: 'casting-studio-panel', order: 60, label: '创作台',
        }, StudioPanel));
      },
    };
  },
});
