#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""念之前先修一遍发音。

中文里夹的外语术语（Allegro、Dorico）紧贴汉字时，TTS 会按中文语流把它们
吞掉，念成"汉字注音式"的怪音。VoiceCaster 早就解决了这件事：
`voicecaster/pptunit/glossary.py` 会在术语两侧加逗号断开，让模型把它当
独立的外语词读。

★ 这边**不重写规则**，直接 import 它 —— 两边同步的铁律（ROADMAP「两边同步」）。

用法：
    python3 say-fix.py "这一段的 Allegro 要弹得干脆"
    echo "..." | python3 say-fix.py
输出（一行 JSON）：
    {"text": "这一段的，Allegro，要弹得干脆", "hits": ["Allegro"], "ok": true}
读不到术语表时 ok:false、text 原样返回 —— 念白不能因为术语表坏了就停。

环境变量：
    CAST_VOICE_ROOT   VoiceCaster 目录，默认 <本项目>/../voicecaster
"""
import json
import os
import sys
import importlib.util


def main() -> int:
    here = os.path.dirname(os.path.abspath(__file__))
    root = os.environ.get("CAST_VOICE_ROOT") or os.path.join(here, "..", "..", "voicecaster")
    root = os.path.abspath(root)

    raw = " ".join(sys.argv[1:]) if len(sys.argv) > 1 else sys.stdin.read()
    text = (raw or "").strip()
    if not text:
        print(json.dumps({"ok": False, "text": "", "hits": [], "why": "没有要念的字"}, ensure_ascii=False))
        return 0

    mod_path = os.path.join(root, "pptunit", "glossary.py")
    if not os.path.exists(mod_path):
        print(json.dumps({"ok": False, "text": text, "hits": [],
                          "why": "找不到术语表规则：%s" % mod_path}, ensure_ascii=False))
        return 0

    try:
        spec = importlib.util.spec_from_file_location("vc_glossary", mod_path)
        g = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(g)
    except Exception as e:                       # 规则坏了也不能拦住念白
        print(json.dumps({"ok": False, "text": text, "hits": [],
                          "why": "术语规则加载失败：%s" % e}, ensure_ascii=False))
        return 0

    try:
        data = g.load()                          # 默认读 pptunit/glossary.json
        terms = data.get("terms") or []
        if not terms:
            print(json.dumps({"ok": True, "text": text, "hits": [],
                              "why": "术语表是空的"}, ensure_ascii=False))
            return 0
        fixed, hits = g.apply(text, terms)
        print(json.dumps({"ok": True, "text": fixed, "hits": hits},
                         ensure_ascii=False))
    except Exception as e:
        print(json.dumps({"ok": False, "text": text, "hits": [],
                          "why": "术语处理失败：%s" % e}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
