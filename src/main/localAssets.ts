import { readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { app, protocol, type Session } from 'electron';

import { LOCAL_ASSET_SCHEME, LOCAL_LOGIN_VIDEO } from '../shared/contracts';
import { log } from './log';

/**
 * 客户端自带的媒体资源。
 *
 * ## 为什么登录视频要打进客户端
 *
 * 学员端页面上的登录页左栏是一段 1.2 MB 的 mp4。浏览器里只能从站点拉 ——
 * 而桌面客户端明明有安装包，把这段片子放进去就是**零网络请求**：开窗即播，
 * 弱网也不至于空着半屏（用户 2026-10-19 的要求）。
 *
 * ## 为什么不是直接 `file://`
 *
 * 页面是 `https://` 源，Chromium 不允许 https 页面加载 `file://` 子资源。
 * 所以自定义一个 **privileged scheme**：`okplay-asset://`。
 *
 * 三项 privileges 缺一不可：
 *   - `standard: true`  —— 否则 URL 不按 `scheme://host/path` 解析；
 *   - `secure: true`    —— https 页面只认「安全」的自定义源；
 *   - `stream: true`    —— 视频是靠 Range 分段取的，见下面的 206 响应；
 *   - `bypassCSP: true` —— 站点带 CSP，`media-src` 不放行这个 scheme 就白搭。
 *
 * ## Range 必须自己实现
 *
 * `<video>` 一上来就发 `Range: bytes=0-`，循环播放与 seek 还会继续要区间。
 * 一律返 200 全量也能播，但等于每次都要等整段 —— 那就失去「本地快」的意义了。
 */

/** 只有这一个文件走本 scheme；**不开放目录**，免得变成任意文件读取口子。 */
const FILES: Record<string, string> = {
  '/login-bg.mp4': 'login-bg.mp4',
};

/**
 * 必须在 `app.whenReady()` **之前**调用（Electron 的硬性要求）。
 * 放在 index.ts 的模块顶层，和 `app.setAppUserModelId` 同一段。
 */
export function registerAssetScheme(): void {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: LOCAL_ASSET_SCHEME,
      privileges: { standard: true, secure: true, stream: true, supportFetchAPI: true, bypassCSP: true },
    },
  ]);
}

/**
 * 打包后视频走 `extraResources`（resources/assets/，asar 外）；
 * 开发态走 copy-static 复制出来的 dist/assets/。
 */
function assetDir(): string {
  return app.isPackaged
    ? join(process.resourcesPath, 'assets')
    : join(app.getAppPath(), 'dist', 'assets');
}

/**
 * 文件只读一次。1.2 MB，进程生命周期内不会变 —— 每次 Range 都要重读一遍
 * 的话，循环播放会一直在读盘，白白丢掉「本地快」这个好处。
 */
const cache = new Map<string, Buffer>();

function load(file: string): Buffer {
  const hit = cache.get(file);
  if (hit) return hit;
  const bytes = readFileSync(file);
  cache.set(file, bytes);
  return bytes;
}

function rangeResponse(request: Request, file: string): Response {
  const size = statSync(file).size;
  const headers: Record<string, string> = {
    'Content-Type': 'video/mp4',
    'Accept-Ranges': 'bytes',
    // 客户端自带的文件，内容随版本变；同一个版本内不会变。
    'Cache-Control': 'public, max-age=31536000, immutable',
  };

  const raw = request.headers.get('range');
  const match = raw ? /^bytes=(\d*)-(\d*)$/.exec(raw.trim()) : null;

  if (!match) {
    return new Response(load(file), {
      status: 200,
      headers: { ...headers, 'Content-Length': String(size) },
    });
  }

  let start: number;
  let end: number;
  const [, from, to] = match;
  if (!from) {
    // `bytes=-N`：最后 N 字节。
    const suffix = Number(to);
    if (!Number.isFinite(suffix) || suffix <= 0) {
      return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${size}` } });
    }
    start = Math.max(0, size - suffix);
    end = size - 1;
  } else {
    start = Number(from);
    end = to ? Math.min(Number(to), size - 1) : size - 1;
  }

  if (!Number.isFinite(start) || start > end || start >= size) {
    return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${size}` } });
  }

  const body = load(file).subarray(start, end + 1);
  return new Response(body, {
    status: 206,
    headers: {
      ...headers,
      'Content-Length': String(end - start + 1),
      'Content-Range': `bytes ${start}-${end}/${size}`,
    },
  });
}

/** 挂到课程页面所在的那个 session 上（分区见 SESSION_PARTITION）。 */
export function applyLocalAssetProtocol(target: Session): void {
  target.protocol.handle(LOCAL_ASSET_SCHEME, (request) => {
    let pathname: string;
    try {
      pathname = new URL(request.url).pathname;
    } catch {
      return new Response(null, { status: 400 });
    }

    const name = FILES[pathname];
    if (!name) return new Response(null, { status: 404 });

    try {
      return rangeResponse(request, join(assetDir(), name));
    } catch (error) {
      log.warn('本地资源读取失败', { pathname, message: (error as Error).message });
      return new Response(null, { status: 500 });
    }
  });

  log.info('本地资源协议已注册', { scheme: LOCAL_ASSET_SCHEME, url: LOCAL_LOGIN_VIDEO });
}
