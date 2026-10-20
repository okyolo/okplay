/**
 * 源码安装用：在桌面创建 OKPlay 快捷方式。
 *
 * ## 为什么源码安装需要单独一个脚本
 *
 * 打包安装版由 nsis 建快捷方式，免安装版（zip）里有 `创建桌面快捷方式.bat`。
 * 源码安装两者都没有 —— `npm start` 只是个命令，桌面不会多出任何东西。
 * 这个脚本补上那一环。
 *
 * ## 它建的快捷方式指向什么
 *
 * 不指向 `npm start`（那会弹一个黑色控制台窗口）。直接指向 Electron 二进制，
 * 把仓库根目录当参数传给它 —— 效果与 `npm start` 相同，但没有控制台窗口。
 *
 *   Target   node_modules/electron/dist/electron.exe
 *   Args     "<仓库根目录>"
 *   WorkDir  <仓库根目录>
 *   Icon     src/assets/icon.ico
 *
 * 名字带「源码安装」四个字，**不会覆盖**打包版建的那个 `OKPlay.lnk`。
 *
 * 用法：npm run shortcut
 */

import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = dirname(dirname(fileURLToPath(import.meta.url)));

if (process.platform !== 'win32') {
  console.error('这个脚本只做 Windows 快捷方式。macOS 直接用 `npm start`。');
  process.exit(1);
}

const electronExe = join(root, 'node_modules', 'electron', 'dist', 'electron.exe');
if (!existsSync(electronExe)) {
  console.error(`找不到 Electron 二进制：${electronExe}`);
  console.error('先跑 `npm install` 把依赖装好。');
  process.exit(1);
}

const icon = join(root, 'src', 'assets', 'icon.ico');
const lnk = join(process.env.USERPROFILE ?? '', 'Desktop', 'OKPlay-源码安装.lnk');

/**
 * 交给 PowerShell 建 .lnk。
 *
 * 参数用**单引号**包住并转义内部的单引号 —— 路径里可能有空格或中文，
 * 拼错一个字符 Windows 就找不到目标。
 */
const q = (s) => `'${s.replace(/'/g, "''")}'`;

const script = [
  '$w = New-Object -ComObject WScript.Shell',
  `$s = $w.CreateShortcut(${q(lnk)})`,
  `$s.TargetPath = ${q(electronExe)}`,
  `$s.Arguments = ${q(`"${root}"`)}`,
  `$s.WorkingDirectory = ${q(root)}`,
  ...(existsSync(icon) ? [`$s.IconLocation = ${q(`${icon},0`)}`] : []),
  `$s.Description = ${q('OKPlay（源码安装）')}`,
  '$s.Save()',
].join('; ');

try {
  execFileSync('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', script], {
    stdio: 'inherit',
  });
} catch {
  console.error('创建快捷方式失败。可以手动来：右键 electron.exe - 发送到 - 桌面快捷方式');
  process.exit(1);
}

if (!existsSync(lnk)) {
  console.error('脚本跑完了，但桌面上没出现快捷方式。');
  process.exit(1);
}

console.log(`已在桌面创建：${lnk}`);
console.log('双击即可启动 OKPlay（不需要开终端）。');
