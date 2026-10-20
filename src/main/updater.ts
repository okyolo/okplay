import { app, net } from 'electron';

import type { UpdateCheckResult } from '../shared/contracts';
import { log } from './log';

/**
 * 版本检查。
 *
 * **本客户端不做静默自动更新** —— Windows 与 macOS 都要求更新包由同一张
 * 证书签名（macOS 还需公证）后才应用，而本项目不购买代码签名（PRD §14 NFR-SEC-008）。
 * 所以这里只做「告诉你有没有新版」，安装交给用户点按钮。
 *
 * 失败时一律返回 null，由调用方**静默忽略** —— 更新检查绝不能打断学习。
 */

/** 分发位置：GitHub Releases（PRD §20）。 */
const RELEASE_REPO = process.env.OKPLAY_RELEASE_REPO?.trim() || 'okyolo/okplay';
const RELEASES_API = `https://api.github.com/repos/${RELEASE_REPO}/releases/latest`;
const RELEASES_PAGE = `https://github.com/${RELEASE_REPO}/releases/latest`;

const TIMEOUT_MS = 8000;

function parseVersion(raw: string): number[] {
  return raw
    .trim()
    .replace(/^v/i, '')
    .split(/[.\-+]/)
    .map((part) => Number.parseInt(part, 10))
    .map((n) => (Number.isFinite(n) ? n : 0));
}

/** a 是否比 b 新。 */
function isNewer(a: string, b: string): boolean {
  const left = parseVersion(a);
  const right = parseVersion(b);
  const length = Math.max(left.length, right.length);
  for (let i = 0; i < length; i += 1) {
    const l = left[i] ?? 0;
    const r = right[i] ?? 0;
    if (l !== r) return l > r;
  }
  return false;
}

export async function checkForUpdate(): Promise<UpdateCheckResult | null> {
  const current = app.getVersion();

  try {
    const response = await net.fetch(RELEASES_API, {
      headers: {
        Accept: 'application/vnd.github+json',
        'User-Agent': `okplay/${current}`,
      },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

    if (!response.ok) {
      log.warn('版本检查失败', { status: response.status });
      return null;
    }

    const payload = (await response.json()) as { tag_name?: string; body?: string };
    const latest = typeof payload.tag_name === 'string' ? payload.tag_name : '';
    if (!latest) return null;

    return {
      current,
      latest,
      updateAvailable: isNewer(latest, current),
      downloadUrl: RELEASES_PAGE,
      notes: typeof payload.body === 'string' ? payload.body.slice(0, 500) : undefined,
    };
  } catch (error) {
    // 网络不可达、GitHub 被墙、超时 —— 都属于「静默忽略」。
    log.warn('版本检查异常', { message: (error as Error).message });
    return null;
  }
}
