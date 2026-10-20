import type { Session } from 'electron';

import { log } from '../log';

/**
 * 权限策略：**白名单制，默认拒绝**。
 *
 * 课程页面不需要摄像头、麦克风、通知、地理位置、剪贴板读、MIDI、串口。
 * 这些一律拒绝而不是「按需询问」—— 询问框本身就是一个诱导用户点「允许」的攻击面。
 *
 * ⚠️ **但「一律拒绝」是错的。** Electron 把 `fullscreen` 也算作一项权限，
 * 于是播放器的全屏按钮被这条策略挡掉。实测踩过：前端 `catch {}` 又把错误吞了，
 * 浏览器里点全屏**完全没有反应**，日志里只有一行「已拒绝页面权限请求」，
 * 而「拒绝权限」本身看着像是正常行为，极易忽略。
 *
 * 所以要区分「涉及隐私/系统能力的权限」和「只影响本窗口显示的权限」：
 * 前者拒绝，后者放行。
 */

/**
 * 明确放行的权限。
 *
 * 目前只有 `fullscreen`：它只影响本窗口的显示，既不读取隐私数据，
 * 也不授予系统级能力，且**必须由用户手势触发**。
 */
const ALLOWED_PERMISSIONS = new Set<string>(['fullscreen']);

/**
 * 权限策略。
 *
 * **`automatic-fullscreen` 仍然拒绝** —— 那是「无用户手势的自动全屏」，
 * 页面可以在加载时自己弹全屏。我们要的只是用户点按钮触发的全屏，不需要这个。
 */
export function applyPermissionPolicy(target: Session): void {
  target.setPermissionRequestHandler((_contents, permission, callback) => {
    if (ALLOWED_PERMISSIONS.has(permission)) {
      callback(true);
      return;
    }
    log.warn('已拒绝页面权限请求', { permission });
    callback(false);
  });

  target.setPermissionCheckHandler((_contents, permission) => {
    if (ALLOWED_PERMISSIONS.has(permission)) return true;
    log.warn('已拒绝页面权限检查', { permission });
    return false;
  });

  // 屏幕共享：不留默认实现，显式拒绝。
  try {
    target.setDisplayMediaRequestHandler((_request, callback) => {
      log.warn('已拒绝屏幕共享请求');
      callback({});
    });
  } catch (error) {
    // 不同 Electron 版本该 API 签名有差异；注册失败不应影响启动。
    log.warn('屏幕共享处理器注册失败', { message: (error as Error).message });
  }
}
