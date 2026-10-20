// 把客户端**自带**的静态资源复制到 dist/。
//
// 两处：
//   src/renderer-local/ → dist/renderer-local/   离线错误页（唯一自带的 HTML）
//   src/assets/         → dist/assets/           应用图标等运行时资源
//
// tsc 只处理 .ts，这些文件不会被自动带上，所以要显式复制。

import { cpSync, existsSync, mkdirSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = dirname(dirname(fileURLToPath(import.meta.url)));

/** @type {Array<[string, string]>} */
const COPIES = [
  ['renderer-local', 'renderer-local'],
  ['assets', 'assets'],
];

let copied = 0;

for (const [fromName, toName] of COPIES) {
  const from = join(root, 'src', fromName);
  const to = join(root, 'dist', toName);

  if (!existsSync(from)) {
    console.log(`[copy-static] 无 src/${fromName}，跳过`);
    continue;
  }

  mkdirSync(to, { recursive: true });
  cpSync(from, to, { recursive: true });
  const count = readdirSync(from).length;
  copied += count;
  console.log(`[copy-static] ${count} 个文件 -> dist/${toName}`);
}

if (copied === 0) console.log('[copy-static] 没有可复制的静态资源');
