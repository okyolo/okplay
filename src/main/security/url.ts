/**
 * URL 解析的公共判据。
 *
 * 主进程里有两处（`ipc.ts` 的 openExternal、`security/navigation.ts` 的新窗口拦截）
 * 执行同一条规则：**解析得出来、且协议是 https，才允许交给系统浏览器**。
 * 原先两处各写一遍，规则一旦分叉就会出现「一个入口能开、另一个不能」的裂缝。
 *
 * 注意 `config.ts` 的 `isAllowedNavigationUrl` **不**走这里 —— 它要多放行 http
 * （开发态的 Vite 页面），判据本来就不同，别合并。
 */
export function parseHttpsUrl(raw: unknown): URL | null {
  if (typeof raw !== 'string') return null;
  let target: URL;
  try {
    target = new URL(raw);
  } catch {
    return null;
  }
  return target.protocol === 'https:' ? target : null;
}
