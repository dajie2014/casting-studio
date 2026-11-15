#!/usr/bin/env python3
"""把一份 pptx 变成「每页要讲的话」。

**复用 VoiceCaster 的 pptunit**（`notes.py` 抽备注/正文，`split.py` 拆成一句一句能
单独播的课堂口语）。那两套规则是实测过的 —— 在这儿重写一套，迟早两边说的不一样。

规则要点（pptunit/备注写法.md）：
· 备注优先；这一页没备注就退到页面正文（按从上到下、从左到右读）
· 拆句只做清洗、切分、合并 —— **不新增一个字**
· 「接下来我们看下一页」这类翻页话直接扔掉（一页一页点，念出来多余）

用法：python3 pptx-notes.py 课件.pptx
输出：一行 JSON，[{index, notes, body, source, text, lines}]
出错：也输出一行 JSON `{"error": "..."}`，退出码非 0 —— 界面能照原话说给人听。
"""
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
# VoiceCaster 的 pptunit 默认放在**兄弟目录**（这条不抄进本项目：
# 讲稿提取和嵌回按钮的规则都在它那边，改一处两边一起变）。
PPTUNIT = os.environ.get('CAST_PPTUNIT') or os.path.join(HERE, '..', '..', 'voicecaster', 'pptunit')
sys.path.insert(0, PPTUNIT)

try:
    from notes import extract
    from split import split_notes
except Exception as e:                                    # 依赖没装/路径不对
    print(json.dumps({'error': f'读不到 pptunit（{PPTUNIT}）：{e}'}, ensure_ascii=False))
    sys.exit(3)

if len(sys.argv) < 2:
    print(json.dumps({'error': '没给 pptx 路径'}, ensure_ascii=False))
    sys.exit(2)

try:
    pages = extract(sys.argv[1])
except Exception as e:                                    # 加密/损坏/不是 pptx
    print(json.dumps({'error': f'这份 pptx 打不开：{e}'}, ensure_ascii=False))
    sys.exit(4)

out = []
for p in pages:
    text = (p.get('text') or '').strip()
    lines = []
    if text:
        try:
            lines, _src = split_notes(text)
        except Exception:
            lines = [text]                                # 拆句挂了也别丢整段
    out.append({
        'index': p['index'],
        'notes': p.get('notes') or '',
        'body': p.get('body') or '',
        'source': p.get('source') or 'empty',
        'text': text,
        'lines': lines,
    })

print(json.dumps(out, ensure_ascii=False))
