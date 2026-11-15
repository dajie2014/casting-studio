#!/usr/bin/env python3
"""把已经念好的每页音频，嵌回课件里（每页右下角一个播放按钮）。

**复用 VoiceCaster 的 pptunit/embed.py** —— 那套 `add_movie` + 点击播放动画
是 2026-10-30 在真 PowerPoint 里实测过的。这儿不重写，只把它接到创作台的
页音频上（创作台用千问/角色库念，不必让 VoiceCaster 再念一遍）。

用法：
    python3 pptx-embed.py <源.pptx> <输出.pptx> <页音频映射.json>
页音频映射：{"3": "/abs/003.wav", "5": "/abs/005.mp3", ...}（键是页码，从 1 数）
输出：一行 JSON {"ok": true, "pages": 2, "skipped": [...]}；出错退出码非 0。

要点（照抄 VoiceCaster 的规矩，别改）：
· 播放按钮是**点了才响**（add_movie 默认 delay=indefinite）。
  用户 2026-10-30 明确讨厌自动播放，别加 autoplay。
· 重嵌一遍时先 strip_audio，把旧的按钮和 timing 清掉，不然会叠两层。
· 同一页的音频换了，按钮位置不变（右下角），页面其余内容一个字节都不动。
"""
import json
import os
import sys
import tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
# VoiceCaster 的 pptunit 默认放在**兄弟目录**（这条不抄进本项目：
# 讲稿提取和嵌回按钮的规则都在它那边，改一处两边一起变）。
PPTUNIT = os.environ.get('CAST_PPTUNIT') or os.path.join(HERE, '..', '..', 'voicecaster', 'pptunit')
sys.path.insert(0, PPTUNIT)

try:
    from pptx import Presentation
    from embed import make_icon, embed_slide, strip_audio
except Exception as e:
    print(json.dumps({'error': f'读不到 pptunit/embed（{PPTUNIT}）：{e}'}, ensure_ascii=False))
    sys.exit(3)


def main() -> int:
    if len(sys.argv) < 4:
        print(json.dumps({'error': '用法：pptx-embed.py 源.pptx 输出.pptx 映射.json'}, ensure_ascii=False))
        return 2
    src, out, mapfile = sys.argv[1], sys.argv[2], sys.argv[3]
    if not os.path.exists(src):
        print(json.dumps({'error': f'源课件不见了：{src}'}, ensure_ascii=False))
        return 4
    with open(mapfile, encoding='utf-8') as f:
        audio = {str(k): v for k, v in json.load(f).items()}
    if not audio:
        print(json.dumps({'error': '一页音频都没有'}, ensure_ascii=False))
        return 5

    try:
        prs = Presentation(src)
    except Exception as e:
        print(json.dumps({'error': f'这份 pptx 打不开：{e}'}, ensure_ascii=False))
        return 6

    icon = os.path.join(tempfile.mkdtemp(prefix='cs-embed-'), 'play_icon.png')
    make_icon(icon)

    done, skipped = [], []
    slides = list(prs.slides)
    for idx, slide in enumerate(slides, start=1):
        path = audio.get(str(idx))
        if not path or not os.path.exists(path):
            skipped.append(idx)
            continue
        try:
            strip_audio(slide)                       # 重嵌时先清旧的
            embed_slide(slide, path, icon, prs.slide_width, prs.slide_height,
                        f'slide{idx:03d}')
            done.append(idx)
        except Exception as e:
            skipped.append(idx)
            print(f'[embed] 第 {idx} 页失败：{e}', file=sys.stderr)

    prs.save(out)
    print(json.dumps({'ok': True, 'pages': len(done), 'embedded': done,
                      'skipped': skipped}, ensure_ascii=False))
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
