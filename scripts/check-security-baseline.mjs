// 安全基线静态断言。
//
// 为什么是静态检查而不是运行时检查：
//   运行时断言只能证明「这一次是好的」；静态断言证明「代码里没有被改坏」。
//   而这条基线最危险的失效方式恰恰是**有人为了让 CORS 通过而把
//   webSecurity 改成 false** —— 那是一次源码改动，静态检查正好能卡住它。
//
// 见 PRD §14 NFR-SEC-006A。

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const source = readFileSync(join(root, 'src', 'main', 'window.ts'), 'utf8');

/** 每项：必须在 window.ts 里出现的确切文本，以及它为什么重要。 */
const REQUIRED = [
  ['contextIsolation: true', 'preload 与页面必须分属不同上下文，否则 contextBridge 形同虚设'],
  ['nodeIntegration: false', '远程页面 + Node = 页面 XSS 直接等于本机任意命令执行'],
  ['nodeIntegrationInSubFrames: false', 'iframe 同样不能有 Node（笔记里可能有 iframe 残留）'],
  ['sandbox: true', '渲染进程必须跑在 OS 沙箱内'],
  ['webSecurity: true', '关掉它等于关闭同源策略，并会把 CDN 的 CORS 配置错误掩盖到上线后'],
  ['allowRunningInsecureContent: false', '禁止混合内容'],
  ['webviewTag: false', '不使用 webview，避免多一层攻击面'],
];

/** 这些写法一旦出现在 window.ts 里，说明基线被改坏了。 */
const FORBIDDEN = [
  ['webSecurity: false', '禁止关闭同源策略'],
  ['nodeIntegration: true', '禁止在页面里开 Node'],
  ['sandbox: false', '禁止关闭渲染进程沙箱'],
  ['contextIsolation: false', '禁止关闭上下文隔离'],
];

let failed = 0;

// 先去注释，避免把注释里的示例文本当成真实配置。
const code = source
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/(^|[^:])\/\/.*$/gm, '$1');

for (const [needle, why] of REQUIRED) {
  if (!code.includes(needle)) {
    console.error(`✗ 缺少安全基线：${needle}\n    ${why}`);
    failed += 1;
  }
}

for (const [needle, why] of FORBIDDEN) {
  if (code.includes(needle)) {
    console.error(`✗ 出现禁用配置：${needle}\n    ${why}`);
    failed += 1;
  }
}

if (failed > 0) {
  console.error(`\n安全基线断言失败：${failed} 项。见 PRD §14 NFR-SEC-006A。`);
  process.exit(1);
}

console.log(`✓ 安全基线断言通过（${REQUIRED.length} 项必需 + ${FORBIDDEN.length} 项禁用）`);
