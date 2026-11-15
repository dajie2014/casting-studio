# 创作台 · Casting Studio

把「文字」做成「能听能看的作品」的一条流水线：先做声音，再贴画面，最后拼成片。

一个本机服务（`127.0.0.1:7870`）+ 一块 DSH 面板。四个板块：

| 板块 | 做什么 |
|---|---|
| 有声幻灯片 | 镜头（台词 + 画面提示）→ 念白 → 出图 → 接成一条音轨 → 拼成 mp4 |
| 有声课件 | 放入 `.pptx` → 抽出每页该讲的话 → 逐页念 → 整条音频 + 每页时间表 → **嵌回 pptx**（每页一个播放按钮） |
| 广播剧 | 剧本（docx/pdf/txt）→ 按角色拆行、挂情绪 → 单句重念 / 整场连念 → 接音轨 → 导出包（分句 + Manifest + SRT + 按角色分轨） |
| 产品推广 | 文案 → 旁白 → 画面 → 短片 |

另外还有：主题歌（带词唱 / 人声草稿）、声音底板（配乐 / 音效）、修整台（换嗓子 / 转谱 /
跨语种 / 克隆新声音 / 专业词读音）、出谱子（ABC → MusicXML）、量一下（BPM / 响度）、
送出去（ACE Studio / Ableton Live）。

---

## 它不是一个「装上就什么都能干」的软件

**这条要先看清楚，免得装完觉得被骗。**

创作台自己是**调度和拼装**：排队、念白、拼音轨、出图、拼片、导出。真正出声、出画、出谱的
是四个**后端**，它们都不在这个仓库里，得你自己有：

| 后端 | 提供什么 | 没有它的时候 |
|---|---|---|
| **DSH**（DeepSeek Harness） | 面板挂靠的宿主 | 装不了这个面板（但服务本身能跑，可以直接 curl 接口） |
| 一个 TTS 服务（HTTP `/tts`） | 念台词、旁白 | 念白全废，其余照旧 |
| **Crafting Caster** 或任何兼容的 Stable Audio / SDXL 服务 | 配乐、音效、出图 | 声音底板和画面全废 |
| **MIR**（一个带 `yue2_adapter.sh` 那套契约的引擎目录） | 带词主题歌、换嗓子、转谱、谱面工具 | 这些功能各自显示「不在」 |
| **VoiceCaster** | 角色库、情绪标签、术语读音、剧本解析、导出包 | 退回单一音色 + 内置兜底 |

**设计上就允许后端缺席**：`/api/health` 会逐条报哪些后端在；界面里对应的按钮会禁用或
明说「这条后端不在」。**不会假装成功。**

---

## 装

### 1. 起服务

```sh
node server.mjs            # 默认 127.0.0.1:7870
```

探活：

```sh
curl -s http://127.0.0.1:7870/api/health
```

你会看到 `backends` 里每一条是 `true` 还是 `false` —— 那就是这台机器现在能干哪些活。

### 2. 挂进 DSH（想要面板的话）

把 `dsh/` 这一层当成一个 DSH 插件装进你的 profile。也可以在**新开窗口**时选
「创作台模式」（`dsh/cordis.patch.yml` 里定义了它）。装完左栏底部会出现「🎬 创作台」。

> 作者本人是在 DSH 里用的；服务由插件负责「活着就拉起来、已经在跑就不重复起」。

### 3. 指到自己的后端（可选）

全部用环境变量，不用改代码：

```sh
CAST_WORK=~/Casting Projects        # 作品存哪（默认就是它）
CAST_PORT=7870
CAST_TTS=http://127.0.0.1:3910      # 任意实现了 POST /tts 的服务
CAST_CASTER=http://127.0.0.1:7861   # Crafting Caster（配乐/音效/出图）
CAST_CASTER_ROOT=~/AI-Studio        # 它的模型目录（要能读）
CAST_VOICECASTER=http://127.0.0.1:7864
CAST_VOICE_ROOT=../voicecaster      # 角色库目录
CAST_MIR=../my-songwriter           # MIR 引擎目录（带 *_adapter.sh）
CAST_VOICESTUDIO=http://127.0.0.1:3900   # 跨语种
CAST_SHEETSAGE=http://127.0.0.1:8001     # 音频转谱
CAST_SEEDVC=~/AI-Studio/seed-vc          # 换嗓子（Demucs + Seed-VC）
CAST_PY=python3                     # 要能 import numpy（转谱、量 BPM 用得到）
CAST_FFMPEG=/opt/homebrew/bin/ffmpeg
```

细节见 [`docs/BACKENDS.md`](docs/BACKENDS.md)。

---

## 三条硬原则（写在代码里，不是口号）

1. **先做声音，再做出图。** 声音是主轴：先把台词接成一条音轨、定下长度，图再跟着时间走。
2. **机器一次只跑一件。** 所有生成任务走一条队列、一个 worker。界面上看到「排队中」就是它
   在等前一个。这是给几年前的机器定的，不是效率问题。
3. **判断归人。** 够不够味、好不好听、值不值得重做，工具只负责量，不替你拍板。

---

## 接口

```
GET    /api/health                后端逐条状态 + 队列 + 作品目录
GET    /api/voices                音色列表（转发 TTS 服务）
GET    /api/voice-library         角色库 / 情绪标签 / 术语表
POST   /api/voice-preview         试听一个角色 → 直接回 wav
GET    /api/projects              作品列表
POST   /api/projects              新建 {name, kind}
GET    /api/projects/:id          读作品
PATCH  /api/projects/:id          改（scenes / theme / slides / script / marks / deckVoice…）
POST   /api/projects/:id/job      派任务 {type, params}   ← 所有活都从这里走
GET    /api/jobs/:id              查任务（progress / message / result / error）
GET    /api/queue                 队列
GET    /files/:id/<路径>           读素材（?dl 下载）
POST   /api/projects/:id/slides   放进 pptx（原始字节，?name=）
POST   /api/projects/:id/audio    放进音频（原始字节，?name=）
POST   /api/projects/:id/script   放进剧本（docx/pdf/txt/md）
POST   /api/projects/:id/video    放进视频（只用于对时间，不进成片）
POST   /api/projects/:id/studio   把 .abc 送进 MIR Studio 并打开
```

任务类型：`tts` / `music` / `sfx` / `image` / `song` / `voice_convert` / `transcribe` /
`score` / `analyze` / `handoff` / `audiotrack` / `deck_track` / `embed_deck` /
`export_package` / `crosslingual` / `render`。

几条常用的参数：

```jsonc
// 出歌：engine = yue2（带词唱、顺带出谱）/ heartmula（人声草稿）
{"type":"song","params":{"prompt":"slow folk, female vocal","lyrics":"…","title":"…","engine":"yue2"}}

// 出谱子：abc → MusicXML（可选调谱号、拆声部）。歌词不进谱。
{"type":"score","params":{"file":"assets/x.abc","ops":["clef","split"]}}

// 量一下：BPM + 响度
{"type":"analyze","params":{"source":"assets/x.wav"}}

// 送出去精修
{"type":"handoff","params":{"target":"ace","file":"assets/x.abc","title":"…"}}
```

---

## 开发期：不开 DSH 也能看界面

```sh
node server.mjs
open http://127.0.0.1:7870/preview-live.html
```

这一页把**真的** `dsh/client.js` 拿来、用真的 React 渲染一遍、接真的后端 ——
所以看到的就是面板里的样子。改完界面先在这儿看，不用来回重启 DSH。

---

## 已知限制

- 面板需要 **DSH**；离开 DSH 只有 HTTP 接口和预览页。
- 四条后端各自独立，任何一个不在，对应功能就停在那儿（会明说，不会假装）。
- 拼片用 ffmpeg；`CAST_FFMPEG` 不对时会报「找不到 ffmpeg」。
- 写 PowerPoint 要 python-pptx；`CAST_PY` 指的解释器缺它会报「读不到 pptunit」。
- 只在 macOS 上开发过。Linux/Windows 理论上服务部分能跑（用的是 Node 标准库），
  但面板、ffmpeg 路径、`open` 命令这些没验过。

## 许可

MIT，见 [LICENSE](LICENSE)。用到的模型各自有各自的许可（Stable Audio、SDXL、YuE2、
HeartMuLa、Demucs、Seed-VC、SheetSage2 等），那不是这个仓库发的。

---

## English (short)

**Casting Studio** turns text into audio-first media: slideshows, narrated decks,
radio plays and promos. It is a local Node service (`127.0.0.1:7870`) plus a panel
for DeepSeek Harness. It **schedules and assembles**; it does not contain any model.

You bring your own backends: a TTS service, Crafting Caster (Stable Audio / SDXL),
MIR (song + score engines) and VoiceCaster (character library). Missing backends are
reported honestly in `/api/health` and their UI simply says "not available" — the tool
never pretends to have succeeded.

Three principles: audio first, one job at a time, and the judgment stays with the human.
MIT licensed.
