import { app, type Session } from 'electron';

import type { AppConfig } from '../config';
import { getDeviceId } from '../identity/device';
import { log } from '../log';

/** 只有这个前缀下的请求才需要设备标识。 */
const API_PATH_PREFIX = '/api/';

/**
 * 请求头注入。
 *
 * 两条硬规则，改这个文件前先读：
 *
 * 1. **过滤器必须枚举域名**，不得写成匹配所有 URL 的通配形式 ——
 *    否则客户端就成了开放代理。
 * 2. **绝不给我们 API 之外的域名（尤其 CDN）加自定义头**。自定义头会让跨域
 *    XHR 变成非简单请求，导致**每个 ts 分片先发一次 OPTIONS 预检** —— 一个长视频
 *    几百个分片，性能不可接受。下面的过滤器天然只覆盖自有 API origin。
 *
 * 注入设备标识的价值：device_id 与私钥只在主进程，**页面 XSS 也拿不到**。
 * 但它本身是弱防护 —— device_id 可被伪造，不得当作正版证明（PRD §8）。
 */
export function applyHeaderPolicy(target: Session, config: AppConfig): void {
  const apiOrigin = config.origin;
  const version = app.getVersion();

  target.webRequest.onBeforeSendHeaders({ urls: [`${apiOrigin}/*`] }, (details, callback) => {
    const headers = { ...details.requestHeaders };

    let url: URL | null = null;
    try {
      url = new URL(details.url);
    } catch {
      url = null;
    }

    if (url && url.origin === apiOrigin && url.pathname.startsWith(API_PATH_PREFIX)) {
      headers['X-OkPlay-Device'] = getDeviceId();
      headers['X-OkPlay-Client'] = `okplay/${version}`;
    }

    callback({ requestHeaders: headers });
  });

  log.info('请求头注入已注册', { scope: `${apiOrigin}${API_PATH_PREFIX}*` });
}
