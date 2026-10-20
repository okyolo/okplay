// 兜底：确保 Electron 的二进制存在。
//
// 为什么需要这个：
//   Electron 的 npm 包只装 JS 壳，真正的运行时（约 100~150 MB）由它自己的
//   postinstall 从 GitHub Releases 下载。实测在 npm 11 上，这个 postinstall
//   不会被触发 —— `npm i` 会报 "up to date" 并正常退出，但 dist/ 里什么都没有。
//   结果就是「装完了，但 electron 跑不起来」，而且没有任何报错。
//
//   所以这里在安装后自己检查一次；缺了就显式补下载。
//
// 镜像：优先用环境变量 ELECTRON_MIRROR；没设则回退到国内镜像。
//       要强制走 GitHub，运行时设 ELECTRON_MIRROR=https://github.com/electron/electron/releases/download/

import { existsSync, readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const electronDir = join(root, 'node_modules', 'electron');
const installScript = join(electronDir, 'install.js');
const pathFile = join(electronDir, 'path.txt');

if (!existsSync(installScript)) {
  // 还没装 electron（例如只装了别的依赖），不是错误。
  console.log('[ensure-electron] 未找到 electron 包，跳过');
  process.exit(0);
}

if (existsSync(pathFile)) {
  const relative = readFileSync(pathFile, 'utf8').trim();
  if (relative && existsSync(join(electronDir, 'dist', relative))) {
    console.log('[ensure-electron] Electron 二进制已就绪');
    process.exit(0);
  }
}

console.log('[ensure-electron] 未找到 Electron 二进制，开始下载（约 100~150 MB）…');

execFileSync(process.execPath, [installScript], {
  stdio: 'inherit',
  env: {
    ...process.env,
    ELECTRON_MIRROR:
      process.env.ELECTRON_MIRROR || 'https://registry.npmmirror.com/-/binary/electron/',
  },
});

if (!existsSync(pathFile)) {
  console.error('[ensure-electron] 下载后仍未找到 path.txt —— 安装未完成');
  process.exit(1);
}

console.log('[ensure-electron] 完成');
