import { safeStorage } from 'electron';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

/**
 * 操作系统安全凭证存储的薄封装。
 * Windows 走 DPAPI，macOS 走 Keychain。
 *
 * **不可用时绝不静默降级为明文**（PRD §14 NFR-SEC-003）——
 * 写不进就返回 false，由调用方决定怎么提示用户。
 */

export function isVaultAvailable(): boolean {
  try {
    return safeStorage.isEncryptionAvailable() && safeStorage.getSelectedStorageBackend?.() !== 'basic_text';
  } catch {
    return false;
  }
}

export function readSecret(filePath: string): string | null {
  if (!existsSync(filePath)) return null;
  if (!isVaultAvailable()) return null;
  try {
    return safeStorage.decryptString(readFileSync(filePath));
  } catch {
    // 解密失败常见原因：换了机器 / 换了 Windows 用户 / 换了签名身份。
    // 对 macOS 源码安装来说这是**预期行为**（Keychain ACL 绑定签名身份）。
    return null;
  }
}

export function writeSecret(filePath: string, value: string): boolean {
  if (!isVaultAvailable()) return false;
  try {
    mkdirSync(dirname(filePath), { recursive: true });
    // mode 只对 POSIX 生效；Windows 上保护内容的是 DPAPI，不是文件权限。
    writeFileSync(filePath, safeStorage.encryptString(value), { mode: 0o600 });
    return true;
  } catch {
    return false;
  }
}
