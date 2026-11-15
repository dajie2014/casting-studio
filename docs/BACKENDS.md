# 四条后端：各是什么、怎么接

创作台自己不出声、不出画、不出谱。它只做三件事：**排队、搬运、拼装**。
下面四条是它伸手去够的东西，全都不在这个仓库里。

---

## 1. TTS —— 念台词、旁白

**接口契约（最小）**

```
POST /tts
{ "text": "要念的字", "voice": "音色名", "lang": "zh", "speed": 1.0, "instruct": "情绪或语气（可选）" }
→ 200, body: audio/wav 二进制
```

创作台会：

- 先过一遍**术语读音**（`tools/say-fix.py`，需要 VoiceCaster 的 `pptunit/glossary.py`；
  读不到就原样念，不拦）；
- 把结果存成 `assets/vo-*.wav`，48k 立体声重采样由 ffmpeg 来做。

**环境变量**：`CAST_TTS`（默认 `http://127.0.0.1:3910`）
**音色列表**：`GET /health` 里要返回 `{"voices": ["…"]}`。

任何能走这个契约的 TTS 都行（本机跑的几个、云上的都试过）。

---

## 2. Crafting Caster —— 配乐 / 音效 / 出图

**接口契约**

```
POST /api/health                     探活，可带回 loras 列表
POST /api/generate  { mode: "music"|"fx"|"fast", prompt, seconds, seed? }   → { file, … }
POST /api/draw      { prompt, style, width, height, lora?, lora_weight? }    → { file, … }
```

产物写到它自己的 `output/` 下，创作台按返回的路径去取，再拷进作品目录。

**环境变量**：`CAST_CASTER`（默认 `http://127.0.0.1:7861`）、
`CAST_CASTER_ROOT`（模型目录，默认 `~/AI-Studio`）。

任何实现了这三个接口、背后是 Stable Audio / SDXL 之类的服务都能替。

---

## 3. MIR —— 出歌、出谱、换嗓子、谱面工具

MIR 的引擎都用**同一套适配器契约**：

```
bash <adapter>.sh --params <参数.json> [--out-dir <目录>] --progress <progress.json>
退出码 0 成功；参数错 2；模型加载失败 3；生成失败 5；超时 6；缺环境 7
```

`params.json` 与 `progress.json` 的格式见 MIR 自己的文档。创作台用到的：

| 脚本 | 干什么 | 认的参数 |
|---|---|---|
| `yue2_adapter.sh` | 带词唱（先写谱再照谱唱，产 flac + abc） | `prompt` / `lyrics` / `title` / `seed` / `bpm` |
| `heartmula_adapter.sh` | 人声草稿机 | 上一行 + `duration`（上限，秒） |
| `voice_convert_adapter.sh` | 换嗓子（Demucs → Seed-VC → 合回伴奏） | `source` / `target` / `out_dir` ⚠️ 只吃 `--params`、`--progress`，输出目录从 `params.json` 读 |
| `scripts/abc2xml` 那套 & `fix_score_clef.py` / `split_score_parts.py` | ABC → MusicXML、调谱号、拆声部 | 命令行参数 |
| `scripts/push_to_ace.py` / `push_to_live.py` | 送 ACE Studio / Ableton Live | 命令行参数 |

**环境变量**：`CAST_MIR`（默认 `../my-songwriter`）、`CAST_ABC2XML`（转换器路径）。

**MIR Studio（可选）**：改谱、看简谱、导出 PDF 的那个本机网页（默认 `127.0.0.1:8808`）。
把它放在 `../mi-studio`，创作台会在需要时自己拉起来；用 `CAST_MI_STUDIO` /
`CAST_MI_STUDIO_URL` 改位置。

---

## 4. VoiceCaster —— 角色库、情绪、术语、剧本、导出包

**接口契约（用到的部分）**

```
GET  /api/characters                    角色卡列表
POST /api/characters/<id>/say           用这张卡念 { text, emotion } → { url, engine }
GET  /api/emotions                      情绪标签
GET|POST /api/ppt/glossary              专业词读音表
POST /api/import/text                   读剧本原文
POST /api/parse                         拆行 + 人物名匹配
POST /api/export/package                导出包（分句 + Manifest + SRT + 分轨）
```

另外直接用它的 python 模块：

- `pptunit/notes.py` + `pptunit/split.py` —— 从 pptx 抽讲稿（备注优先）
- `pptunit/embed.py` —— 把念好的音频嵌回 pptx（每页一个播放按钮）
- `pptunit/glossary.py` —— 术语在两侧断开，好让 TTS 当外语词读

**环境变量**：`CAST_VOICECASTER`（默认 `http://127.0.0.1:7864`）、
`CAST_VOICE_ROOT`（默认 `../voicecaster`）、`CAST_PPTUNIT`（默认 `../voicecaster/pptunit`）。

**为什么都调它、不抄一份**：这些规则（备注优先、按句拆、人物名模糊匹配但绝不自动建角色、
术语表）都是在 VoiceCaster 里一件件改出来的。抄一份就等于两个真相，迟早不一致。

---

## 缺后端时会发生什么（这是设计，不是 bug）

| 缺什么 | 表现 |
|---|---|
| TTS | `/api/health` 的 `backends.tts=false`；念白按钮会说「念不了」 |
| Crafting Caster | 配乐 / 音效 / 出图报错并说明是哪条后端不在 |
| MIR | 主题歌、换嗓子、转谱、出谱子的入口会禁用或明说「引擎不在」 |
| VoiceCaster | 「谁念」只剩内置音色；导出包、剧本解析、课件嵌回会说明不可用 |
| MIR Studio | 「在 MIR Studio 里打开」会说明网页服务起不来 |

**任何一条都不会"看起来成功、其实没做"。** 这条是这个项目的底线。
