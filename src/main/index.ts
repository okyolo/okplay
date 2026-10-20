import { existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { app, BrowserWindow, net } from 'electron';

import { APP_ID, APP_NAME } from '../shared/contracts';
import { resolveConfig } from './config';
import { registerIpcHandlers } from './ipc';
import { applyFailoverPolicy, showOfflinePage } from './lifecycle/failover';
import { registerAssetScheme } from './localAssets';
import { log } from './log';
import { createMainWindow } from './window';

// ────────────────────────────────────────────────────────────────
// 必须在任何 app.getPath('userData') 之前完成。
//
// 不设 setName 的话，macOS 上运行的未打包 Electron 会把应用名读成
// "Electron"，于是 userData 落到 ~/Library/Application Support/Electron，
// 和机器上其它未打包 Electron 应用互相覆盖。
// ────────────────────────────────────────────────────────────────
app.setName(APP_NAME);

if (!app.isPackaged) {
  // 开发态与打包态用不同的 userData —— 否则 requestSingleInstanceLock 会互斥，
  // 出现过「打包版开着，源码版就起不来」这种莫名其妙的现象。
  const devUserData = join(app.getPath('appData'), `${APP_NAME}-dev`);
  mkdirSync(devUserData, { recursive: true });
  app.setPath('userData', devUserData);
}

// Windows 任务栏归组与通知标识。
app.setAppUserModelId(APP_ID);

// 本地媒体用的自定义 scheme。**必须在 whenReady 之前注册**，这是 Electron 的硬性要求。
registerAssetScheme();

// macOS 的 Dock 图标不来自 BrowserWindow，得单独设。
// 打包后由 app bundle 提供；这里处理的是开发态（跑的是 Electron 自己的图标）。
if (process.platform === 'darwin') {
  const dockIcon = join(__dirname, '..', 'assets', 'icon.png');
  if (existsSync(dockIcon)) {
    try {
      app.dock?.setIcon(dockIcon);
    } catch (error) {
      log.warn('设置 Dock 图标失败', { message: (error as Error).message });
    }
  }
}

const config = resolveConfig();

let mainWindow: BrowserWindow | null = null;

function focusExistingWindow(): void {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.focus();
}

/** 探测云端是否可达。拿到响应就算通；抛异常才算不通。 */
async function probeReachable(url: string): Promise<boolean> {
  try {
    await net.fetch(url, { method: 'GET', signal: AbortSignal.timeout(3000) });
    return true;
  } catch (error) {
    log.warn('连通性探测失败', { url, message: (error as Error).message });
    return false;
  }
}

async function bootstrap(): Promise<void> {
  log.info('启动', {
    version: app.getVersion(),
    packaged: app.isPackaged,
    origin: config.origin,
    userData: app.getPath('userData'),
  });

  mainWindow = createMainWindow(config);
  applyFailoverPolicy(mainWindow);
  registerIpcHandlers(config, () => mainWindow);

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  const reachable = await probeReachable(config.healthUrl);
  if (!reachable) {
    showOfflinePage(mainWindow, '无法连接 OKPlay 服务', `地址：${config.origin}`);
    return;
  }

  /*
   * 失败界面交给 `did-fail-load` 统一处理（见 lifecycle/failover.ts）——
   * 同一个失败会**同时**让 loadURL 的 promise 拒绝、触发 did-fail-load，
   * 这里再画一次离线页就是重复导航（文案还不一样）。此处只补一条日志。
   */
  await mainWindow.loadURL(config.pageUrl).catch((error: Error) => {
    log.error('加载课程页面失败', { message: error.message });
  });
}

// 单实例：重复启动时激活已有窗口，不新开一个。
if (!app.requestSingleInstanceLock()) {
  log.info('已有实例在运行，本次启动退出');
  app.quit();
} else {
  app.on('second-instance', focusExistingWindow);

  /*
   * `activate` **必须在 ready 之后才注册**。
   *
   * macOS 上在 ready 之前挂监听，事件根本不会送达（Electron 已知问题，
   * electron-quick-start #382）—— 表现就是：关掉窗口后点 Dock 图标没反应，
   * 只能退出重开。源码安装的 Electron 不走 LaunchServices，更容易踩到。
   */
  void app.whenReady().then(() => {
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) void bootstrap();
      else focusExistingWindow();
    });

    return bootstrap();
  });

  app.on('window-all-closed', () => {
    // macOS 习惯：关掉窗口不等于退出应用。
    if (process.platform !== 'darwin') app.quit();
  });
}
