/**
 * 主进程与 preload 共用的常量与类型。
 *
 * 硬约束：这个文件里的任何内容都会被编译进客户端，而客户端是公开分发的。
 * 因此**不得**出现密钥、凭证、内部接口路径或任何商业细节。
 */

/**
 * 应用名。会决定：
 *   - 开发态的 userData 目录名（`<appData>/ok-play-dev`）
 *   - macOS 的 Dock / 菜单栏名称（配合 app.setName）
 *   - 打包产物的默认名称
 */
export const APP_NAME = 'ok-play';

/** 反域名的应用标识。打包后作为 Windows 的 AppUserModelID 与安装标识，不要随意改。 */
export const APP_ID = 'cn.okbase.okplay';

/** 会话分区：登录 Cookie 与设备凭证都落在这里，与默认分区隔离。 */
export const SESSION_PARTITION = 'persist:okplay';

/** preload 通过 contextBridge 暴露给页面的对象名。 */
export const BRIDGE_NAME = 'okplay';

/** 开发环境：课程页面由 Vite 提供。 */
export const DEV_ORIGIN = 'http://localhost:5173';

/**
 * 生产环境的课程域名。
 *
 * ⚠️ **打包产物就是靠这个值连上服务的** —— 安装版的 exe 从开始菜单启动时
 * 没有环境变量可读，域名只能编译进产物。原先这里是个不可解析的占位符
 * （`replace-me.invalid`），导致所有打包版一启动就进「域名尚未配置」离线页；
 * 域名定下来之后换成真值，那条分支也就一并删掉了。
 *
 * 它出现在公开源码里是**有意为之**：这个域名对学员本来就完全可见
 * （loadURL、抓包、证书、日志都会显示它），PRD §3.2 也写明「必须用客户端」
 * 不是安全边界。与其藏起来，不如放在这里说清楚。
 */
export const PRODUCTION_ORIGIN = 'https://learn.okyolo.com';

/**
 * 客户端自带资源用的自定义 scheme（见 src/main/localAssets.ts）。
 *
 * 页面是 https 源，加载不了 `file://`，所以登录视频走这个 privileged scheme。
 * 浏览器里没有它 —— 页面必须判 `window.okplay` 是否存在再决定用哪个地址。
 */
export const LOCAL_ASSET_SCHEME = 'okplay-asset';

/** 登录页左栏那段视频的本地地址。权威由主进程的协议处理器提供。 */
export const LOCAL_LOGIN_VIDEO = `${LOCAL_ASSET_SCHEME}://login/login-bg.mp4`;

/** preload 暴露给页面的能力。刻意保持极小 —— 见 PRD §14 NFR-SEC-006A。 */
export interface OkPlayBridge {
  /** 只读的平台与版本信息。 */
  readonly platform: PlatformInfo;
  /**
   * 桌面端自带的登录视频地址（`okplay-asset://`）。
   * 只是路径，**不构成任何授权判断** —— 视频本来就公开。
   */
  readonly localLoginVideo: string;
  /** 打开系统浏览器访问外部链接（仅 https）。 */
  openExternal(url: string): Promise<boolean>;
  /** 检查更新。返回 null 表示检查失败 —— 调用方应静默忽略。 */
  checkForUpdate(): Promise<UpdateCheckResult | null>;
  /** 请求主进程重新加载页面（离线页的「重试」按钮用）。 */
  reload(): void;
  /** 请求主进程退出应用。 */
  quit(): void;
}

export interface PlatformInfo {
  appVersion: string;
  electronVersion: string;
  chromeVersion: string;
  platform: string;
  /** 源码安装时为 false。用于界面上区分开发态与打包态。 */
  isPackaged: boolean;
}

export interface UpdateCheckResult {
  current: string;
  latest: string;
  updateAvailable: boolean;
  /** 更新入口地址（GitHub Releases 页面）。 */
  downloadUrl: string;
  notes?: string;
}

/** 主进程 → preload 的 IPC 通道白名单。新增通道必须同步改这里。 */
export const IPC = {
  openExternal: 'okplay:open-external',
  checkForUpdate: 'okplay:check-update',
  reload: 'okplay:reload',
  quit: 'okplay:quit',
} as const;

export type IpcChannels = typeof IPC;

/**
 * 桥的名称与 IPC 通道名。
 *
 * ⚠️ **preload 不能 import 上面那两个值。**
 * `sandbox: true` 下 preload 的 `require` 只认 electron / events / timers / url，
 * **相对路径引不动** —— 实测报 `module not found: ../shared/contracts`，
 * 而且 preload 是**整段不执行**：没有报错页面、没有降级，只是 `window.okplay` 不存在，
 * 离线页的「重试」「退出」按钮因此全是死的。
 *
 * 所以这份数据由主进程经 `additionalArguments` 传给 preload（见 src/main/window.ts），
 * 与 `platformInfo` 走的是同一条路。**权威定义始终是本文件**，
 * 这个接口只用来约束传过去的那份 JSON 的形状。
 */
export interface BridgeContract {
  name: string;
  ipc: IpcChannels;
  /** 登录视频的本地地址，preload 原样交给页面（见上面 LOCAL_LOGIN_VIDEO）。 */
  loginVideo: string;
}
