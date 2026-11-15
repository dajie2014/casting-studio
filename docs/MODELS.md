# 用到的模型：出处、许可、怎么换成你自己的

创作台**不含任何模型**。下面这些是作者本机实际用的那一套，写出来是为了两件事：

1. **出处能查到** —— 不给"某个不知名的本地模型"这种含糊说法；
2. **能换** —— 每条都说明了替换点。你手上有什么就用什么，不必跟作者一样。

> ⚠️ **一句话先说清楚**：这个仓库是 MIT，但**下面这些模型不是**。
> 商用、二次分发、放进产品里之前，请按各自的许可自己确认。
> 下面写的许可只是作者查到的当时状态，**以各自官方仓库为准**。

---

## 一、出歌（MIR 那条线）

| 模型 | 在本项目里干什么 | 出处 | 许可（以仓库为准） |
|---|---|---|---|
| **YuE / YuE2** | 带词唱：先写谱、再照谱唱；出音频 + ABC 谱 + MusicXML | [multimodal-art-projection/YuE](https://github.com/multimodal-art-projection/YuE) · [YuE2 项目页](https://map-yue2.github.io/) | 见仓库 |
| **HeartMuLa 3B** | 人声/词草稿机：旋律与人声干净，伴奏偏薄 | [HeartMuLa/heartlib](https://github.com/HeartMuLa/heartlib) · [HF: HeartMuLa-oss-3B](https://huggingface.co/HeartMuLa/HeartMuLa-oss-3B) | Apache-2.0 |
| **audio.cpp**（HeartMuLa 的 GGUF 量化运行时） | 不装 Python/CUDA 也能在 Mac 上跑 HeartMuLa | [0xShug0/audio.cpp](https://github.com/0xShug0/audio.cpp) | 见仓库 |
| **ACE-Step 1.5** | 纯器乐（作者后来拆掉了，省硬盘；代码里已不再列它） | [ace-step/ace-step-1.5](https://github.com/ace-step/ace-step-1.5) | Apache-2.0 |
| **Stable Audio** | 配乐 / 音效（走 Crafting Caster 那条服务） | [Stability-AI/stable-audio-tools](https://github.com/Stability-AI/stable-audio-tools) | 见仓库（Stability 社区许可） |

**怎么换**：创作台只认**适配器契约** ——
`bash <adapter>.sh --params 参数.json [--out-dir 目录] --progress 进度.json`，
退出码 0/2/3/5/6/7 分别表示成功/参数错/模型加载失败/生成失败/超时/缺环境。
你自己写一个脚本，把某个模型的推理包在这层壳里，就能挂进「慢档用哪台引擎」。
`CAST_MIR` 指到你的目录即可。

---

## 二、出谱、量、换嗓子

| 模型/工具 | 在本项目里干什么 | 出处 | 许可 |
|---|---|---|---|
| **SheetSage2** | 音频 → 谱子（旋律、和弦、段落、BPM） | [HF: m-a-p/SheetSage2](https://huggingface.co/m-a-p/SheetSage2)（基于 [MERT-v2-FullSong](https://huggingface.co/m-a-p/MERT-v2-FullSong)） | ⚠️ **CC BY-NC 4.0：非商业**。要商用请自己去拿授权 |
| **abc2xml** | ABC 谱 → MusicXML（给 Dorico / MuseScore / ACE 用） | [abc2xml 项目](https://wim.vree.org/svgParse/abc2xml.html) | 见项目页 |
| **Demucs** | 换嗓子时先把人声和伴奏拆开 | [facebookresearch/demucs](https://github.com/facebookresearch/demucs) | MIT |
| **Seed-VC** | 换嗓子：按一段参考录音把音色换过去 | [Plachtaa/seed-vc](https://github.com/Plachtaa/seed-vc) | 见仓库 |
| **ffmpeg** | 拼接、重采样、数响度（ebur128）、拼片 | [ffmpeg.org](https://ffmpeg.org/) | LGPL/GPL，取决于构建 |

**怎么换**：
- 转谱：`CAST_SHEETSAGE` 指到你自己的转谱服务（HTTP `POST /transcribe`，收 `audio_path`）；
- 换嗓子：`CAST_SEEDVC` 指到你的引擎目录；
- 量 BPM：默认调 MIR 的 `detect_bpm.py`（自相关算法）；只想换算法就在 MIR 那边换脚本；
- 出谱面：`CAST_ABC2XML` 指到你自己的转换器。

---

## 三、出图

| 模型 | 干什么 | 出处 | 许可 |
|---|---|---|---|
| **Stable Diffusion XL** | 给每个镜头出图 | [stabilityai/stable-diffusion-xl-base-1.0](https://huggingface.co/stabilityai/stable-diffusion-xl-base-1.0) | CreativeML Open RAIL++-M（有使用条款，自己看） |
| **LoRA**（可选） | 角色一致性：训练一个角色包，出图时带上就认人 | 作者是用上面的 SDXL 自训的 | 你自己训练的，自己定 |

**怎么换**：`CAST_CASTER` 指向任何实现了 `/api/draw` 的服务
（`{prompt, style, width, height, lora?, lora_weight?}` → `{file}`）。
换成 ComfyUI、别的 SD 模型、甚至云服务，只要能对上这个接口。

---

## 四、念白 / 跨语种

| 用什么 | 干什么 | 说明 |
|---|---|---|
| **任意 TTS 服务** | 念台词、旁白 | 契约：`POST /tts {text, voice, lang, speed, instruct?}` → wav |
| 作者本机用的 | 千问系 TTS | 自己部署在本机，不在这个仓库里 |
| **VoiceStudio（OmniVoice）** | 跨语种：同一个嗓子去说英/日/西/阿/德/法/韩 | 零训练换语言，`CAST_VOICESTUDIO` |
| **角色库（VoiceCaster）** | 多角色、克隆声、情绪标签 | 它自己可以接 IndexTTS / VoxCPM / OmniVoice 等引擎 |

**怎么换**：`CAST_TTS` 换成任何能走上面那个契约的服务。
音色列表由那个服务自己的 `/health` 给出 —— 创作台不硬编码任何音色名。

---

## 五、作者没说"你必须一样"的地方（重要）

- **模型大小、显存、速度**：作者是在一台几年前的 Mac 上跑的，所以整个项目按"一次只跑一件、
  串行队列"来设计。你机器更好的话，队列照样能用，只是等得少。
- **哪些后端装、哪些不装**：全都可以省。缺哪条，`/api/health` 就报哪条 `false`，
  界面里对应的入口会禁用或明说 —— 不会假装成功。
- **语言**：界面和提示是中文；TTS 那条线支持哪些语言，取决于你接的那个 TTS。

## 六、如果要在产品里用

1. 逐个模型看许可（尤其 **SheetSage2 是 CC BY-NC，非商业**）；
2. 本项目代码是 MIT，你可以改、可以闭源分发**代码**，但**模型不跟着 MIT 走**；
3. 别把模型的权重塞进这个仓库再发出去 —— 那要按模型自己的条款来。
