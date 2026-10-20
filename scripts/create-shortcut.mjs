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
 * 名字是 `okplay.lnk`（2026-10-21 由 `OKPlay-源码安装.lnk` 改来，与 macOS 的
 * `okplay.app` 对齐）。注意 Windows 文件名不区分大小写 —— 若同机装过打包版，
 * 打包版那个 `OKPlay.lnk` 是**同一个文件**，会被这里覆盖。
 *
 * ## macOS
 *
 * macOS 没有「快捷方式」这个概念，等价物是一个 `.app`。这里用 `osacompile`
 * 生成一个 AppleScript 小应用放到桌面：双击即启动，不弹终端窗口；
 * 图标取自 `src/assets/icon.png`（sips + iconutil 转 .icns）。
 *
 * 用法：npm run shortcut
 */

import { execFileSync } from 'node:child_process';
import { existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = dirname(dirname(fileURLToPath(import.meta.url)));

/**
 * 删掉同名旧文件再建。
 *
 * Windows 文件名不区分大小写：桌面上已有 `OKPlay.lnk` 时，写到 `okplay.lnk`
 * 会命中同一个文件、**保留原来的大小写**，用户看到的还是 `OKPlay.lnk`。
 * 先删掉，新文件才会用脚本里写的这个名字。
 */
function removeExisting(path) {
  try {
    if (existsSync(path)) rmSync(path, { force: true });
  } catch {
    // 删不掉就让 CreateShortcut 去覆盖，不额外报错。
  }
}

if (process.platform === 'darwin') {
  ensureBuild();
  createMacShortcut();
  process.exit(0);
}

if (process.platform !== 'win32') {
  console.error('目前只支持 Windows 与 macOS。其它平台直接用 `npm start`。');
  process.exit(1);
}

ensureBuild();

const electronExe = join(root, 'node_modules', 'electron', 'dist', 'electron.exe');
if (!existsSync(electronExe)) {
  console.error(`找不到 Electron 二进制：${electronExe}`);
  console.error('先跑 `npm install` 把依赖装好。');
  process.exit(1);
}

const icon = join(root, 'src', 'assets', 'icon.ico');
const lnk = join(process.env.USERPROFILE ?? '', 'Desktop', 'okplay.lnk');
removeExisting(lnk);

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


/**
 * 快捷方式指向 Electron 二进制，它加载的是 `dist/main/index.js`。
 * 只跑过 `npm install` 时 dist 还不存在 —— 双击会「没有窗口」，而且不报错
 * （macOS 上尤其难看出来：日志里只有一行 Electron 的 `Unable to find Electron app`）。
 * 所以建快捷方式之前先构建一次，把顺序依赖消掉。
 */
function ensureBuild() {
  console.log('检查构建产物（npm run build）…');

  /*
   * 走 `npm run build` 而不是自己拼 tsc 命令，免得以后构建脚本改了这里不同步。
   * `npm run shortcut` 启动时 npm 会给出 npm_execpath，用它避开 Windows 上
   * 直接 execFile('npm') 会 EINVAL 的坑。
   */
  const npmCli = process.env.npm_execpath;

  try {
    if (npmCli && /\.[cm]?js$/.test(npmCli)) {
      execFileSync(process.execPath, [npmCli, 'run', 'build'], { cwd: root, stdio: 'inherit' });
    } else {
      execFileSync('npm', ['run', 'build'], {
        cwd: root,
        stdio: 'inherit',
        shell: process.platform === 'win32',
      });
    }
  } catch {
    console.error('构建失败。先在这个目录跑 `npm run build`，看具体报错。');
    process.exit(1);
  }

  if (!existsSync(join(root, 'dist', 'main', 'index.js'))) {
    console.error('构建跑完了，但 dist/main/index.js 还是不存在。');
    process.exit(1);
  }
}


/**
 * macOS：在桌面生成一个 `okplay.app`。
 *
 * 启动方式与 Windows 快捷方式等价 —— 直接跑 Electron 二进制、把仓库根目录
 * 作为参数传进去（不经过 `npm start`，所以不会弹终端）。
 */
function createMacShortcut() {
  const electronApp = join(root, 'node_modules', 'electron', 'dist', 'Electron.app');
  if (!existsSync(electronApp)) {
    console.error(`找不到 Electron.app：${electronApp}`);
    console.error('先跑 `npm install` 把依赖装好。');
    process.exit(1);
  }

  const launcher = join(root, 'scripts', 'launch-mac.sh');
  const out = join(process.env.HOME ?? '', 'Desktop', 'okplay.app');
  const iconSrc = join(root, 'src', 'assets', 'icon.png');

  // 覆盖旧的：重复跑不该失败
  try { execFileSync('rm', ['-rf', out]); } catch { /* 不存在就算了 */ }

  /**
   * AppleScript 只做一件事：把启动脚本丢到后台。
   * `nohup ... &` 让 AppleScript 立刻返回，applet 自行退出，不会吊着。
   * 双引号与反斜杠按 AppleScript 字符串转义。
   */
  const shellCmd = `nohup "${launcher}" > /tmp/okplay-start.log 2>&1 &`;
  const escaped = shellCmd.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  const applescript = `do shell script "${escaped}"`;

  try {
    execFileSync('osacompile', ['-o', out, '-e', applescript], { stdio: 'inherit' });
  } catch {
    console.error('osacompile 失败：没能生成 .app。');
    process.exit(1);
  }

  // 图标：png → iconset → icns，贴到 applet 的 Resources/applet.icns
  if (existsSync(iconSrc)) {
    try {
      /*
       * ⚠️ 目录名**必须以 `.iconset` 结尾**，否则 iconutil 直接报
       * "Invalid Iconset" —— 之前叫 `.shortcut-iconset`，就是它导致图标永远是
       * AppleScript 的默认图标。放临时目录，别在仓库里留垃圾。
       */
      const iconset = join(tmpdir(), `okplay-shortcut-${process.pid}.iconset`);
      execFileSync('rm', ['-rf', iconset]);
      execFileSync('mkdir', ['-p', iconset]);
      /*
       * iconutil 只认标准文件名（16/32/128/256/512 各带 @2x）。
       * 别加 64 —— `icon_64x64.png` 不在标准集合里，iconutil 会整组拒绝。
       */
      for (const size of [16, 32, 128, 256, 512]) {
        execFileSync('sips', ['-z', String(size), String(size), iconSrc, '--out', join(iconset, `icon_${size}x${size}.png`)]);
        execFileSync('sips', ['-z', String(size * 2), String(size * 2), iconSrc, '--out', join(iconset, `icon_${size}x${size}@2x.png`)]);
      }
      const icns = join(tmpdir(), `okplay-shortcut-${process.pid}.icns`);
      execFileSync('iconutil', ['-c', 'icns', iconset, '-o', icns]);
      execFileSync('cp', [icns, join(out, 'Contents', 'Resources', 'applet.icns')]);
      execFileSync('rm', ['-rf', iconset, icns]);
      // 让 Finder 重新读图标（替换后 mtime 不变的话它会继续用缓存）
      execFileSync('touch', [out]);
    } catch (error) {
      console.warn(`图标生成失败，.app 仍可用（会用系统默认图标）：${error.message}`);
    }
  }

  console.log(`已在桌面创建：${out}`);
  console.log('双击即可启动（不弹终端）。');
  console.log('如果图标还是旧的：执行 killall Finder 刷新图标缓存。');
}
