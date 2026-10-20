import { join } from 'node:path';
import type { BrowserWindow } from 'electron';

import { log } from '../log';

/** Chromium 的 ERR_ABORTED —— 正常的导航中断，不是故障。 */
const ERR_ABORTED = -3;

/**
 * 离线页在磁盘上的位置。
 *
 * ⚠️ **两个 `..`，不是一个。** 编译后本文件在 `dist/main/lifecycle/failover.js`，
 * 所以 `__dirname` 是 `dist/main/lifecycle`，要退两级才到 `dist/`。
 *
 * 写成一级会指向 `dist/main/renderer-local/offline.html` —— 那个路径不存在，
 * `loadFile` 直接失败，结果是**窗口全白**。而这个页面存在的全部意义就是
 * 「云端不可达时还能显示点东西」，所以白屏恰好把唯一的兜底也拿掉了。
 *
 * 这个 bug 藏了很久：开发态 Vite 起着、探测必然成功，生产态域名可达，
 * 两条主路径都走不到这里 —— 只有真断网/服务挂了才会暴露。
 *
 * 注意：`index.ts` 与 `window.ts` 里那几处同形状的 `join(__dirname, '..', …)`
 * 是**对的**（它们编译后在 `dist/main/` 根上，退一级正好到 `dist/`）。
 * 改这个函数时别看错。
 */
function offlinePagePath(): string {
  return join(__dirname, '..', '..', 'renderer-local', 'offline.html');
}

/**
 * 切到本地离线页。
 *
 * 离线页必须是**本地文件**，且不依赖任何远程资源 ——
 * 它存在的意义就是「云端不可达时还能显示点东西」。
 */
export function showOfflinePage(win: BrowserWindow, reason: string, detail: string): void {
  if (win.isDestroyed()) return;

  const params = new URLSearchParams({ reason, detail });
  void win.loadFile(offlinePagePath(), { search: `?${params.toString()}` });
}

/**
 * 页面加载与渲染进程的失败处理。
 *
 * ⚠️ 最容易踩的坑：`did-fail-load` **对子资源也会触发**。
 * 不判 `isMainFrame` 的话，一个视频分片加载失败就会把整页换成错误页。
 */
export function applyFailoverPolicy(win: BrowserWindow): void {
  const contents = win.webContents;

  contents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL, isMainFrame) => {
    if (!isMainFrame) return; // ← 子资源失败，交给页面自己处理
    if (errorCode === ERR_ABORTED) return;

    log.warn('主框架加载失败', { errorCode, errorDescription, url: validatedURL });
    showOfflinePage(win, '无法连接 OKPlay 服务', `${errorDescription}（${errorCode}）`);
  });

  contents.on('render-process-gone', (_event, details) => {
    log.error('渲染进程终止', { reason: details.reason, exitCode: details.exitCode });
    showOfflinePage(win, '页面已崩溃', `原因：${details.reason}`);
  });

  contents.on('unresponsive', () => {
    log.warn('页面无响应');
    showOfflinePage(win, '页面无响应', '页面长时间没有响应，请重试');
  });
}
