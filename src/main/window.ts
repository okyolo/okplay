import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { app, BrowserWindow, session } from 'electron';

import {
  APP_NAME,
  BRIDGE_NAME,
  IPC,
  LOCAL_LOGIN_VIDEO,
  SESSION_PARTITION,
  type BridgeContract,
  type PlatformInfo,
} from '../shared/contracts';
import { isDevMode, type AppConfig } from './config';
import { applyLocalAssetProtocol } from './localAssets';
import { log } from './log';
import { applyHeaderPolicy } from './security/headers';
import { applyNavigationPolicy } from './security/navigation';
import { applyPermissionPolicy } from './security/permissions';

/**
 * 生产环境吞掉打开开发者工具的快捷键。注意：这挡不住改本地文件的人。
 * `F12` 不在这里 —— 它在下面单独判（不带修饰键也要挡）。
 */
const DEVTOOLS_SHORTCUTS = new Set(['I', 'J', 'C']);

/**
 * session 级的一次性设置：权限、请求头注入、本地资源协议。
 *
 * **必须只做一次。** `protocol.handle()` 重复注册会抛
 * `Failed to register protocol` —— 而它原来在 `createMainWindow()` 里。
 * macOS 关窗后点 Dock 图标会再跑一遍 `bootstrap()`，异常发生在
 * `new BrowserWindow()` **之前**，于是窗口永远建不起来（2026-10-21 实测）。
 */
export function setupSession(config: AppConfig): void {
  const partition = session.fromPartition(SESSION_PARTITION);
  applyPermissionPolicy(partition);
  applyHeaderPolicy(partition, config);
  applyLocalAssetProtocol(partition);
}

export function createMainWindow(config: AppConfig): BrowserWindow {
  // 与 origin 的判据保持一致：**只有 `--dev` 才是开发模式**（见 config.ts 的 isDevMode）。
  // 源码安装同样没打包，但它是给学员用的 —— 不该默认开 devtools。
  const devMode = isDevMode();

  // 平台信息由主进程算好，通过 additionalArguments 传给 preload。
  // 为什么不在 preload 里现算：sandbox: true 时 preload 的 `process` 只是
  // 受限子集，能读哪些字段随 Electron 版本变化。传值比读 API 稳。
  const platformInfo: PlatformInfo = {
    appVersion: app.getVersion(),
    electronVersion: process.versions.electron ?? '',
    chromeVersion: process.versions.chrome ?? '',
    platform: process.platform,
    isPackaged: app.isPackaged,
  };

  // 运行时图标由 scripts/copy-static.mjs 复制到 dist/assets/。
  // Windows 用 .ico（系统按尺寸自己挑），其它平台用 .png。
  const iconPath = join(__dirname, '..', 'assets', process.platform === 'win32' ? 'icon.ico' : 'icon.png');
  const icon = existsSync(iconPath) ? iconPath : undefined;

  const win = new BrowserWindow({
    ...(icon ? { icon } : {}),
    /*
     * 默认 1400 宽（用户 2026-10-18；原 1280）：1280 时正文只有 1169px、
     * 5 列卡片窄 23px，稍长的课程标题会折成两行 —— 浏览器端却是一行。
     * 1400 与浏览器端常见的窗口宽度更接近。
     */
    width: 1400,
    height: 820,
    minWidth: 900,
    minHeight: 600,
    show: false,
    backgroundColor: '#05010d',
    title: APP_NAME,
    autoHideMenuBar: true,
    webPreferences: {
      // ── 以下每项都显式写死，不依赖 Electron 的默认值 ──
      // 默认值会随 Electron 大版本变化，而我们要的是「升级时行为不变」。
      contextIsolation: true,
      nodeIntegration: false,
      nodeIntegrationInSubFrames: false,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
      experimentalFeatures: false,
      webviewTag: false,
      spellcheck: false,
      devTools: devMode,

      partition: SESSION_PARTITION,
      preload: join(__dirname, '..', 'preload', 'index.js'),
      // 沙箱下 preload 不能 require 相对模块，所以这两样都得走 argv 传进去。
      // 见 shared/contracts.ts 里 BridgeContract 的说明。
      additionalArguments: [
        `--okplay-platform=${JSON.stringify(platformInfo)}`,
        `--okplay-bridge=${JSON.stringify({
          name: BRIDGE_NAME,
          ipc: IPC,
          loginVideo: LOCAL_LOGIN_VIDEO,
        } satisfies BridgeContract)}`,
      ],
    },
  });

  applyNavigationPolicy(win.webContents, config);

  /**
   * 鼠标上的「前进 / 后退」侧键。
   *
   * Windows 和 Linux 上 Chromium 把它们报成 app command，而 Electron
   * **默认什么都不做** —— 不接就是两个死键。
   *
   * 不需要和渲染进程通信：课程页面用 History API 把自己的界面栈压进了
   * 浏览器历史（见 web/src/App.tsx 的 commit），所以走 webContents 自己的
   * 历史即可，按完页面里的 ← → 状态也是对的。
   *
   * **用 goToOffset 而不是 goBack / goForward。** 这是实测出来的坑，不是偏好：
   * Electron 44 的 `goBack()` 内部会先问 `canGoBack()`，而 `canGoBack()` 对
   * **同一文档内的 pushState 条目恒返回 false** —— `length()` 和 `getActiveIndex()`
   * 都如实增长，唯独它撒谎。结果就是 `goBack()` 静默地什么都不干。
   * `goToOffset(-1)` / `goToOffset(1)` 不走那个检查，实测正常。
   */
  win.on('app-command', (_event, command) => {
    const history = win.webContents.navigationHistory;
    if (command === 'browser-backward') history.goToOffset(-1);
    else if (command === 'browser-forward') history.goToOffset(1);
  });

  /**
   * 键盘的前进 / 后退：Alt+← / Alt+→。
   *
   * 学员端顶栏那两颗箭头 2026-10-18 去掉了（用户要求），但历史功能要留着 ——
   * 浏览器里 Alt+←/→ 是浏览器外壳那层的快捷键，Electron 没有那层 UI，
   * 所以要在这里自己接一条。走的是和鼠标侧键同一个入口（`goToOffset`），
   * 理由见上面那段注释。
   *
   * `preventDefault` 顺手挡掉：将来某个 Electron 版本若自带同名处理，
   * 不至于一次连退两屏。
   */
  win.webContents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown' || !input.alt || input.control || input.meta) return;
    const history = win.webContents.navigationHistory;
    if (input.key === 'ArrowLeft') {
      event.preventDefault();
      history.goToOffset(-1);
    } else if (input.key === 'ArrowRight') {
      event.preventDefault();
      history.goToOffset(1);
    }
  });

  // 远程页面会用自己的 <title> 覆盖窗口标题 —— 那样标题栏就成了「OK基地课程播放器」，
  // 而不是产品名。这里拦掉这个事件，让窗口标题始终是 APP_NAME。
  win.on('page-title-updated', (event) => {
    event.preventDefault();
    win.setTitle(APP_NAME);
  });
  win.setTitle(APP_NAME);

  if (!devMode) {
    win.webContents.on('before-input-event', (event, input) => {
      if (input.type !== 'keyDown') return;
      const key = input.key.length === 1 ? input.key.toUpperCase() : input.key;
      const withModifier = process.platform === 'darwin' ? input.meta : input.control;
      if (key === 'F12') event.preventDefault();
      else if (withModifier && input.shift && DEVTOOLS_SHORTCUTS.has(key)) event.preventDefault();
    });

    // 开发者工具一旦被打开就关掉。同样是提高门槛，不是边界。
    win.webContents.on('devtools-opened', () => {
      win.webContents.closeDevTools();
      log.warn('已关闭开发者工具');
    });
  }

  win.once('ready-to-show', () => {
    win.show();
    log.info('窗口已显示', { devMode });
  });

  return win;
}

// 安全基线的断言不在运行时做，而是由 scripts/check-security-baseline.mjs
// 对**源码**做静态检查 —— 断言代码本身，比断言运行时状态更难被绕过。
// 见 npm run verify。
