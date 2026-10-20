import { app, ipcMain, shell, type BrowserWindow } from 'electron';

import { IPC } from '../shared/contracts';
import type { AppConfig } from './config';
import { log } from './log';
import { parseHttpsUrl } from './security/url';
import { checkForUpdate } from './updater';

/**
 * IPC 白名单。**逐条显式注册，不用通配。**
 *
 * 判定准则（PRD §14 NFR-SEC-006A）：即使攻击者拿到页面 JS 执行权、
 * 把这些通道全调一遍，也不产生额外损失。所以这里**不做任何授权判定** ——
 * 「是否登录」「是否有课程权限」全部由服务端回答。
 */
export function registerIpcHandlers(config: AppConfig, getWindow: () => BrowserWindow | null): void {
  ipcMain.handle(IPC.openExternal, async (_event, rawUrl: unknown) => {
    const target = parseHttpsUrl(rawUrl);
    if (!target) {
      log.warn('拒绝打开非 https 链接', { url: String(rawUrl) });
      return false;
    }

    await shell.openExternal(target.toString());
    return true;
  });

  ipcMain.handle(IPC.checkForUpdate, async () => checkForUpdate());

  ipcMain.on(IPC.reload, () => {
    const win = getWindow();
    if (!win || win.isDestroyed()) return;
    log.info('页面请求重新加载', { url: config.pageUrl });
    void win.loadURL(config.pageUrl);
  });

  ipcMain.on(IPC.quit, () => {
    log.info('页面请求退出应用');
    app.quit();
  });

  log.info('IPC 通道已注册', { channels: Object.values(IPC).length });
}
