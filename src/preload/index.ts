import { contextBridge, ipcRenderer } from 'electron';

import type {
  BridgeContract,
  OkPlayBridge,
  PlatformInfo,
  UpdateCheckResult,
} from '../shared/contracts';

/**
 * preload：主进程与远程页面之间唯一的桥。
 *
 * 判定准则（PRD §14 NFR-SEC-006A）：
 * **即使攻击者拿到页面 JS 执行权、把这里暴露的方法全调一遍，也不产生额外损失。**
 *
 * 因此这里：
 *  - 只做无副作用的事（打开外部链接、检查更新、重新加载、退出）；
 *  - **不做任何授权判定** —— 是否登录、是否有课程权限，一律由服务端回答；
 *  - 不暴露 `ipcRenderer`、`require`、`fs` 或任何能改身份的方法；
 *  - `contextBridge` 只传值，不传对象引用（避免原型链泄漏）。
 */

const PLATFORM_ARG = '--okplay-platform=';
const BRIDGE_ARG = '--okplay-bridge=';

function readArg(prefix: string): string | null {
  const arg = process.argv.find((item) => item.startsWith(prefix));
  return arg ? arg.slice(prefix.length) : null;
}

const FALLBACK_PLATFORM: PlatformInfo = {
  appVersion: '0.0.0',
  electronVersion: '',
  chromeVersion: '',
  platform: 'unknown',
  isPackaged: false,
};

function readPlatformInfo(): PlatformInfo {
  const raw = readArg(PLATFORM_ARG);
  if (!raw) return FALLBACK_PLATFORM;

  try {
    const parsed = JSON.parse(raw) as Partial<PlatformInfo>;
    return { ...FALLBACK_PLATFORM, ...parsed };
  } catch {
    return FALLBACK_PLATFORM;
  }
}

/**
 * 桥的名称与 IPC 通道名。
 *
 * ⚠️ **这两个值不能 import。** `sandbox: true` 下 preload 的 `require` 只认
 * electron / events / timers / url，**相对路径引不动** —— 实测会报
 * `module not found: ../shared/contracts`，而且是整段 preload 不执行，
 * `window.okplay` 根本不存在。权威定义在 src/shared/contracts.ts，
 * 由主进程经 additionalArguments 传进来。
 *
 * 缺参数说明 window.ts 被改坏了，直接抛 —— 让它在控制台显形，
 * 而不是让页面拿到一个半残的桥。
 */
function readContract(): BridgeContract {
  const raw = readArg(BRIDGE_ARG);
  if (!raw) throw new Error('preload 缺少 --okplay-bridge 参数，桥无法建立');
  return JSON.parse(raw) as BridgeContract;
}

const contract = readContract();

const bridge: OkPlayBridge = {
  platform: Object.freeze(readPlatformInfo()),
  // 登录视频打进客户端了，页面优先用这个地址（浏览器里没有这个桥，走站点静态文件）。
  localLoginVideo: contract.loginVideo,
  openExternal: (url: string) =>
    ipcRenderer.invoke(contract.ipc.openExternal, url) as Promise<boolean>,
  checkForUpdate: () =>
    ipcRenderer.invoke(contract.ipc.checkForUpdate) as Promise<UpdateCheckResult | null>,
  reload: () => {
    ipcRenderer.send(contract.ipc.reload);
  },
  quit: () => {
    ipcRenderer.send(contract.ipc.quit);
  },
};

contextBridge.exposeInMainWorld(contract.name, bridge);
