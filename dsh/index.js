// 创作台插件的 Host 侧。
// 界面在 client.js；这里只做一件事：**保证后端服务活着**。
// DSH 一开着，创作台服务就在；服务本来就在跑的话不会重复起。
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SERVER = path.resolve(HERE, '..', 'server.mjs');
const HEALTH = 'http://127.0.0.1:7870/api/health';

async function alive() {
  try {
    const r = await fetch(HEALTH, { signal: AbortSignal.timeout(1200) });
    return r.ok;
  } catch {
    return false;
  }
}

export function apply(ctx) {
  ctx.effect(() => {
    let stopped = false;
    (async () => {
      if (!existsSync(SERVER)) return;
      if (await alive() || stopped) return;
      const child = spawn(process.execPath, [SERVER], {
        cwd: path.dirname(SERVER),
        detached: true,
        stdio: 'ignore',
      });
      child.unref();
    })();
    return () => { stopped = true; };   // 只取消这次启动，不杀已经在跑的服务
  });
}
