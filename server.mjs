#!/usr/bin/env node
// 创作台后端 —— 只做「排队、搬运、拼装」，不自己造声音、不自己画画。
//
// 三条老本行在后面干活，这个服务负责把它们串成一个作品：
//   · 千问 TTS      http://127.0.0.1:3910   （念台词、旁白）
//   · Crafting Caster http://127.0.0.1:7861 （配乐、音效、图片）
//   · MIR 适配器     my-songwriter/*.sh       （带词的主题歌）
//
// ★ 一条硬规矩（用户 2026-11-14 定）：**模型一次只能跑一个**。
//   这台机器是几年前的，并行会互相抢内存和显卡。所以所有生成任务走
//   一条队列、单个 worker，绝不并发。界面上的「排队中」就是它在等前一个。
//
// 启动：node server.mjs        （默认 127.0.0.1:7870）

import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { promises as fs, existsSync, createReadStream, createWriteStream } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';

const HERE = path.dirname(fileURLToPath(import.meta.url));
// 作品存哪：默认 ~/Casting Projects，用 CAST_WORK 改到你自己的地方
//（想放移动硬盘、放 NAS、放同步盘都行）。目录不可用时就明说，绝不偷偷改存别处。
const WORK_ROOT = process.env.CAST_WORK || path.join(os.homedir(), 'Casting Projects');
const WORK = WORK_ROOT;
const WEB = path.join(HERE, 'web');
const PORT = Number(process.env.CAST_PORT || 7870);

// —— 三条后端的地址与路径，都能用环境变量改 ——
const TTS = process.env.CAST_TTS || 'http://127.0.0.1:3910';
const CASTER = process.env.CAST_CASTER || 'http://127.0.0.1:7861';
const CASTER_ROOT = process.env.CAST_CASTER_ROOT || path.join(os.homedir(), 'AI-Studio');
const CASTER_PY = process.env.CAST_CASTER_PY
  || path.join(CASTER_ROOT, 'stable-audio-3/optimized/mlx/.venv/bin/python');
const VOICECASTER = process.env.CAST_VOICECASTER || 'http://127.0.0.1:7864';
// VoiceCaster 的家目录：角色卡的定妆音频在它下面（characters/<id>.wav）。
// 只读它的数据，不放一份副本 —— 两边同步的铁律（ROADMAP「两边同步」）。
const VOICE_ROOT = process.env.CAST_VOICE_ROOT || path.join(HERE, '..', 'voicecaster');
const MIR_ROOT = process.env.CAST_MIR || path.join(HERE, '..', 'my-songwriter');
// MIR 的谱面小工具（贴词、分句、谱号、分谱、段落）与 ABC→MusicXML 转换器。
// 一律**直接调它的脚本**，不在这里重写规则 —— 两边同步的铁律。
const MIR_SCRIPTS = path.join(MIR_ROOT, 'scripts');
const ABC2XML = process.env.CAST_ABC2XML
  || path.join(MIR_ROOT, '..', 'yue2-local', 'tools', 'abc2xml', 'abc2xml_268', 'abc2xml.py');
// MIR Studio（原「谱面工作室」）：改谱、看简谱、打 PDF 的本机网页（127.0.0.1:8808）。
// 用户 2026-11-15 定的边界：**谱子上的歌词不用管，就是打开 MIR Studio** ——
// 所以创作台不自己画谱、不改谱，只负责把谱送进去、把页面打开。
const MI_STUDIO_ROOT = process.env.CAST_MI_STUDIO || path.join(HERE, '..', 'mi-studio');
const MI_STUDIO = process.env.CAST_MI_STUDIO_URL || 'http://127.0.0.1:8808';
// 跨语种：VoiceStudio（OmniVoice，646 语种）的本地服务。拿角色卡里的参考录音
// 喂给它，中文音色能去说英/日/西/阿 —— 这就是 VoiceCaster SPEC 4.5 那条
// 「零训练跨语种」，它自己没接，创作台直接接引擎。
const VOICESTUDIO = process.env.CAST_VOICESTUDIO || 'http://127.0.0.1:3900';
// 音频转谱（SheetSage2）语义服务，常驻 8001；权重没装好时它自己会明说。
const SHEETSAGE = process.env.CAST_SHEETSAGE || 'http://127.0.0.1:8001';
// 换嗓子的引擎（Seed-VC）单独装，模型约 2.3G，用 CAST_SEEDVC 指过去。
const SEEDVC = process.env.CAST_SEEDVC || path.join(os.homedir(), 'AI-Studio', 'seed-vc');
// 8 个情绪标签：真源是 VoiceCaster（界面里那排下拉）；这里只是它不在时的兜底，
// 免得创作台因为老家没开就完全不给选。
const EMOTIONS_FALLBACK = [
  '平静地说', '高兴地说', '难过地说，声音有点低', '有点生气地说',
  '害怕地说，声音发抖', '惊讶地说', '温柔地说', '很累地说，声音没力气',
];
// 解析 pptx 要用 python-pptx；优先用 DSH 自带那套 python（带 python-pptx），
// 没有就退回系统 python3（那时嵌课件会报"读不到 pptunit"）。
const PY = process.env.CAST_PY
  || [path.join(os.homedir(), '.dsh/dsh-runtimes/dsh-primary-runtime/dependencies/python/bin/python3'), 'python3']
    .find((q) => q === 'python3' || existsSync(q));
const FFMPEG = process.env.CAST_FFMPEG || '/opt/homebrew/bin/ffmpeg';
const FFPROBE = process.env.CAST_FFPROBE || '/opt/homebrew/bin/ffprobe';

// ────────────────────────────── 小工具 ──────────────────────────────

const now = () => new Date().toISOString();
const rid = (n = 8) => crypto.randomBytes(n).toString('hex').slice(0, n);
const slug = (s) => String(s || '').trim().replace(/[\\/:*?"<>|\s]+/g, '-').slice(0, 60) || 'piece';

async function jget(url, timeoutMs = 5000) {
  const ctl = AbortSignal.timeout(timeoutMs);
  const r = await fetch(url, { signal: ctl });
  if (!r.ok) throw new Error(`${url} → ${r.status}`);
  return r.json();
}

async function jpost(url, body, timeoutMs = 900000) {
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  });
  const text = await r.text();
  let data;
  try { data = JSON.parse(text); } catch { data = { raw: text }; }
  if (!r.ok) throw new Error(data.error || data.detail || `HTTP ${r.status}`);
  return data;
}

function run(cmd, args, { timeoutMs = 600000, cwd } = {}) {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { cwd, stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '', err = '';
    let settled = false;
    const finish = (fn) => { if (settled) return; settled = true; clearTimeout(t); fn(); };
    const bad = (code) => new Error(`${cmd} 退出码 ${code}：${err.slice(-400)}`);
    p.stdout.on('data', (d) => { out += d; });
    p.stderr.on('data', (d) => { err += d; });
    const t = setTimeout(() => { p.kill('SIGKILL'); finish(() => reject(new Error(`${cmd} 超时`))); }, timeoutMs);
    p.on('error', (e) => finish(() => reject(e)));
    p.on('close', (code) => finish(() => (code === 0 ? resolve(out) : reject(bad(code)))));
    // ⭐ 兜底：进程真退出了就交卷，不再等管道关干净。
    // 有些外部脚本会把一个孙进程留在后台攥着 stdout/stderr，于是 'close' 永远不来 ——
    // 2026-11-14 慢档主题歌就卡在这：进度已经到了「出好了 44 秒」，任务却永远不结束。
    p.on('exit', (code) => {
      setTimeout(() => finish(() => (code === 0 ? resolve(out) : reject(bad(code)))), 800);
    });
  });
}

async function mediaDuration(file) {
  try {
    const out = await run(FFPROBE, ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file], { timeoutMs: 20000 });
    return Math.round(Number(out.trim()) * 100) / 100;
  } catch { return 0; }
}

// ────────────────────────────── 项目存储 ──────────────────────────────

const diskOk = () => existsSync(path.dirname(WORK_ROOT));
const DISK_MSG = '作品目录不可用 —— 看看 CAST_WORK 指的路径在不在';

const projectDir = (id) => path.join(WORK, slug(id));
const projectFile = (id) => path.join(projectDir(id), 'project.json');

async function readProject(id) {
  const p = projectFile(id);
  if (!existsSync(p)) return null;
  return JSON.parse(await fs.readFile(p, 'utf8'));
}

async function writeProject(proj) {
  proj.updatedAt = now();
  await fs.mkdir(projectDir(proj.id), { recursive: true });
  await fs.writeFile(projectFile(proj.id), JSON.stringify(proj, null, 2), 'utf8');
  return proj;
}

async function listProjects() {
  if (!existsSync(WORK)) return [];
  const out = [];
  for (const name of await fs.readdir(WORK)) {
    const p = path.join(WORK, name, 'project.json');
    if (!existsSync(p)) continue;
    try {
      const j = JSON.parse(await fs.readFile(p, 'utf8'));
      out.push({
        id: j.id, name: j.name, kind: j.kind, updatedAt: j.updatedAt,
        scenes: (j.scenes || []).length,
        renders: (j.renders || []).length,
        cover: j.cover || (j.scenes || []).find((s) => s.image)?.image || null,
      });
    } catch { /* 坏文件跳过 */ }
  }
  out.sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
  return out;
}

// 新项目的骨架：四个板块共用同一套骨架，差别只在 scene 里多哪些字段。
async function createProject({ name, kind = 'slide', brief = '' }) {
  const id = `${Date.now().toString(36)}-${rid(4)}`;
  const proj = {
    id, name: name || '未命名作品', kind,
    createdAt: now(), updatedAt: now(),
    brief,
    theme: { songPrompt: '', style: 'scene', palette: '', title: '', subtitle: '' },
    characters: [],
    scenes: [],
    renders: [],
  };
  await fs.mkdir(path.join(projectDir(id), 'assets'), { recursive: true });
  await fs.mkdir(path.join(projectDir(id), 'out'), { recursive: true });
  return writeProject(proj);
}

// ────────────────────────────── 串行队列 ──────────────────────────────

const queue = [];
const jobs = new Map();
let running = null;         // 当前在跑的任务 id
let runnerBusy = false;

function pushJob(type, params, projectId) {
  const id = rid(10);
  const job = {
    id, type, params, projectId: projectId || null,
    status: 'queued', progress: 0, message: '排队中',
    createdAt: now(), startedAt: null, endedAt: null, result: null, error: null,
  };
  jobs.set(id, job);
  queue.push(id);
  kick();
  return job;
}

function publicJob(j) {
  if (!j) return null;
  const ahead = j.status === 'queued' ? queue.indexOf(j.id) : 0;
  return { ...j, ahead };
}

function kick() {
  if (runnerBusy) return;
  runnerBusy = true;
  (async () => {
    try {
      while (queue.length) {
        const id = queue.shift();
        const job = jobs.get(id);
        if (!job) continue;
        running = id;
        job.status = 'running';
        job.startedAt = now();
        try {
          job.result = await execute(job);
          job.status = 'done';
          job.progress = 1;
          job.message = '完成';
        } catch (e) {
          job.status = 'error';
          job.error = String(e.message || e);
          job.message = '出错';
        } finally {
          job.endedAt = now();
          running = null;
        }
      }
    } finally {
      runnerBusy = false;
    }
  })();
}

async function execute(job) {
  const { type, params } = job;
  const proj = job.projectId ? await readProject(job.projectId) : null;
  if (job.projectId && !proj) throw new Error('项目不见了');

  switch (type) {
    case 'tts': return doTTS(job, proj, params);
    case 'music': return doAudio(job, proj, 'music', params);
    case 'sfx': return doAudio(job, proj, 'fx', params);
    case 'image': return doImage(job, proj, params);
    case 'song': return doSong(job, proj, params);
    case 'voice_convert': return doVoiceConvert(job, proj, params);
    case 'transcribe': return doTranscribe(job, proj, params);
    case 'score': return doScore(job, proj, params);
    case 'analyze': return doAnalyze(job, proj, params);
    case 'handoff': return doHandoff(job, proj, params);
    case 'audiotrack': return doAudioTrack(job, proj, params);
    case 'deck_track': return doDeckTrack(job, proj, params);
    case 'embed_deck': return doEmbedDeck(job, proj, params);
    case 'export_package': return doExportPackage(job, proj, params);
    case 'crosslingual': return doCrosslingual(job, proj, params);
    case 'render': return doRender(job, proj, params);
    default: throw new Error(`不认识的任务类型：${type}`);
  }
}

// —— 念之前先修一遍术语读音 ——
// 规则在 VoiceCaster 的 pptunit/glossary.py（那边实测过），这里只调它。
// 术语表坏了也不许拦住念白：拿不到就原样念。
async function sayFix(text) {
  const tool = path.join(HERE, 'tools', 'say-fix.py');
  if (!existsSync(tool)) return { ok: false, text, hits: [], why: '没有术语修正脚本' };
  try {
    const r = await runCapture(PY, [tool, text], 30000);
    const last = (r.out || '').trim().split('\n').filter(Boolean).pop() || '';
    return JSON.parse(last);
  } catch { return { ok: false, text, hits: [], why: '术语修正没回话' }; }
}

// —— 念台词 ——
// 两条嗓子：
//   ① 有 character（VoiceCaster 角色卡编号）→ 让那张卡念。里面就有用户自己的克隆声。
//      它自己决定用哪个引擎（大多走千问，所以速度还是两三秒；戏骨那类要等）。
//   ② 没有 → 千问官方那九个声音（原样，没变）。
async function doTTS(job, proj, p) {
  const raw = String(p.text || '').trim();
  if (!raw) throw new Error('没有要念的字');

  job.message = '先看一遍术语…';
  job.progress = 0.08;
  const fixed = await sayFix(raw);
  const text = (fixed && fixed.ok && fixed.text) ? fixed.text : raw;
  const terms = (fixed && fixed.hits) || [];

  const voice = p.voice || 'vivian';
  const emotion = String(p.emotion || '').trim();     // 8 个情绪标签之一
  const instruct = String(p.instruct || '').trim();
  const dir = projectDir(proj.id);
  const rel = path.join('assets', `${p.tag || 'vo'}-${rid(4)}.wav`);
  const outFile = path.join(dir, rel);

  let engine = 'qwen';
  let who = '千问';
  if (p.character) {
    // 那个临时 wav 按角色号固定命名、会被下一句覆盖 —— 拿到立刻下载。
    const cid = String(p.character).replace(/[^0-9]/g, '');
    if (!cid) throw new Error('角色编号不对');
    job.message = '让 VoiceCaster 念…';
    job.progress = 0.25;
    const r = await jpost(`${VOICECASTER}/api/characters/${cid}/say`, { text, emotion }, 1800000);
    if (!r || !r.url) throw new Error('VoiceCaster 念完没给音频地址');
    const w = await fetch(`${VOICECASTER}${r.url}`, { signal: AbortSignal.timeout(180000) });
    if (!w.ok) throw new Error(`取不到念好的音频（${w.status}）`);
    await fs.writeFile(outFile, Buffer.from(await w.arrayBuffer()));
    engine = r.engine || 'voicecaster';
    who = engine === 'indextts' ? '戏骨' : engine === 'voxcpm' ? 'Vox'
      : engine === 'omnivoice' ? '小米' : '千问';
  } else {
    const body = { text, voice, lang: p.lang || 'zh', speed: Number(p.speed || 1) };
    const perf = [emotion, instruct].filter(Boolean).join('，');
    if (perf) body.instruct = perf;
    job.message = `念：${text.slice(0, 18)}…`;
    job.progress = 0.2;
    const r = await fetch(`${TTS}/tts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(900000),
    });
    if (!r.ok) throw new Error(`TTS 服务 ${r.status}：${(await r.text()).slice(0, 200)}`);
    await fs.writeFile(outFile, Buffer.from(await r.arrayBuffer()));
  }

  job.progress = 0.9;
  return {
    file: rel.replace(/\\/g, '/'), seconds: await mediaDuration(outFile),
    voice: p.character ? `角色 ${p.character}` : voice,
    engine, who, character: p.character || null, emotion,
    terms, text,
  };
}

// —— 配乐 / 音效：Crafting Caster（7861）——
async function doAudio(job, proj, mode, p) {
  // 音效往往就是一两秒（开门、脚步），所以下限放低；配乐仍然要几秒才成立
  const floor = mode === 'fx' ? 1 : 5;
  const seconds = Math.max(floor, Math.min(mode === 'fx' ? 120 : 380, Number(p.seconds || 20)));
  job.message = mode === 'fx' ? '做音效…' : '做配乐…';
  job.progress = 0.1;

  await ensureCaster();
  const data = await jpost(`${CASTER}/api/generate`, {
    prompt: p.prompt || '', mode, seconds, seed: p.seed,
  }, 900000);

  const src = path.join(CASTER_ROOT, 'output', 'studio', data.file);
  const rel = path.join('assets', `${mode}-${rid(4)}.wav`);
  await fs.mkdir(path.join(projectDir(proj.id), 'assets'), { recursive: true });
  await fs.copyFile(src, path.join(projectDir(proj.id), rel));
  job.progress = 0.95;

  const outRel = rel.replace(/\\/g, '/');
  // 记进项目：配乐 / 音效各留最近一条当「底板」，接音轨时自动铺上；
  // 标了 asSong 的（主题歌快档）统一进歌曲列表，和慢档放在一起。
  const fresh = await readProject(proj.id);
  fresh.theme = fresh.theme || {};
  if (mode === 'music' && p.asSong) {
    fresh.theme.songs = [
      ...(fresh.theme.songs || []),
      {
        file: outRel, seconds: data.seconds, title: p.title || proj.name,
        prompt: p.prompt || '', lyrics: '', engine: 'caster（快档·纯音乐）', at: now(),
      },
    ];
  } else {
    fresh.theme[mode === 'fx' ? 'sfx' : 'music'] = {
      file: outRel, seconds: data.seconds, prompt: p.prompt || '', at: now(),
    };
  }
  await writeProject(fresh);

  return {
    file: outRel,
    seconds: data.seconds, elapsed: data.elapsed,
    promptUsed: data.prompt_used, seed: data.seed ?? p.seed ?? null,
  };
}

// —— 出图：Crafting Caster（7861 → 7862）——
async function doImage(job, proj, p) {
  const style = p.style || 'scene';
  const size = p.size || 'preview';
  job.message = '画图…';
  job.progress = 0.1;

  await ensureCaster();
  const body = { prompt: p.prompt || '', style, size, seed: p.seed };
  // 角色包（LoRA）：名字由画室按模型目录里的真实文件校验，这里只管透传
  if (p.lora) {
    body.lora = p.lora;
    if (p.loraWeight !== undefined && p.loraWeight !== null) body.lora_weight = p.loraWeight;
  }
  const data = await jpost(`${CASTER}/api/draw`, body, 1800000);

  const src = path.join(CASTER_ROOT, 'output', 'images', data.file);
  const rel = path.join('assets', `img-${rid(4)}.png`);
  await fs.mkdir(path.join(projectDir(proj.id), 'assets'), { recursive: true });
  await fs.copyFile(src, path.join(projectDir(proj.id), rel));
  job.progress = 0.95;
  return {
    file: rel.replace(/\\/g, '/'),
    px: data.size, steps: data.steps, elapsed: data.elapsed,
    promptUsed: data.prompt_used, seed: data.seed ?? null,
    lora: data.lora ?? null,
  };
}

// —— 主题歌（带词）：MIR 的适配器 —— 慢，几分钟到十分钟 ——
//
// ★ 2026-11-14 重写。上一版有两个坑，都是真踩到的：
//   ① 产物目录直接就是 `assets/`，几首歌和配乐、台词全扔在一起，
//      取产物只能按「谁最新」挑 —— 于是常常把刚做的配乐当成刚出的歌；
//   ② 只认 wav/mp3/m4a，**而 MIR 出的是 .flac** —— 慢档永远挑不到东西，
//      返回一个空的文件路径，界面看上去像"跑完了但什么都没有"。
//   现在：每首歌一个独立目录，产物以 progress.json 里写的路径为准，再转成 wav。
async function doSong(job, proj, p) {
  // 用哪一台引擎：界面挑，没挑就 YuE2（唯一能「照谱唱」的成品引擎）。
  // 用户 2026-11-15：「不要 ACE-Step」—— 它的权重 10 月就拆了，这里连映射都不留，
  // 免得有人从接口上点一个必然失败的东西。
  const ENGINES = {
    yue2: 'yue2_adapter.sh',            // 先写谱再照谱唱：flac + abc + MusicXML（慢，成品）
    heartmula: 'heartmula_adapter.sh',  // 人声/词草稿机：旋律不差、人声干净、伴奏不够打
  };
  const engineKey = String(p.engine || 'yue2');
  const scriptName = ENGINES[engineKey];
  if (!scriptName) throw new Error(`不认识这台出歌引擎：${engineKey}（只有 yue2 / heartmula）`);
  const found = path.join(MIR_ROOT, scriptName);
  if (!existsSync(found)) throw new Error(`这台引擎的脚本不在：${found}`);

  const dir = projectDir(proj.id);
  const runDir = path.join(dir, 'assets', `song-${rid(6)}`);
  await fs.mkdir(runDir, { recursive: true });
  const paramsFile = path.join(runDir, 'params.json');
  const progressFile = path.join(runDir, 'progress.json');

  // 参数键照适配器认识的来：它读 prompt / lyrics / title / seed / steps / bpm。
  // ⚠️ YuE2 **不认 duration**（曲子长度由谱子决定），别塞给它；
  //    HeartMuLa / ACE-Step 才吃 duration（秒），而且是"上限"。
  const style = String(p.prompt || proj.theme?.songPrompt || '').trim();
  const lyrics = String(p.lyrics || '').trim() || '[Instrumental]';
  const title = String(p.title || proj.theme?.title || proj.name || '').trim();
  const params = { prompt: style, lyrics, title, seed: p.seed ?? -1 };
  if (p.bpm) params.bpm = String(p.bpm);
  if (p.steps) params.steps = Number(p.steps);
  if (engineKey !== 'yue2' && p.duration) params.duration = Number(p.duration);
  await fs.writeFile(paramsFile, JSON.stringify(params, null, 2), 'utf8');

  job.message = '写歌中（这条最慢，几分钟起）';
  job.progress = 0.03;
  const readProgress = async () => {
    try { return JSON.parse(await fs.readFile(progressFile, 'utf8')); } catch { return null; }
  };
  let watching = true;
  const watcher = setInterval(async () => {
    const pr = await readProgress();
    if (!watching || !pr || typeof pr.percent !== 'number') return;   // 收尾了就别再改写进度
    job.progress = Math.max(0.03, Math.min(0.95, pr.percent / 100));
    if (pr.message) job.message = `写歌中：${pr.message}`;
  }, 3000);

  try {
    await run('bash', [found, '--params', paramsFile, '--out-dir', runDir, '--progress', progressFile],
      { timeoutMs: 1800000, cwd: MIR_ROOT });
  } catch (e) {
    // 脚本自己会把原因写成人话（"要插上电源才能跑"这种），优先用它的说法
    const pr = await readProgress();
    if (pr?.message && pr.state === 'failed') throw new Error(`${pr.message}${pr.detail ? `（${pr.detail}）` : ''}`);
    throw e;
  } finally {
    watching = false;
    clearInterval(watcher);
  }

  const pr = await readProgress();
  if (pr?.state === 'failed') throw new Error(`${pr.message || 'MIR 说失败，但没写原因'}`);

  // 产物：以进度文件写的路径为准；没有就只在这一趟的目录里找（绝不碰 assets 里别的东西）
  let produced = pr?.output && existsSync(pr.output) ? pr.output : await findAudio(runDir);
  if (!produced) throw new Error(`MIR 跑完了，但没找到音频（看 ${runDir}）`);

  job.message = '把歌收进来…';
  job.progress = 0.96;
  const outRel = path.join('assets', `song-${rid(4)}.wav`);
  const outFile = path.join(dir, outRel);
  await run(FFMPEG, ['-y', '-v', 'error', '-i', produced, '-ac', '2', '-ar', '48000', outFile],
    { timeoutMs: 600000 });
  const seconds = await mediaDuration(outFile);

  // 顺带把谱子（.abc）也收进来：想拿进 ACE 或 Dorico 时用得上
  let score = null;
  if (pr?.score && existsSync(pr.score)) {
    const sRel = path.join('assets', `song-${rid(4)}.abc`);
    try { await fs.copyFile(pr.score, path.join(dir, sRel)); score = sRel.replace(/\\/g, '/'); } catch { /* 谱子丢不影响歌 */ }
  }

  // 记进项目：以后要试听、要重挑都不用车界面翻文件
  const fresh = await readProject(proj.id);
  fresh.theme = fresh.theme || {};
  fresh.theme.songs = [
    ...(fresh.theme.songs || []),
    {
      file: outRel.replace(/\\/g, '/'), seconds, score,
      title, prompt: style, lyrics: p.lyrics || '', engine: path.basename(found),
      at: now(),
    },
  ];
  await writeProject(fresh);
  job.progress = 1;
  return {
    file: outRel.replace(/\\/g, '/'), seconds, score,
    engine: path.basename(found), note: '主题歌已出',
  };
}

// —— 换嗓子（MIR 的 voice_convert_adapter.sh）——
// 它做三格：Demucs 拆成人声/伴奏 → Seed-VC 按参考录音换声 → 合回伴奏。
// ★ 这个脚本**不吃 --out-dir**：输出目录从 params.json 的 out_dir 读
//   （ROADMAP「已经核实过的差异」记过），别照抄 doSong 的调用写法。
async function doVoiceConvert(job, proj, p) {
  const dir = projectDir(proj.id);
  const src = resolveAsset(proj, p.source);
  if (!src) throw new Error('先选一首歌，或一段要换嗓子的人声');
  if (!existsSync(src)) throw new Error(`找不到这段音频：${src}`);

  // 换成谁的嗓子：① 角色库里的现成声音 ② 自己上传的一段录音
  let target = '';
  if (p.targetChar) {
    const cid = String(p.targetChar).replace(/[^0-9]/g, '');
    const cardFile = path.join(VOICE_ROOT, 'characters', `${cid}.json`);
    if (!existsSync(cardFile)) throw new Error('角色库里没有这个声音');
    const card = JSON.parse(await fs.readFile(cardFile, 'utf8'));
    if (!card.ref) throw new Error('这个角色没有定妆录音，换不了嗓子（官方音色只带一个代号）');
    target = path.join(VOICE_ROOT, 'characters', card.ref);
    if (!existsSync(target)) throw new Error('这个角色的定妆录音不见了');
  } else if (p.targetFile) {
    target = resolveAsset(proj, p.targetFile);
    if (!target || !existsSync(target)) throw new Error('找不到那段目标录音');
  }
  if (!target) throw new Error('还没选换成的嗓子');

  if (!existsSync(path.join(SEEDVC, '.venv', 'bin', 'python'))) {
    throw new Error(`换嗓子的引擎不在：${SEEDVC}（看 CAST_SEEDVC 指的路径）`);
  }
  const adapter = path.join(MIR_ROOT, 'voice_convert_adapter.sh');
  if (!existsSync(adapter)) throw new Error(`MIR 的换嗓子脚本不见了：${adapter}`);

  const runDir = path.join(dir, 'assets', `swap-${rid(6)}`);
  await fs.mkdir(runDir, { recursive: true });
  const paramsFile = path.join(runDir, 'params.json');
  const progressFile = path.join(runDir, 'progress.json');
  const params = {
    source: src, target, out_dir: runDir,
    title: String(p.title || proj.name || '').trim(),
  };
  if (p.targetClean) params.target_clean = true;
  await fs.writeFile(paramsFile, JSON.stringify(params, null, 2), 'utf8');

  job.message = '换嗓子中（先拆人声和伴奏，几分钟起）';
  job.progress = 0.03;
  let watching = true;
  const watcher = setInterval(async () => {
    try {
      const pr = JSON.parse(await fs.readFile(progressFile, 'utf8'));
      if (!watching || typeof pr.percent !== 'number') return;
      job.progress = Math.max(0.03, Math.min(0.95, pr.percent / 100));
      if (pr.message) job.message = `换嗓子：${pr.message}`;
    } catch { /* 还没写出来 */ }
  }, 3000);

  try {
    await run('bash', [adapter, '--params', paramsFile, '--progress', progressFile],
      { timeoutMs: 3600000, cwd: MIR_ROOT });
  } catch (e) {
    let pr = null;
    try { pr = JSON.parse(await fs.readFile(progressFile, 'utf8')); } catch { /* 没写 */ }
    if (pr && pr.state === 'failed') {
      throw new Error(`${pr.message || '换嗓子失败'}${pr.detail ? `（${pr.detail}）` : ''}`);
    }
    throw e;
  } finally { watching = false; clearInterval(watcher); }

  const produced = await findAudio(runDir);
  if (!produced) throw new Error(`换嗓子跑完了，但没找到产物（看 ${runDir}）`);

  job.message = '收进作品…';
  job.progress = 0.96;
  const outRel = path.join('assets', `swap-${rid(4)}.wav`);
  const outFile = path.join(dir, outRel);
  await run(FFMPEG, ['-y', '-v', 'error', '-i', produced, '-ac', '2', '-ar', '48000', outFile],
    { timeoutMs: 600000 });
  const seconds = await mediaDuration(outFile);

  const fresh = await readProject(proj.id);
  fresh.swaps = [...(fresh.swaps || []), {
    file: outRel.replace(/\\/g, '/'), seconds,
    from: path.basename(src),
    target: p.targetChar ? `角色 ${p.targetChar}` : path.basename(target),
    at: now(),
  }];
  await writeProject(fresh);
  job.progress = 1;
  return { file: outRel.replace(/\\/g, '/'), seconds, note: '换嗓子好了' };
}

// —— 音频转谱（MIR 的 SheetSage2 服务，8001）——
// 它只肯读 ~/inspiration-assistant 里面的文件：后台服务读不了受保护目录，
// 实测同一请求走路径要 177 秒、走 base64 只要 0.035 秒。所以先把音频投进它的
// 收件箱，再让它读 —— 不为它改系统权限，也不在这里重写转谱逻辑。
async function doTranscribe(job, proj, p) {
  const src = resolveAsset(proj, p.source);
  if (!src || !existsSync(src)) throw new Error('先选一段录音');

  const inbox = path.join(os.homedir(), 'inspiration-assistant', 'abc-cache', 'inbox');
  await fs.mkdir(inbox, { recursive: true });
  const staged = path.join(inbox, `${p.tag || 'take'}-${rid(8)}${path.extname(src) || '.wav'}`);
  await fs.copyFile(src, staged);

  job.message = '让转谱引擎听这段录音（第一次跑要装模型，慢）';
  job.progress = 0.12;
  const r = await fetch(`${SHEETSAGE}/transcribe`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      audio_path: staged,
      task: ['full', 'melody-full', 'melody-vocal'].includes(p.task) ? p.task : 'melody-full',
    }),
    signal: AbortSignal.timeout(3700000),
  });
  const txt = await r.text();
  let data = {};
  try { data = JSON.parse(txt); } catch { /* 下面统一报 */ }
  if (!r.ok || data.ok === false) {
    const h = data.error;
    const msg = (h && (h.human || h.code)) || data.status_text || txt.slice(0, 300) || `HTTP ${r.status}`;
    if (h && h.code === 'weights_missing') {
      throw new Error('转谱引擎的模型还没装上（2.8G，第一次用要先下）');
    }
    throw new Error(`转谱失败：${msg}`);
  }

  // 谱子：服务给的是 ABC 文本。存一份到作品里，界面也能直接看。
  const abc = (data.outputs && (data.outputs.melody_abc || data.outputs.repaired_abc)) || '';
  if (!abc.trim()) throw new Error('转谱跑完了，但没有谱子');
  const rel = path.join('assets', `score-${rid(4)}.abc`);
  await fs.writeFile(path.join(projectDir(proj.id), rel), abc, 'utf8');

  const fresh = await readProject(proj.id);
  fresh.scores = [...(fresh.scores || []), {
    file: rel.replace(/\\/g, '/'), from: path.basename(src),
    bars: data.bar_count || 0, at: now(),
  }];
  await writeProject(fresh);
  job.progress = 1;
  return {
    file: rel.replace(/\\/g, '/'), abc,
    bars: data.bar_count || 0, note: '谱子出来了（先听一遍再信它）',
  };
}

// —— 谱子：ABC → MusicXML，再按需收拾 ——
// 用户 2026-11-15：「MIR 的功能都要接进创作台，主要是出歌和出谱子。」
// 紧接着又定了两条边界：① **谱子上的歌词不要管**；② **歌词不要出现在谱子上**。
// 所以这里出谱时会把 ABC 里的 `w:` 歌词行剥掉再转 —— 谱面只有音符，没有词。
// （送 ACE 那条路不剥：唱轨要词才能唱，那里是另一件事。）
// ★ 一律调 MIR 的脚本（`my-songwriter/scripts/*.py`），不在这儿重写规则。
async function abcToXml(abcPath, outDir) {
  if (!existsSync(ABC2XML)) throw new Error(`ABC → MusicXML 的转换器不在：${ABC2XML}`);
  await fs.mkdir(outDir, { recursive: true });
  await run(PY, [ABC2XML, abcPath, '-o', outDir], { timeoutMs: 120000 });
  const want = path.join(outDir, path.basename(abcPath).replace(/\.abc$/i, '.xml'));
  if (existsSync(want)) return want;
  // 兜底：它偶尔会因为谱头字段换个文件名，那就取目录里最新那份
  const xmls = (await fs.readdir(outDir)).filter((f) => /\.xml$/i.test(f));
  if (!xmls.length) throw new Error('转换器跑完了，但没留下 MusicXML');
  return path.join(outDir, xmls[xmls.length - 1]);
}

async function doScore(job, proj, p) {
  const src = resolveAsset(proj, p.file);
  if (!src || !existsSync(src)) throw new Error('先挑一份谱子（.abc）');
  if (!/\.abc$/i.test(src)) throw new Error('这份不是 .abc 谱 —— 谱面工具只吃 ABC 做源头');

  const ops = Array.isArray(p.ops) && p.ops.length ? p.ops.map(String) : ['convert'];
  const dir = projectDir(proj.id);
  const tag = rid(4);
  const runDir = path.join(dir, 'assets', `tidy-${rid(6)}`);
  await fs.mkdir(runDir, { recursive: true });

  // ⓪ 先把歌词行剥掉（用户 2026-11-15：「歌词不要出现在谱子上」）。
  //    ABC 用一个 `w:` 行挂一句词，abc2xml 会把它转成 MusicXML 的 <lyric>；
  //    在**工作副本**上删掉这些行，原谱一个字不动。
  const abcWork = path.join(runDir, path.basename(src));
  const rawAbc = await fs.readFile(src, 'utf8');
  const noLyrics = rawAbc
    .split('\n')
    .filter((ln) => !/^\s*w:/.test(ln))
    .join('\n');
  await fs.writeFile(abcWork, noLyrics, 'utf8');
  const stripped = noLyrics !== rawAbc;

  // ① ABC → MusicXML（一切谱面工具都吃它；Dorico / MuseScore / ACE 也吃）
  job.message = '把谱子翻成 MusicXML…';
  job.progress = 0.3;
  const xmlPath = await abcToXml(abcWork, path.join(runDir, 'xml'));

  // ② 谱号自修正（YuE2 的谱几乎一律写高音谱号，男声会满屏加线）
  let clefNote = '';
  if (ops.includes('clef')) {
    job.message = '按音域挑谱号…';
    job.progress = 0.45;
    const args = [path.join(MIR_SCRIPTS, 'fix_score_clef.py'), xmlPath];
    if (p.style) args.push('--prompt', String(p.style));
    const r = await runCapture(PY, args, 60000);
    clefNote = (r.out || r.err || '').trim().split('\n').filter(Boolean).pop() || '';
    if (r.code !== 0) throw new Error(`谱号修正失败：${clefNote.slice(-300)}`);
  }

  // ③ 分谱：唱的一条、其余的（伴奏/和声）各一份
  let parts = null;
  if (ops.includes('split')) {
    job.message = '按声部拆谱…';
    job.progress = 0.7;
    const partsDir = path.join(runDir, 'parts');
    const r = await runCapture(PY, [path.join(MIR_SCRIPTS, 'split_score_parts.py'), xmlPath, partsDir], 120000);
    const last = (r.out || '').trim().split('\n').filter(Boolean).pop() || '';
    try { parts = JSON.parse(last); } catch { parts = null; }
    if (!parts) throw new Error(`拆谱失败：${(r.err || last).slice(-300)}`);
  }

  // ④ 收进作品（主谱 / 唱的那条 / 其余的）
  job.message = '收进作品…';
  job.progress = 0.88;
  const rel = (f) => f ? f.replace(/\\/g, '/') : null;
  const keep = async (from, suffix) => {
    if (!from || !existsSync(from)) return null;
    const r = path.join('assets', `tidy-${tag}${suffix}`);
    await fs.copyFile(from, path.join(dir, r));
    return rel(r);
  };
  const xmlOut = await keep(xmlPath, '.musicxml');
  const vocalOut = parts?.vocal ? await keep(parts.vocal, '.vocal.musicxml') : null;
  const othersOut = parts?.others ? await keep(parts.others, '.others.musicxml') : null;

  const fresh = await readProject(proj.id);
  fresh.scores = [...(fresh.scores || []), {
    file: xmlOut, kind: 'tidy', from: path.basename(src),
    vocal: vocalOut, others: othersOut,
    ops, clef: clefNote, lyricsStripped: stripped, at: now(),
  }];
  await writeProject(fresh);
  job.progress = 1;
  return {
    file: xmlOut, vocal: vocalOut, others: othersOut,
    ops, clef: clefNote, lyricsStripped: stripped,
    vocalName: parts?.vocalName || '', otherNames: parts?.otherNames || [],
    note: stripped ? '谱子出来了（已去掉歌词）' : '谱子出来了',
  };
}

// —— 量：速度（BPM）与响度 ——
// 「量归我、判断归人」在系统里落成两块：这里只**量**，翻成人话交给界面。
// BPM 用 MIR 的 detect_bpm.py（它自己认 --min/--max，八度歧义要靠范围收），
// 响度用 ffmpeg 的 ebur128 —— 都是现成的，不另写算法。
async function doAnalyze(job, proj, p) {
  const src = resolveAsset(proj, p.source);
  if (!src || !existsSync(src)) throw new Error('先挑一段音频来量');

  job.message = '量速度…';
  job.progress = 0.25;
  const lo = Number(p.minBpm) || 60;
  const hi = Number(p.maxBpm) || 200;
  const detectBpm = async (a, b) => {
    const r = await runCapture(PY, [path.join(MIR_SCRIPTS, 'detect_bpm.py'), src,
      '--min', String(a), '--max', String(b)], 240000);
    if (r.code !== 0) {
      return { value: null, why: (r.err || r.out || '').trim().split('\n').filter(Boolean).pop() || `退出码 ${r.code}` };
    }
    const v = Number((r.out || '').trim().split('\n').filter(Boolean).pop());
    return { value: Number.isFinite(v) && v > 0 ? Math.round(v * 10) / 10 : null, why: '' };
  };
  let { value: bpm, why: bpmWhy } = await detectBpm(lo, hi);
  // 自相关会把拍子认成两倍（实测：谱子写 73，它报 143.6）。
  // 报得快时用窄范围再量一次；两次对得上（×2）就以慢的那个为准，快的留作旁证。
  let bpmAlt = null;
  if (bpm && bpm > 110 && hi > 110) {
    job.message = '速度像是算快了一倍，再量一次…';
    const slow = await detectBpm(55, 110);
    if (slow.value && Math.abs(bpm - slow.value * 2) <= 4) {
      bpmAlt = bpm;
      bpm = slow.value;
    }
  }

  job.message = '量响度…';
  job.progress = 0.7;
  const l = await runCapture(FFMPEG, ['-hide_banner', '-nostats', '-i', src,
    '-af', 'ebur128=peak=true', '-f', 'null', '-'], 900000);
  const text = l.err || '';
  // ⚠️ ebur128 会把 summary 打两遍：开头一遍（全是 -70 / 0，还没听）、
  //    结束一遍（真值）。必须取**最后一次**，取第一次会得到 -70 LUFS 这种假数。
  const pickLast = (re) => {
    const g = new RegExp(re.source, 'g');
    let m, last = null;
    while ((m = g.exec(text)) !== null) last = m;
    return last ? Math.round(Number(last[1]) * 10) / 10 : null;
  };
  const lufs = pickLast(/\bI:\s+(-?\d+(?:\.\d+)?)\s*LUFS/);
  const lra = pickLast(/\bLRA:\s+(-?\d+(?:\.\d+)?)\s*LU/);
  const peak = pickLast(/\bPeak:\s+(-?\d+(?:\.\d+)?)\s*dBFS/);
  if (lufs === null) throw new Error(`量不出响度：${(text || l.err).slice(-300)}`);

  const seconds = await mediaDuration(src);
  const fresh = await readProject(proj.id);
  fresh.measures = [...(fresh.measures || []).filter((m) => m.file !== p.source), {
    file: p.source, bpm, bpmAlt, lufs, lra, peak, seconds, range: [lo, hi], at: now(),
  }];
  await writeProject(fresh);
  job.progress = 1;
  return { source: p.source, bpm, bpmAlt, bpmWhy, lufs, lra, peak, seconds, range: [lo, hi] };
}

// —— 送出去精修：MIR 的那四座桥（ACE Studio / Ableton Live）——
// 只负责「把文件交给它自己的脚本」，落轨、换乐器这些进 DAW 里再定；
// 脚本回来的那一行 JSON 是唯一可信的结果（MIR 那边踩过"返回值不可信"的坑）。
async function doHandoff(job, proj, p) {
  const target = String(p.target || '');
  const src = resolveAsset(proj, p.file);
  if (!src || !existsSync(src)) throw new Error('先挑一份要送出去的东西');
  const title = String(p.title || proj.name || '').trim();

  let file = src;
  let what = null;
  if (/\.(wav|flac|mp3|m4a|aiff?)$/i.test(src)) what = 'audio';
  else if (/\.mid$/i.test(src)) what = 'midi';
  else if (/\.(xml|musicxml)$/i.test(src)) what = 'score';
  else if (/\.abc$/i.test(src)) {
    job.message = '先把 ABC 翻成 MusicXML…';
    job.progress = 0.15;
    file = await abcToXml(src, path.join(projectDir(proj.id), 'assets', `send-${rid(6)}`));
    what = 'score';
  } else throw new Error('这几种格式送不出去（音频 / MIDI / MusicXML / ABC）');

  job.message = `送给 ${target === 'live' ? 'Live' : 'ACE Studio'}…`;
  job.progress = 0.5;
  let script, args;
  if (target === 'ace') {
    script = path.join(MIR_SCRIPTS, 'push_to_ace.py');
    args = ['--what', what, '--title', title, file];
  } else if (target === 'live') {
    if (what === 'score') throw new Error('Live 这条线只收音频和 MIDI（谱子请送 ACE）');
    script = path.join(MIR_SCRIPTS, 'push_to_live.py');
    args = what === 'midi' ? ['--midi', file, '--title', title] : ['--audio', file, '--title', title];
  } else throw new Error(`不知道送给谁：${target}`);

  const r = await runCapture(PY, [script, ...args], 900000);
  const last = (r.out || '').trim().split('\n').filter(Boolean).pop() || '';
  let data = null;
  try { data = JSON.parse(last); } catch { /* 下面统一报 */ }
  if (!data || data.ok === false) {
    throw new Error((data && data.message) || (r.err || last || `退出码 ${r.code}`).slice(-300));
  }
  const fresh = await readProject(proj.id);
  fresh.handoffs = [...(fresh.handoffs || []), {
    target, what, file: p.file, title, message: data.message || '已送出', at: now(),
  }];
  await writeProject(fresh);
  job.progress = 1;
  return { target, what, message: data.message || '已送出' };
}

// 项目内的相对路径 → 绝对路径；不许跳出项目目录。
function resolveAsset(proj, rel) {
  const s = String(rel || '').trim();
  if (!s) return null;
  if (path.isAbsolute(s)) return s;
  const dir = path.resolve(projectDir(proj.id));
  const full = path.resolve(dir, s);
  if (!full.startsWith(dir + path.sep)) return null;
  return full;
}

// —— 有声课件：读一份 pptx，把每页要讲的话抽出来 ——
// 只抽讲稿，不碰模型。规则全在 VoiceCaster 的 pptunit 里（备注优先、
// 按位置读正文、拆成一句一句能单独播的课堂口语），那边实测过，不在这儿重写。
function runCapture(cmd, args, timeoutMs = 120000) {
  return new Promise((resolve) => {
    const p = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '', err = '';
    let done = false;
    const fin = (code) => { if (done) return; done = true; clearTimeout(t); resolve({ code, out, err }); };
    p.stdout.on('data', (d) => { out += d; });
    p.stderr.on('data', (d) => { err += d; });
    const t = setTimeout(() => { p.kill('SIGKILL'); fin(-1); }, timeoutMs);
    p.on('error', (e) => { err += String(e.message || e); fin(-1); });
    p.on('close', fin);
    p.on('exit', (code) => setTimeout(() => fin(code), 600));
  });
}

async function extractDeck(pptxPath) {
  const tool = path.join(HERE, 'tools', 'pptx-notes.py');
  if (!existsSync(tool)) throw new Error(`解析脚本不见了：${tool}`);
  const r = await runCapture(PY, [tool, pptxPath]);
  const last = (r.out || '').trim().split('\n').filter(Boolean).pop() || '';
  let pages = null;
  try { pages = JSON.parse(last); } catch { /* 下面统一报 */ }
  if (!pages) {
    throw new Error(`解析不出讲稿（退出码 ${r.code}）：${(r.err || last || r.out).slice(-300)}`);
  }
  if (pages.error) throw new Error(pages.error);
  if (!Array.isArray(pages)) throw new Error('解析结果不对（不是页列表）');
  return pages;
}

// 在某一趟的目录里找音频（递归，忽略隐藏目录）
async function findAudio(root) {
  const hit = [];
  const walk = async (d) => {
    let items = [];
    try { items = await fs.readdir(d, { withFileTypes: true }); } catch { return; }
    for (const it of items) {
      if (it.name.startsWith('.')) continue;
      const full = path.join(d, it.name);
      if (it.isDirectory()) await walk(full);
      else if (/\.(flac|wav|mp3|m4a|aiff?)$/i.test(it.name)) hit.push(full);
    }
  };
  await walk(root);
  if (!hit.length) return null;
  const withTime = await Promise.all(hit.map(async (f) => ({ f, t: (await fs.stat(f)).mtimeMs })));
  withTime.sort((a, b) => b.t - a.t);
  return withTime[0].f;
}

// —— 有声课件：把每页的旁白接成一条，同时出一张清单 ——
// 清单是给「以后嵌回 pptx」用的：第几页、哪个音频、从第几秒到第几秒。
// 每页之间留一点空（默认 0.6 秒）——讲课的时候那一小段就是翻页的时间。
async function doDeckTrack(job, proj, p) {
  const slides = (proj.slides || []).filter((s) => s.vo);
  if (!slides.length) throw new Error('还没有旁白：先给每页念一遍');
  const dir = projectDir(proj.id);
  const tmp = path.join(dir, 'out', `deck-${rid(4)}`);
  await fs.mkdir(tmp, { recursive: true });
  const gap = Math.max(0, Number(p.gap ?? 0.6));

  const segs = [];
  const manifest = [];
  let cursor = 0;
  for (let i = 0; i < slides.length; i++) {
    const s = slides[i];
    const src = path.join(dir, s.vo);
    if (!existsSync(src)) continue;
    job.message = `接第 ${s.index} 页…`;
    const seg = path.join(tmp, `p${String(i).padStart(3, '0')}.wav`);
    await run(FFMPEG, ['-y', '-v', 'error', '-i', src,
      '-af', `aresample=48000,loudnorm=I=-16:TP=-1.5:LRA=11,apad=pad_dur=${gap}`,
      '-ac', '2', '-ar', '48000', seg], { timeoutMs: 180000 });
    const d = await mediaDuration(seg);
    const r2 = (x) => Math.round(x * 100) / 100;
    manifest.push({
      page: s.index, file: s.vo, start: r2(cursor), end: r2(cursor + d),
      seconds: r2(d), text: s.text || '',
    });
    cursor += d;
    segs.push(seg);
    job.progress = 0.1 + 0.7 * ((i + 1) / slides.length);
  }
  if (!segs.length) throw new Error('每页的音频都找不到（可能被删了），重新念一遍');

  const listFile = path.join(tmp, 'list.txt');
  await fs.writeFile(listFile, segs.map((f) => `file '${f}'`).join('\n'), 'utf8');
  const outRel = path.join('assets', `deck-track-${rid(4)}.wav`);
  const outFile = path.join(dir, outRel);
  job.message = '拼成一条…';
  await run(FFMPEG, ['-y', '-v', 'error', '-f', 'concat', '-safe', '0', '-i', listFile,
    '-ar', '48000', outFile], { timeoutMs: 600000 });

  const total = await mediaDuration(outFile);
  const manRel = path.join('assets', `deck-manifest-${rid(4)}.json`);
  await fs.writeFile(path.join(dir, manRel), JSON.stringify({
    deck: proj.deck?.name || proj.name, pages: manifest.length,
    total, gap, at: now(), items: manifest,
  }, null, 2), 'utf8');

  const fresh = await readProject(proj.id);
  fresh.deckTrack = {
    file: outRel.replace(/\\/g, '/'), manifest: manRel.replace(/\\/g, '/'),
    total, pages: manifest.length, at: now(),
  };
  await writeProject(fresh);
  job.progress = 1;
  return { file: outRel.replace(/\\/g, '/'), manifest: manRel.replace(/\\/g, '/'), total, pages: manifest.length };
}

// —— 有声课件：把每页念好的音频嵌回课件里 ——
// 规矩全在 VoiceCaster 的 pptunit/embed.py（点了才响、重嵌先清旧按钮、
// 音频内嵌不弹选择窗）。这里只把创作台的页音频接上去，不重写那套。
async function doEmbedDeck(job, proj, p) {
  const dir = projectDir(proj.id);
  const src = path.join(dir, 'assets', 'deck.pptx');
  if (!existsSync(src)) throw new Error('这个作品里还没有 pptx：先放一份进来');
  const slides = (proj.slides || []).filter((s) => s.vo);
  if (!slides.length) throw new Error('还没有念过的页：先给至少一页念一遍');
  const map = {};
  for (const s of slides) {
    const f = path.join(dir, s.vo);
    if (existsSync(f)) map[s.index] = f;
  }
  const n = Object.keys(map).length;
  if (!n) throw new Error('念过的页音频都找不到了，重新念一遍');
  const outDir = path.join(dir, 'out');
  await fs.mkdir(outDir, { recursive: true });
  const mapFile = path.join(outDir, `embed-map-${rid(4)}.json`);
  await fs.writeFile(mapFile, JSON.stringify(map), 'utf8');
  const rel = path.join('assets', `deck-voiced-${rid(4)}.pptx`);
  const outFile = path.join(dir, rel);
  const tool = path.join(HERE, 'tools', 'pptx-embed.py');
  if (!existsSync(tool)) throw new Error(`嵌回脚本不见了：${tool}`);
  job.message = `把 ${n} 页的音频嵌进去…`;
  job.progress = 0.3;
  const r = await runCapture(PY, [tool, src, outFile, mapFile], 900000);
  const last = (r.out || '').trim().split('\n').filter(Boolean).pop() || '';
  let res = null;
  try { res = JSON.parse(last); } catch { /* 下面统一报 */ }
  if (!res) throw new Error(`嵌不进去（退出码 ${r.code}）：${(r.err || last || r.out).slice(-300)}`);
  if (res.error) throw new Error(res.error);
  const fresh = await readProject(proj.id);
  fresh.deckAudio = {
    file: rel.replace(/\\/g, '/'), pages: res.pages, embedded: res.embedded || [],
    skipped: res.skipped || [], at: now(),
    name: (proj.deck && proj.deck.name) || proj.name,
  };
  await writeProject(fresh);
  job.progress = 1;
  return fresh.deckAudio;
}

// —— 导出包：001/002… + Manifest.txt（ID｜台词｜时间戳）+ 字幕 + 按角色分轨 ——
// 这套规矩全在 VoiceCaster 的 /api/export/package（它已实测过十几出戏），
// 这里只把创作台的每句音频喂过去，不重写转码和分轨。
// 喂法：把它要的文件拷进它的 output/（它只认扁平文件名），导完就删掉。
async function doExportPackage(job, proj, p) {
  const dir = projectDir(proj.id);
  const usesScript = proj.kind === 'radio' && (proj.script?.lines || []).some((l) => l.vo);
  const src = usesScript ? proj.script.lines : (proj.scenes || []);
  const items = src.filter((x) => x.vo && String(x.text || '').trim());
  if (!items.length) throw new Error('还没有念好的句子：先念一遍再导出');
  const outDir = path.join(VOICE_ROOT, 'output');
  if (!existsSync(outDir)) throw new Error(`找不到 VoiceCaster 的 output 目录：${outDir}`);
  const fmt = ['mp3', 'm4a', 'wav'].includes(String(p.format)) ? String(p.format) : 'mp3';
  const tracks = ['none', 'compact', 'aligned', 'both'].includes(String(p.tracks))
    ? String(p.tracks) : 'none';
  const stamp = rid(6);
  const copied = [];
  const files = [];
  const lines = [];
  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    const no = Number(it.no || i + 1);
    const cid = String(it.character || (String(it.voice || '').match(/^char:(\d+)/) || [])[1] || '').replace(/[^0-9]/g, '');
    const who = String(it.name || it.who || '').trim();
    // 名字只留文件名能认的那部分：_track_label 用 `_` 切，别把下划线带进去
    const safeWho = slug(who || '角色').replace(/_/g, '-');
    const label = cid ? `${cid}号_${safeWho}` : safeWho;
    const name = `cs-pack-${stamp}-${no}-${label}.wav`;
    const abs = resolveAsset(proj, it.vo);
    if (!abs || !existsSync(abs)) continue;
    const dest = path.join(outDir, name);
    await fs.copyFile(abs, dest);
    copied.push(dest);
    files.push(name);
    lines.push({ no, name: who || '未命名', text: String(it.text || '') });
  }
  if (!files.length) throw new Error('每句的音频都找不到了，重新念一遍');
  job.message = `交给 VoiceCaster 转格式、写清单（${files.length} 句）…`;
  job.progress = 0.2;
  let res;
  try {
    res = await jpost(`${VOICECASTER}/api/export/package`, {
      name: `${proj.name}-导出-${stamp}`,
      files, lines, format: fmt, srt: p.srt !== false,
      marks: (proj.marks && typeof proj.marks === 'object') ? proj.marks : {},
      tracks,
    }, 1800000);
  } finally {
    for (const f of copied) { try { await fs.unlink(f); } catch { /* 删不掉就算了 */ } }
  }
  if (!res || !res.url) throw new Error('VoiceCaster 没给下载地址');
  job.message = '取回压缩包…';
  job.progress = 0.85;
  const z = await fetch(`${VOICECASTER}${res.url}`, { signal: AbortSignal.timeout(300000) });
  if (!z.ok) throw new Error(`取不回压缩包（${z.status}）`);
  const zipName = `${slug(proj.name)}-导出-${stamp}.zip`;
  const rel = path.join('out', zipName);
  await fs.mkdir(path.join(dir, 'out'), { recursive: true });
  await fs.writeFile(path.join(dir, rel), Buffer.from(await z.arrayBuffer()));
  const fresh = await readProject(proj.id);
  fresh.exports = [{
    file: rel.replace(/\\/g, '/'), name: zipName, at: now(),
    count: res.count || files.length, seconds: res.seconds || 0,
    tracks: res.tracks || [], format: fmt, srt: p.srt !== false,
  }, ...(fresh.exports || [])].slice(0, 20);
  await writeProject(fresh);
  job.progress = 1;
  return fresh.exports[0];
}

// —— 跨语种：拿角色的参考录音，让同一副嗓子去说英/日/西/阿 ——
// 引擎是 VoiceStudio（OmniVoice 646 语种），VoiceCaster 的 SPEC 4.5 要的
// 「零训练跨语种」就落在它身上；这边只负责挑角色、收成品。
async function doCrosslingual(job, proj, p) {
  const text = String(p.text || '').trim();
  if (!text) throw new Error('没有要念的外文稿');
  const cid = String(p.character || '').replace(/[^0-9]/g, '');
  if (!cid) throw new Error('先挑一个带定妆录音的角色，跨语种才保得住音色');
  const cardPath = path.join(VOICE_ROOT, 'characters', `${cid}.json`);
  if (!existsSync(cardPath)) throw new Error(`角色库里没有 ${cid} 号`);
  const card = JSON.parse(await fs.readFile(cardPath, 'utf8'));
  const ref = card.ref ? path.join(VOICE_ROOT, 'characters', card.ref) : '';
  if (!ref || !existsSync(ref)) throw new Error('这个角色没有定妆录音（官方音色保不住音色），换一个克隆角色');
  const dir = projectDir(proj.id);
  job.message = '让同一副嗓子说外语…';
  job.progress = 0.15;
  const fd = new FormData();
  fd.append('text', text);
  if (p.lang) fd.append('language', String(p.lang));
  fd.append('ref_audio', new Blob([await fs.readFile(ref)]), path.basename(ref));
  if (card.ref_text) fd.append('ref_text', String(card.ref_text));
  if (p.instruct) fd.append('instruct', String(p.instruct));
  const r = await fetch(`${VOICESTUDIO}/generate`, {
    method: 'POST', body: fd, signal: AbortSignal.timeout(1800000),
  });
  if (!r.ok) {
    const t = await r.text();
    throw new Error(`VoiceStudio ${r.status}：${t.slice(0, 300)}`);
  }
  const buf = Buffer.from(await r.arrayBuffer());
  if (!buf.length) throw new Error('VoiceStudio 回了空音频');
  const rel = path.join('assets', `xling-${rid(4)}.wav`);
  const outFile = path.join(dir, rel);
  await fs.writeFile(outFile, buf);
  const seconds = await mediaDuration(outFile);
  job.progress = 1;
  const one = {
    file: rel.replace(/\\/g, '/'), seconds, lang: p.lang || '',
    character: cid, name: card.name || '', text, at: now(),
  };
  const fresh = await readProject(proj.id);
  fresh.crosslinguals = [one, ...(fresh.crosslinguals || [])].slice(0, 20);
  await writeProject(fresh);
  return one;
}

// —— 音轨：先把整段声音搭起来（先声后图）——
// 台词按顺序接起来，配乐垫在下面，音效塞进去；同时记下每句的起止时间，
// 后面出片时图就跟着这张时间表走。
async function doAudioTrack(job, proj, p) {
  const dir = projectDir(proj.id);
  // 广播剧没有「镜头」，句子在 script.lines 里；两边字段一样（vo / text），
  // 所以接音轨这段不用分叉 —— 只是源不同。
  const source = (p.scenes && p.scenes.length) ? p.scenes
    : (proj.kind === 'radio' && (proj.script?.lines || []).length) ? proj.script.lines
      : (proj.scenes || []);
  const scenes = source.filter((s) => s.vo);
  if (!scenes.length) throw new Error('还没有台词音频，先把台词念出来');
  const tmp = path.join(dir, 'out', `mix-${rid(4)}`);
  await fs.mkdir(tmp, { recursive: true });
  const gap = Math.max(0, Number(p.gap ?? 0.35));

  const segs = [];
  const clips = [];
  let cursor = 0;
  for (let i = 0; i < scenes.length; i++) {
    const s = scenes[i];
    job.message = `接第 ${i + 1}/${scenes.length} 句…`;
    const seg = path.join(tmp, `s${String(i).padStart(2, '0')}.wav`);
    await run(FFMPEG, ['-y', '-v', 'error', '-i', path.join(dir, s.vo),
      '-af', `aresample=48000,loudnorm=I=-16:TP=-1.5:LRA=11,apad=pad_dur=${gap}`,
      '-ac', '2', '-ar', '48000', seg], { timeoutMs: 180000 });
    const d = await mediaDuration(seg);
    clips.push({
      id: s.id || `s${i + 1}`, speaker: s.speaker || s.voice || '',
      text: s.text || '', start: Math.round(cursor * 100) / 100,
      end: Math.round((cursor + d) * 100) / 100, seconds: Math.round(d * 100) / 100,
    });
    cursor += d;
    segs.push(seg);
    job.progress = 0.1 + 0.55 * ((i + 1) / scenes.length);
  }

  const listFile = path.join(tmp, 'list.txt');
  await fs.writeFile(listFile, segs.map((f) => `file '${f}'`).join('\n'), 'utf8');
  const dry = path.join(tmp, 'dry.wav');
  await run(FFMPEG, ['-y', '-v', 'error', '-f', 'concat', '-safe', '0', '-i', listFile, '-c', 'copy', dry], { timeoutMs: 300000 });

  // 底板：界面上选中过就用它（没选就看项目里记的最近一条配乐 / 音效）
  const musicRel = p.music || proj.theme?.music?.file || null;
  const sfxRel = p.sfx || proj.theme?.sfx?.file || null;
  const music = musicRel ? path.join(dir, musicRel) : null;
  const sfx = sfxRel ? path.join(dir, sfxRel) : null;
  const outRel = path.join('assets', `track-${rid(4)}.wav`);
  const outFile = path.join(dir, outRel);

  job.message = '铺配乐…';
  const ins = ['-y', '-v', 'error', '-i', dry];
  let chain;
  if (music && existsSync(music)) {
    ins.push('-i', music);
    if (sfx && existsSync(sfx)) {
      ins.push('-i', sfx);
      chain = '[1:a]volume=0.18,apad[bg];[2:a]volume=0.5,adelay=600|600[fx];'
        + '[0:a][bg][fx]amix=inputs=3:duration=first:normalize=0,loudnorm=I=-16:TP=-1.5:LRA=11[a]';
    } else {
      chain = '[1:a]volume=0.18,apad[bg];[0:a][bg]amix=inputs=2:duration=first:normalize=0,loudnorm=I=-16:TP=-1.5:LRA=11[a]';
    }
  } else if (sfx && existsSync(sfx)) {
    ins.push('-i', sfx);
    chain = '[1:a]volume=0.5,adelay=600|600[fx];[0:a][fx]amix=inputs=2:duration=first:normalize=0,loudnorm=I=-16:TP=-1.5:LRA=11[a]';
  } else {
    chain = '[0:a]loudnorm=I=-16:TP=-1.5:LRA=11[a]';
  }
  ins.push('-filter_complex', chain, '-map', '[a]', '-ar', '48000', outFile);
  await run(FFMPEG, ins, { timeoutMs: 600000 });

  const total = await mediaDuration(outFile);
  const tlRel = path.join('assets', `timeline-${rid(4)}.json`);
  await fs.writeFile(path.join(dir, tlRel), JSON.stringify({
    clips, total, music: music ? musicRel : null, sfx: sfx ? sfxRel : null, at: now(),
  }, null, 2), 'utf8');

  const fresh = await readProject(proj.id);
  fresh.audioTrack = { file: outRel.replace(/\\/g, '/'), timeline: tlRel.replace(/\\/g, '/'), total };
  fresh.scenes = (fresh.scenes || []).map((sc) => {
    const c = clips.find((x) => x.id === sc.id);
    return c ? { ...sc, start: c.start, end: c.end, seconds: c.seconds } : sc;
  });
  await writeProject(fresh);
  job.progress = 1;
  return { file: outRel.replace(/\\/g, '/'), timeline: tlRel.replace(/\\/g, '/'), total, clips: clips.length };
}

// —— 拼片：图 + 台词 + 配乐 + 音效 → mp4 ——
async function doRender(job, proj, p) {
  const dir = projectDir(proj.id);
  const scenes = (p.scenes && p.scenes.length ? p.scenes : proj.scenes) || [];
  const usable = scenes.filter((s) => s.image || s.vo);
  if (!usable.length) throw new Error('没有能拼的东西（至少要有图或台词）');

  const trackFile = p.track ? path.join(dir, p.track)
    : (proj.audioTrack?.file ? path.join(dir, proj.audioTrack.file) : null);
  const useTrack = Boolean(trackFile && existsSync(trackFile));
  let timeline = p.timeline || null;
  if (!timeline && proj.audioTrack?.timeline) {
    try { timeline = JSON.parse(await fs.readFile(path.join(dir, proj.audioTrack.timeline), 'utf8')); } catch { timeline = null; }
  }

  job.message = `拼 ${usable.length} 个镜头…`;
  const tmp = path.join(dir, 'out', `build-${rid(4)}`);
  await fs.mkdir(tmp, { recursive: true });

  // 1) 每个镜头先做成一段无声或带旁白的片段
  const parts = [];
  for (let i = 0; i < usable.length; i++) {
    const s = usable[i];
    const seg = path.join(tmp, `seg${String(i).padStart(2, '0')}.mp4`);
    const img = s.image ? path.join(dir, s.image) : null;
    const vo = s.vo ? path.join(dir, s.vo) : null;
    const voDur = vo && existsSync(vo) ? await mediaDuration(vo) : 0;
    const clip = timeline?.clips?.find((c) => c.id === s.id);
    const dur = clip ? Math.max(0.8, Number(clip.end) - Number(clip.start))
      : (Number(s.seconds || 0) || Math.max(3, voDur ? voDur + 1.2 : 4));

    const hasVo = !useTrack && Boolean(vo && existsSync(vo));
    const args = ['-y', '-v', 'error'];
    if (img && existsSync(img)) {
      args.push('-loop', '1', '-framerate', '30', '-t', String(dur), '-i', img);
    } else {
      args.push('-f', 'lavfi', '-t', String(dur), '-i', `color=c=black:s=1280x720:r=30`);
    }
    if (hasVo) args.push('-i', vo);
    else args.push('-f', 'lavfi', '-t', String(dur), '-i', 'anullsrc=r=44100:cl=stereo');

    const W = 1280, H = 720;
    // 背景：整图放大模糊铺满；前景：完整原图（不裁内容）；再来一点极缓的推镜
    const filter = [
      `[0:v]split=2[a][b]`,
      `[a]scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},boxblur=26:2,eq=brightness=-0.1[bg]`,
      `[b]scale=${W}:${H}:force_original_aspect_ratio=decrease[fg]`,
      `[bg][fg]overlay=(W-w)/2:(H-h)/2[base]`,
      `[base]zoompan=z='min(zoom+0.00028,1.10)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${Math.ceil(dur * 30)}:s=${W}x${H}:fps=30,format=yuv420p[v]`,
    ].join(';');

    args.push('-filter_complex', filter, '-map', '[v]', '-map', '1:a');
    if (hasVo) args.push('-af', 'loudnorm=I=-16:TP=-1.5:LRA=11');
    args.push('-t', String(dur), '-c:v', 'libx264', '-preset', 'veryfast', '-c:a', 'aac', '-b:a', '192k', '-pix_fmt', 'yuv420p', seg);
    await run(FFMPEG, args, { timeoutMs: 600000 });
    parts.push(seg);
    job.progress = 0.1 + 0.5 * ((i + 1) / usable.length);
  }

  // 2) 把镜头接起来
  const listFile = path.join(tmp, 'list.txt');
  await fs.writeFile(listFile, parts.map((f) => `file '${f}'`).join('\n'), 'utf8');
  const silent = path.join(tmp, 'silent.mp4');
  await run(FFMPEG, ['-y', '-v', 'error', '-f', 'concat', '-safe', '0', '-i', listFile, '-c', 'copy', silent],
    { timeoutMs: 600000 });

  // 3) 铺上配乐与音效（如果有），再压一遍响度
  const musicRel = p.music || proj.theme?.music?.file || null;
  const sfxRel = p.sfx || proj.theme?.sfx?.file || null;
  const music = musicRel ? path.join(dir, musicRel) : null;
  const sfx = sfxRel ? path.join(dir, sfxRel) : null;
  const outName = `${slug(p.filename || proj.name)}-${Date.now().toString(36)}.mp4`;
  const outPath = path.join(dir, 'out', outName);

  if (useTrack) {
    // 音轨已经是混好的整条：画面按镜头接，声音整条铺上
    await run(FFMPEG, ['-y', '-v', 'error', '-i', silent, '-i', trackFile,
      '-map', '0:v', '-map', '1:a', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k',
      '-shortest', '-movflags', '+faststart', outPath], { timeoutMs: 900000 });
  } else if (music && existsSync(music)) {
    const extra = [];
    if (sfx && existsSync(sfx)) extra.push('-i', sfx);
    // [1:a] 配乐，可能还有 [2:a] 音效
    const mix = sfx && existsSync(sfx)
      ? `[1:a]volume=0.22,apad[bg];[2:a]volume=0.5,adelay=500|500[fx];[0:a][bg][fx]amix=inputs=3:duration=first:normalize=0,loudnorm=I=-16:TP=-1.5:LRA=11[a]`
      : `[1:a]volume=0.22,apad[bg];[0:a][bg]amix=inputs=2:duration=first:normalize=0,loudnorm=I=-16:TP=-1.5:LRA=11[a]`;
    await run(FFMPEG, ['-y', '-v', 'error', '-i', silent, '-i', music, ...extra,
      '-filter_complex', mix, '-map', '0:v', '-map', '[a]',
      '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart', outPath], { timeoutMs: 900000 });
  } else {
    await run(FFMPEG, ['-y', '-v', 'error', '-i', silent, '-c', 'copy', '-movflags', '+faststart', outPath],
      { timeoutMs: 600000 });
  }

  const dur = await mediaDuration(outPath);
  const entry = { file: path.join('out', outName).replace(/\\/g, '/'), seconds: dur, at: now() };
  const fresh = await readProject(proj.id);
  fresh.renders = [entry, ...(fresh.renders || [])].slice(0, 20);
  await writeProject(fresh);
  job.progress = 1;
  return entry;
}

// ────────────────────────────── 后端探活 / 拉起 ──────────────────────────

async function statusOf() {
  const one = async (url, pathname = '/') => {
    try { await jget(url + pathname, 1500); return true; } catch { return false; }
  };
  const [tts, caster, voic, sheetsage] = await Promise.all([
    one(TTS, '/health'), one(CASTER, '/api/health'), one(VOICECASTER, '/api/characters'),
    one(SHEETSAGE, '/health'),
  ]);
  // 转谱的模型下没下：服务自己能说，问一句就行（问不到就当没装）
  let transcribeWeights = false;
  if (sheetsage) {
    try {
      const h = await jget(`${SHEETSAGE}/health`, 2500);
      transcribeWeights = !!(h.models_present && h.models_present.sheetsage2
        && h.models_present.mert2_fullsong);
    } catch { /* 问不到 */ }
  }
  return {
    tts, caster, voicecaster: voic,
    transcribe: sheetsage, transcribeWeights,
    seedvc: existsSync(path.join(SEEDVC, '.venv', 'bin', 'python')),
  };
}

let casterStarting = null;
async function ensureCaster() {
  const up = await (async () => { try { await jget(CASTER + '/api/health', 1500); return true; } catch { return false; } })();
  if (up) return true;
  if (casterStarting) return casterStarting;
  casterStarting = (async () => {
    const script = path.join(CASTER_ROOT, 'app', 'server.py');
    if (!existsSync(script)) throw new Error(`Crafting Caster 不在 ${CASTER_ROOT}，也没在运行`);
    const log = path.join(os.tmpdir(), 'caster-launch.log');
    const fd = await fs.open(log, 'a');
    const child = spawn(CASTER_PY, [script], {
      cwd: path.join(CASTER_ROOT, 'app'), detached: true, stdio: ['ignore', fd.fd, fd.fd],
    });
    child.unref();
    for (let i = 0; i < 120; i++) {
      await new Promise((r) => setTimeout(r, 1000));
      try { await jget(CASTER + '/api/health', 1200); return true; } catch { /* 再等 */ }
    }
    throw new Error('Crafting Caster 起不来（等了两分钟）');
  })();
  try { return await casterStarting; } finally { casterStarting = null; }
}

// —— 三台出歌引擎现在到底能不能用 ——
// 界面不该给一个点了就跑不动的按钮：ACE-Step 的权重 2026-10-16 被拆掉了
// （省 10 GB），HeartMuLa 要 audio.cpp 的模型和命令行工具都在。
// 判据照各适配器自己的检查来，不另造标准。
function songEngineStatus() {
  const has = (q) => existsSync(q);
  const root = (q) => path.join(MIR_ROOT, '..', q);
  // 用户 2026-11-15：「现在有的是 yue2，stable audio 和 heartmula」——
  // ACE-Step（原 Composer Step）的权重 2026-10-16 拆掉了，不再列出来。
  // Stable Audio 就是快档那台（走 Crafting Caster），单独一个按钮，不在这里。
  return [
    {
      id: 'yue2',
      name: 'YuE2 · 带词唱（成品，唯一出谱的）',
      ready: has(path.join(MIR_ROOT, 'yue2_adapter.sh')) && has(root('yue2-local')),
      why: '适配器或 yue2 引擎不在',
    },
    {
      id: 'heartmula',
      name: 'HeartMuLa · 人声草稿（不出谱）',
      ready: has(path.join(MIR_ROOT, 'heartmula_adapter.sh'))
        && has(root('audio.cpp/models/HeartMuLa-GGUF'))
        && has(root('audiocpp-bin/audiocpp_cli')),
      why: '模型或命令行工具不在（audio.cpp）',
    },
  ];
}

// ────────────────────────────── HTTP ──────────────────────────────

// —— MIR Studio（8808）：改谱、看简谱、打 PDF 的那个本机网页 ——
// 它不在就自己拉起来（跟 Caster 一个路子）；起来之后把谱交给它、开 Chrome。
async function miStudioAlive() {
  try {
    const r = await fetch(`${MI_STUDIO}/api/version`, { signal: AbortSignal.timeout(1200) });
    return r.ok;
  } catch { return false; }
}

let miStarting = null;
async function ensureMiStudio() {
  if (await miStudioAlive()) return true;
  if (miStarting) return miStarting;
  miStarting = (async () => {
    const script = path.join(MI_STUDIO_ROOT, 'server.mjs');
    if (!existsSync(script)) throw new Error(`MIR Studio 的程序不在：${MI_STUDIO_ROOT}`);
    const log = path.join(os.tmpdir(), 'mi-studio-launch.log');
    const fd = await fs.open(log, 'a');
    const child = spawn(process.execPath, [script], {
      cwd: MI_STUDIO_ROOT, detached: true, stdio: ['ignore', fd.fd, fd.fd],
    });
    child.unref();
    for (let i = 0; i < 25; i++) {
      await new Promise((r) => setTimeout(r, 300));
      if (await miStudioAlive()) return true;
    }
    throw new Error('MIR Studio 起不来（看 /tmp/mi-studio-launch.log）');
  })();
  try { return await miStarting; } finally { miStarting = null; }
}

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp',
  '.wav': 'audio/wav', '.mp3': 'audio/mpeg', '.m4a': 'audio/mp4', '.mp4': 'video/mp4',
  '.svg': 'image/svg+xml',
};

function send(res, code, body, headers = {}) {
  const isBuf = Buffer.isBuffer(body);
  res.writeHead(code, {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET,POST,PATCH,DELETE,OPTIONS',
    'Cache-Control': 'no-store',
    ...headers,
  });
  res.end(isBuf ? body : JSON.stringify(body));
}

function sendFile(res, file, { download = false } = {}) {
  const ext = path.extname(file).toLowerCase();
  const h = { 'Content-Type': MIME[ext] || 'application/octet-stream' };
  if (download) h['Content-Disposition'] = `attachment; filename="${path.basename(file)}"`;
  res.writeHead(200, { 'Access-Control-Allow-Origin': '*', ...h });
  // 流式发送，大文件不占内存
  createReadStreamSafe(file).pipe(res);
}

function createReadStreamSafe(file) { return createReadStream(file); }

function body(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', (c) => { raw += c; if (raw.length > 2e6) reject(new Error('请求太大')); });
    req.on('end', () => {
      if (!raw.trim()) return resolve({});
      try { resolve(JSON.parse(raw)); } catch (e) { reject(new Error('JSON 解析失败')); }
    });
    req.on('error', reject);
  });
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://127.0.0.1:${PORT}`);
  const p = url.pathname;
  if (req.method === 'OPTIONS') return send(res, 204, {});
  try {
    // —— 后端状态 ——
    if (p === '/api/health') {
      return send(res, 200, {
        ok: true, service: 'casting-studio', at: now(),
        backends: await statusOf(),
        engines: songEngineStatus(),
        disk: { ok: diskOk(), workRoot: WORK_ROOT },
        queue: queue.length, running: running ? publicJob(jobs.get(running)) : null,
        casterRoot: CASTER_ROOT, mirRoot: MIR_ROOT,
      });
    }
    if (p === '/api/start/caster' && req.method === 'POST') {
      await ensureCaster();
      return send(res, 200, { ok: true, backends: await statusOf() });
    }
    // —— 界面自检上报（面板把 elementFromPoint 的结果发过来）——
    if (p === '/api/diag' && req.method === 'POST') {
      const b = await body(req);
      b.receivedAt = now();
      await fs.writeFile(path.join(HERE, 'diag.json'), JSON.stringify(b, null, 2), 'utf8');
      console.log('[diag]', JSON.stringify(b).slice(0, 400));
      return send(res, 200, { ok: true });
    }
    if (p === '/api/diag' && req.method === 'GET') {
      try { return send(res, 200, JSON.parse(await fs.readFile(path.join(HERE, 'diag.json'), 'utf8'))); }
      catch { return send(res, 200, { ok: false, note: '还没有自检结果' }); }
    }
    if (p === '/api/voices') {
      const h = await jget(TTS + '/health', 4000);
      return send(res, 200, { voices: h.voices || [] });
    }

    // —— 声音库：VoiceCaster 的角色卡（里面就有用户自己的克隆声）——
    // 一次把「谁能念」「有哪些情绪」「术语表」拿齐，界面打开时只问一次。
    if (p === '/api/voice-library') {
      const out = {
        ok: false, why: '', characters: [],
        emotions: EMOTIONS_FALLBACK, glossary: { terms: [] },
      };
      try {
        const chars = await jget(`${VOICECASTER}/api/characters`, 6000);
        out.characters = Array.isArray(chars) ? chars : [];
        out.ok = true;
      } catch (e) {
        out.why = 'VoiceCaster 没开着（它的角色库在这里面）';
      }
      try {
        const emo = await jget(`${VOICECASTER}/api/emotions`, 4000);
        if (emo && Array.isArray(emo.emotions) && emo.emotions.length) out.emotions = emo.emotions;
      } catch { /* 用它不在时的兜底那 8 个 */ }
      try {
        const g = await jget(`${VOICECASTER}/api/ppt/glossary`, 4000);
        if (g && Array.isArray(g.terms)) out.glossary = g;
      } catch { /* 术语表读不到就当空的 */ }
      return send(res, 200, out);
    }

    // —— 术语表：读/改都走 VoiceCaster，它才是这张表的家 ——
    if (p === '/api/glossary' && req.method === 'GET') {
      try { return send(res, 200, await jget(`${VOICECASTER}/api/ppt/glossary`, 4000)); }
      catch { return send(res, 503, { error: '读不到术语表（VoiceCaster 没开着？）' }); }
    }
    if (p === '/api/glossary' && req.method === 'POST') {
      const b = await body(req);
      const r = await jpost(`${VOICECASTER}/api/ppt/glossary`, { terms: b.terms || [] }, 20000);
      return send(res, 200, r);
    }

    // —— 试听一个角色：直接把音频流给界面，不落进作品 ——
    if (p === '/api/voice-preview' && req.method === 'POST') {
      const b = await body(req);
      const cid = String(b.character || '').replace(/[^0-9]/g, '');
      if (!cid) return send(res, 400, { error: '没给角色编号' });
      const r = await jpost(`${VOICECASTER}/api/characters/${cid}/say`,
        { text: b.text || '晚风掠过林间，我听见远处传来一声温柔的呼唤。', emotion: b.emotion || '' }, 1800000);
      const w = await fetch(`${VOICECASTER}${r.url}`, { signal: AbortSignal.timeout(180000) });
      if (!w.ok) return send(res, 502, { error: `取不到试听音频（${w.status}）` });
      const buf = Buffer.from(await w.arrayBuffer());
      res.writeHead(200, {
        'Access-Control-Allow-Origin': '*', 'Content-Type': 'audio/wav',
        'Cache-Control': 'no-store', 'Content-Length': buf.length,
      });
      return res.end(buf);
    }

    // —— 克隆一个新声音进角色库 ——
    // 上传录音 → VoiceCaster 降噪、统一成 48k → 编下一个号进它的角色库。
    // 这边不碰模型，只做搬运；造完角色立刻能在「谁念」里选到。
    if (p === '/api/clone-voice' && req.method === 'POST') {
      const raw = decodeURIComponent(url.searchParams.get('name') || 'voice.wav');
      const who = decodeURIComponent(url.searchParams.get('name_who') || '').trim() || '我的声音';
      const chunks = [];
      let n = 0;
      for await (const c of req) {
        n += c.length;
        if (n > 80e6) return send(res, 413, { error: '这段录音太大（超过 80MB）' });
        chunks.push(c);
      }
      const buf = Buffer.concat(chunks);
      if (!buf.length) return send(res, 400, { error: '录音是空的' });
      let up;
      try {
        up = await jpost(`${VOICECASTER}/api/clone/upload`,
          { filename: path.basename(raw), data: buf.toString('base64'), denoise: true }, 300000);
      } catch (e) {
        return send(res, 503, { error: `VoiceCaster 收不了这段录音：${e.message}` });
      }
      if (!up || !up.ref) return send(res, 502, { error: 'VoiceCaster 没给参考音频' });
      if (up.ok === false) {
        return send(res, 400, { error: up.hint || '这段录音太短或太长', seconds: up.seconds });
      }
      try {
        const card = await jpost(`${VOICECASTER}/api/clone/save`,
          { ref: up.ref, name: who, desc: '从创作台克隆进来的声音', text: '', engine: 'qwen' }, 120000);
        return send(res, 200, { ...card, seconds: up.seconds, denoised: up.denoised });
      } catch (e) {
        return send(res, 502, { error: `存不进角色库：${e.message}` });
      }
    }

    // —— 项目（都存到 CAST_WORK；那儿不可用就别装作能存）——
    if (p.startsWith('/api/projects') && !diskOk()) return send(res, 503, { error: DISK_MSG });

    if (p === '/api/projects' && req.method === 'GET') return send(res, 200, await listProjects());
    if (p === '/api/projects' && req.method === 'POST') {
      const b = await body(req);
      return send(res, 200, await createProject(b));
    }
    let m = p.match(/^\/api\/projects\/([^/]+)$/);
    if (m) {
      const id = decodeURIComponent(m[1]);
      if (req.method === 'GET') {
        const proj = await readProject(id);
        return proj ? send(res, 200, proj) : send(res, 404, { error: '没有这个项目' });
      }
      if (req.method === 'PATCH') {
        const proj = await readProject(id);
        if (!proj) return send(res, 404, { error: '没有这个项目' });
        const b = await body(req);
        for (const k of ['name', 'kind', 'brief', 'theme', 'characters', 'scenes', 'slides',
          'script', 'marks', 'video', 'deckVoice', 'deckEmotion', 'deckAudio',
          'exports', 'crosslinguals']) {
          if (k in b) proj[k] = b[k];
        }
        return send(res, 200, await writeProject(proj));
      }
      if (req.method === 'DELETE') {
        const dir = projectDir(id);
        if (!existsSync(dir)) return send(res, 404, { error: '没有这个项目' });
        await fs.rm(dir, { recursive: true, force: true });
        return send(res, 200, { ok: true });
      }
    }

    // —— 放进一份课件（pptx）——
    // 直接收原始字节：base64 会凭空胖三分之一，而课件常常几十兆。
    m = p.match(/^\/api\/projects\/([^/]+)\/slides$/);
    if (m && req.method === 'POST') {
      const id = decodeURIComponent(m[1]);
      const proj = await readProject(id);
      if (!proj) return send(res, 404, { error: '没有这个项目' });
      const name = decodeURIComponent(url.searchParams.get('name') || '课件.pptx');
      const dir = projectDir(id);
      await fs.mkdir(path.join(dir, 'assets'), { recursive: true });
      const dest = path.join(dir, 'assets', 'deck.pptx');
      await new Promise((resolve, reject) => {
        const ws = createWriteStream(dest);
        let n = 0;
        req.on('data', (c) => {
          n += c.length;
          if (n > 300e6) { req.destroy(); reject(new Error('这份文件太大（超过 300MB）')); }
        });
        req.on('error', reject);
        ws.on('error', reject);
        ws.on('finish', resolve);
        req.pipe(ws);
      });
      const pages = await extractDeck(dest);
      if (!pages.length) throw new Error('这份 pptx 一页都没有');
      // 重放同一份课件时：按页号把念过的旁白接上，其余重建
      const old = new Map((proj.slides || []).map((s) => [s.index, s]));
      proj.slides = pages.map((pg) => {
        const was = old.get(pg.index);
        return {
          index: pg.index, notes: pg.notes, body: pg.body, source: pg.source,
          text: pg.text, lines: pg.lines || [],
          vo: was?.vo || null, seconds: was?.seconds || 0,
        };
      });
      proj.deck = { name, pages: pages.length, at: now() };
      await writeProject(proj);
      return send(res, 200, { ok: true, pages: pages.length, slides: proj.slides, deck: proj.deck });
    }

    // —— 放进一份剧本（docx / pdf / txt / md），拆成「名字：台词」 ——
    // 读文件、抽人物名、跟角色库匹配，全用 VoiceCaster 那一套
    // （/api/import/text + /api/parse）。那边已实测过「绝不自动新建角色」。
    m = p.match(/^\/api\/projects\/([^/]+)\/script$/);
    if (m && req.method === 'POST') {
      const id = decodeURIComponent(m[1]);
      const proj = await readProject(id);
      if (!proj) return send(res, 404, { error: '没有这个项目' });
      const name = decodeURIComponent(url.searchParams.get('name') || '剧本.docx');
      const chunks = [];
      let n = 0;
      for await (const c of req) {
        n += c.length;
        if (n > 60e6) return send(res, 413, { error: '这份剧本太大（超过 60MB）' });
        chunks.push(c);
      }
      const raw = Buffer.concat(chunks);
      if (!raw.length) return send(res, 400, { error: '文件是空的' });
      let text = '';
      try {
        const imp = await jpost(`${VOICECASTER}/api/import/text`,
          { name, data: raw.toString('base64') }, 120000);
        text = String(imp.text || '');
      } catch (e) {
        return send(res, 503, { error: `读不了这份文件：${e.message}（VoiceCaster 开着吗？）` });
      }
      if (!text.trim()) return send(res, 400, { error: '这份文件里读不出文字（可能是扫描件）' });
      let parsed;
      try {
        parsed = await jpost(`${VOICECASTER}/api/parse`, { text }, 120000);
      } catch (e) {
        return send(res, 502, { error: `拆台词失败：${e.message}` });
      }
      // 重导同一份稿：句子一模一样就把念过的音频接回来，别白念一遍
      const old = new Map((proj.script?.lines || []).map((l) => [`${l.no}|${l.text}`, l]));
      proj.script = {
        text, at: now(), source: name,
        lines: (parsed.lines || []).map((l) => {
          const was = old.get(`${l.no}|${l.text}`);
          return {
            ...l,
            vo: (was && was.vo) || null, seconds: (was && was.seconds) || 0,
            instruct: (was && was.instruct) || '', voice: (was && was.voice) || '',
          };
        }),
        prompts: parsed.prompts || [],
        summary: parsed.summary || [],
        unmapped: parsed.unmapped || [],
      };
      await fs.mkdir(path.join(projectDir(id), 'assets'), { recursive: true });
      await fs.writeFile(path.join(projectDir(id), 'assets', 'script.txt'), text, 'utf8');
      await writeProject(proj);
      return send(res, 200, { ok: true, ...proj.script });
    }

    // —— 放进一段视频（只用于对时间、打点；不进成片）——
    m = p.match(/^\/api\/projects\/([^/]+)\/video$/);
    if (m && req.method === 'POST') {
      const id = decodeURIComponent(m[1]);
      const proj = await readProject(id);
      if (!proj) return send(res, 404, { error: '没有这个项目' });
      const rawName = decodeURIComponent(url.searchParams.get('name') || '视频.mp4');
      const ext = (path.extname(rawName) || '.mp4').toLowerCase().replace(/[^.a-z0-9]/g, '') || '.mp4';
      const dir = projectDir(id);
      await fs.mkdir(path.join(dir, 'assets', 'in'), { recursive: true });
      const rel = path.join('assets', 'in', `video-${rid(4)}${ext}`);
      const dest = path.join(dir, rel);
      let n = 0;
      await new Promise((resolve, reject) => {
        const ws = createWriteStream(dest);
        req.on('data', (c) => {
          n += c.length;
          if (n > 800e6) { req.destroy(); reject(new Error('这个视频太大（超过 800MB）')); }
        });
        req.on('error', reject);
        ws.on('error', reject);
        ws.on('finish', resolve);
        req.pipe(ws);
      });
      const seconds = await mediaDuration(dest);
      proj.video = {
        file: rel.replace(/\\/g, '/'), name: rawName, seconds, at: now(),
        note: '只用于对时间打点，不进成片',
      };
      await writeProject(proj);
      return send(res, 200, { ok: true, video: proj.video });
    }

    // —— 放进一段音频（换嗓子的源，或目标嗓音的参考录音）——
    // 同样收原始字节：一首歌几十兆，base64 会凭空胖三分之一。
    m = p.match(/^\/api\/projects\/([^/]+)\/audio$/);
    if (m && req.method === 'POST') {
      const id = decodeURIComponent(m[1]);
      const proj = await readProject(id);
      if (!proj) return send(res, 404, { error: '没有这个项目' });
      const raw = decodeURIComponent(url.searchParams.get('name') || 'audio.wav');
      const ext = (path.extname(raw) || '.wav').toLowerCase().replace(/[^.a-z0-9]/g, '') || '.wav';
      const dir = projectDir(id);
      await fs.mkdir(path.join(dir, 'assets', 'in'), { recursive: true });
      const rel = path.join('assets', 'in',
        `${slug(path.basename(raw, path.extname(raw)))}-${rid(4)}${ext}`);
      const dest = path.join(dir, rel);
      await new Promise((resolve, reject) => {
        const ws = createWriteStream(dest);
        let n = 0;
        req.on('data', (c) => {
          n += c.length;
          if (n > 400e6) { req.destroy(); reject(new Error('这段音频太大（超过 400MB）')); }
        });
        req.on('error', reject);
        ws.on('error', reject);
        ws.on('finish', resolve);
        req.pipe(ws);
      });
      const seconds = await mediaDuration(dest);
      return send(res, 200, { ok: true, file: rel.replace(/\\/g, '/'), seconds });
    }

    // —— MIR Studio：把作品里的一份谱带进去，然后开浏览器 ——
    // 先把 abc 交给它的 /api/load 换一个 session，再用 `?session=` 打开页面。
    // 它在不在都行：不在就自己拉起来（跟 Caster 一样）。
    if (p === '/api/mir-studio' && req.method === 'GET') {
      return send(res, 200, { ok: await miStudioAlive(), url: MI_STUDIO, root: MI_STUDIO_ROOT });
    }
    m = p.match(/^\/api\/projects\/([^/]+)\/studio$/);
    if (m && req.method === 'POST') {
      const id = decodeURIComponent(m[1]);
      const proj = await readProject(id);
      if (!proj) return send(res, 404, { error: '没有这个项目' });
      const b = await body(req);
      const src = resolveAsset(proj, b.file);
      if (!src || !existsSync(src)) return send(res, 400, { error: '找不到这份谱子（要 .abc）' });
      if (!/\.abc$/i.test(src)) return send(res, 400, { error: 'MIR Studio 收 .abc 谱子（MusicXML 可以用「导出 MusicXML」）' });
      const abcText = await fs.readFile(src, 'utf8');
      await ensureMiStudio();
      const r = await jpost(`${MI_STUDIO}/api/load`, {
        abc: abcText,
        title: String(b.title || proj.name || ''),
        style: String(b.style || proj.theme?.songPrompt || ''),
        lyrics: String(b.lyrics || ''),
        seed: b.seed ?? 12300,
        steps: b.steps ?? 8,
      }, 30000);
      if (!r || !r.id) return send(res, 502, { error: 'MIR Studio 没给回话（谱子没送进去）' });
      const openUrl = `${MI_STUDIO}/?session=${encodeURIComponent(r.id)}`;
      // 用 Chrome：Safari 读不了 MIDI 键盘（MI Studio README 里记过）
      try {
        spawn('open', ['-a', 'Google Chrome', openUrl], { detached: true, stdio: 'ignore' }).unref();
      } catch {
        spawn('open', [openUrl], { detached: true, stdio: 'ignore' }).unref();
      }
      return send(res, 200, { ok: true, url: openUrl, session: r.id, warning: r.warning || null });
    }

    // —— 任务 ——
    m = p.match(/^\/api\/projects\/([^/]+)\/job$/);
    if (m && req.method === 'POST') {
      const id = decodeURIComponent(m[1]);
      const proj = await readProject(id);
      if (!proj) return send(res, 404, { error: '没有这个项目' });
      const b = await body(req);
      if (!b.type) return send(res, 400, { error: '缺 type' });
      const job = pushJob(b.type, b.params || {}, id);
      return send(res, 200, publicJob(job));
    }
    m = p.match(/^\/api\/jobs\/([^/]+)$/);
    if (m) {
      const job = jobs.get(m[1]);
      return job ? send(res, 200, publicJob(job)) : send(res, 404, { error: '没有这个任务' });
    }
    if (p === '/api/queue') {
      return send(res, 200, {
        running: running ? publicJob(jobs.get(running)) : null,
        queued: queue.map((id) => publicJob(jobs.get(id))),
      });
    }

    // —— 素材 / 文件 ——
    m = p.match(/^\/files\/([^/]+)\/(.+)$/);
    if (m) {
      const id = decodeURIComponent(m[1]);
      const rel = decodeURIComponent(m[2]).replace(/\.\./g, '');
      const file = path.join(projectDir(id), rel);
      if (!file.startsWith(projectDir(id)) || !existsSync(file)) return send(res, 404, { error: '没有这个文件' });
      return sendFile(res, file, { download: url.searchParams.has('dl') });
    }

    // —— 前端页面（开发期直接看）——
    // 插件源码也给一份：`web/preview-live.html` 用它把真面板渲染出来自己看。
    // 只在开发期用，DSH 里那份是它自己从 profile 加载的，跟这条路由无关。
    if (p === '/dev/client.js') {
      const src = path.join(HERE, 'dsh', 'client.js');
      if (!existsSync(src)) return send(res, 404, { error: '没有 dsh/client.js' });
      return sendFile(res, src);
    }
    const staticPath = p === '/' ? '/index.html' : p;
    const file = path.join(WEB, staticPath.replace(/\.\./g, ''));
    if (existsSync(file) && file.startsWith(WEB)) return sendFile(res, file);

    return send(res, 404, { error: '没有这个接口' });
  } catch (e) {
    return send(res, 500, { error: String(e.message || e) });
  }
});

if (diskOk()) {
  await fs.mkdir(WORK_ROOT, { recursive: true });
} else {
  console.error(`[创作台] ${DISK_MSG}`);
}
server.listen(PORT, '127.0.0.1', () => {
  console.log(`创作台后端：http://127.0.0.1:${PORT}`);
});
