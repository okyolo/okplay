import { shell, type WebContents } from 'electron';

import { isAllowedNavigationUrl, type AppConfig } from '../config';
import { log } from '../log';
import { parseHttpsUrl } from './url';

/**
 * 导航策略。
 *
 * 远程页面一旦被注入或跳到攻击者页面，这里是最后一道闸门。
 * 注意这**不是安全边界** —— 客户端是公开分发的（PRD §3.2），
 * 它防的是「页面里的恶意内容把用户导走」，不是「有人想绕过客户端」。
 */
export function applyNavigationPolicy(contents: WebContents, config: AppConfig): void {
  // 新窗口一律不开。外部 https 链接交给系统浏览器。
  contents.setWindowOpenHandler(({ url }) => {
    const target = parseHttpsUrl(url);

    if (target && !isAllowedNavigationUrl(url, config)) {
      void shell.openExternal(target.toString());
    } else {
      log.warn('已拦截新窗口', { url });
    }

    return { action: 'deny' };
  });

  // 302 可以让浏览器绕过 will-navigate，所以两个事件都要挂。
  contents.on('will-navigate', (event, url) => {
    if (!isAllowedNavigationUrl(url, config)) {
      event.preventDefault();
      log.warn('已拦截导航', { url });
    }
  });

  contents.on('will-redirect', (event, url) => {
    if (!isAllowedNavigationUrl(url, config)) {
      event.preventDefault();
      log.warn('已拦截重定向', { url });
    }
  });

  // 不使用 <webview>：额外攻击面，官方也建议避免。
  contents.on('will-attach-webview', (event) => {
    event.preventDefault();
    log.warn('已拦截 webview 挂载');
  });
}
