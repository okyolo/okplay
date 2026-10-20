import { DEV_ORIGIN, PRODUCTION_ORIGIN } from '../shared/contracts';

export interface AppConfig {
  /** 课程页面的来源（scheme + host + port），例如 https://class.example.com */
  origin: string;
  /** 页面入口 URL。 */
  pageUrl: string;
  /** 连通性探测地址。 */
  healthUrl: string;
}

/**
 * 开发模式 = **明确带了 `--dev`**（即 `npm run dev`）：开 devtools + 指向本机 Vite。
 *
 * ⚠️ **不能把「没打包」等同于开发态。**
 *
 * 源码安装（`npm install && npm start`）同样没打包，但它是**给学员用的** ——
 * 得连生产。原先这里写的是 `app.isPackaged ? 生产 : 本机`，于是源码安装的桌面
 * 快捷方式双击后指向 `http://localhost:5173`：学员机器上那里什么都没有，
 * 探测失败 → 落到离线页（而离线页当时还因为路径 bug 是白屏）。**表现就是双击没反应。**
 *
 * 现在只有显式 `--dev` 才走本机。README 里开发那段用的是 `npm run dev`。
 */
export function isDevMode(): boolean {
  return process.argv.includes('--dev');
}

/** 去掉末尾斜杠，并统一成 origin 形式。 */
function normalizeOrigin(raw: string): string {
  const trimmed = raw.trim().replace(/\/+$/, '');
  try {
    return new URL(trimmed).origin;
  } catch {
    return trimmed;
  }
}

export function resolveConfig(): AppConfig {
  // 1) 环境变量优先。要指到预发或别的地址，用它。
  const fromEnv = process.env.OKPLAY_ORIGIN;
  if (fromEnv && fromEnv.trim()) {
    const origin = normalizeOrigin(fromEnv);
    return { origin, pageUrl: `${origin}/`, healthUrl: `${origin}/` };
  }

  // 2) 只有显式 `--dev` 指向本机 Vite；打包版与源码安装都指生产。
  //
  // 生产域名是**编译进来**的常量（见 shared/contracts.ts）—— 安装版的 exe
  // 从开始菜单启动时读不到任何环境变量，只能靠它。
  const origin = isDevMode() ? DEV_ORIGIN : PRODUCTION_ORIGIN;
  return { origin, pageUrl: `${origin}/`, healthUrl: `${origin}/` };
}

/**
 * 导航白名单：只允许自有域名。
 * 注意这是**运行时**判断，不是安全边界 —— 客户端是公开分发的（PRD §3.2）。
 */
export function isAllowedNavigationUrl(rawUrl: string, config: AppConfig): boolean {
  let target: URL;
  try {
    target = new URL(rawUrl);
  } catch {
    return false;
  }
  if (target.protocol !== 'https:' && target.protocol !== 'http:') return false;

  // 配置的那个 origin **永远**放行，不管打没打包。
  //
  // 原先开发态这条分支只看 localhost，把 config.origin 完全绕过去了 —— 于是
  // `OKPLAY_ORIGIN=https://learn.okyolo.com npm start` 会出现：页面能加载
  // （首次 loadURL 不触发 will-navigate），但**之后任何导航都被拦**，
  // 包括页面里的「刷新」按钮调的 `location.reload()`。
  // 主进程日志里会刷一串「已拦截导航 { url: 'https://learn.okyolo.com/' }」——
  // 拦的是自己的页面，症状是「点了没反应」，极难往导航白名单上想。
  if (target.origin === config.origin) return true;

  // 开发态额外放宽到本机：Vite 的端口可能变（5173/5174），按 hostname 放。
  //
  // 判据与 origin 一致（`isDevMode()`，不是 `!app.isPackaged`）——
  // 源码安装跑的是生产页面，不该被允许导航去本机。
  if (isDevMode()) {
    return target.hostname === 'localhost' || target.hostname === '127.0.0.1';
  }
  return false;
}
