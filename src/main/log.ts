/**
 * 脱敏日志。
 *
 * 约束（PRD §14 NFR-SEC-004）：日志不得记录明文密码、完整 Token、Cookie、
 * 永久视频地址、完整短时签名地址、`device_id` 明文。
 *
 * 这里做的是**尽力而为的兜底**：真正的保证来自「调用方不要传敏感值进来」。
 * 新增日志点时应假定这个模块不会救你。
 */

type LogLevel = 'info' | 'warn' | 'error';

const SENSITIVE_KEY = /pass(word|wd)?|pwd|token|secret|credential|authorization|cookie|signature|device_?id|private/i;

/** 查询参数名只要包含凭证类词，整条值都打码；绝对/相对 URL 都覆盖。 */
const SIGNED_URL =
  /[?&][^=&\s]*(?:auth|sign|signature|token|expire|secret|credential|key)[^=&\s]*=/i;

/** 一句话：只保留前 6 位 + 长度，用于排障时区分不同实例，但不泄漏原值。 */
function fingerprint(value: string): string {
  if (!value) return '(empty)';
  return `${value.slice(0, 6)}…(len=${value.length})`;
}

export function redactLogString(value: string): string {
  if (SIGNED_URL.test(value)) return '(已脱敏：带签名的地址)';
  return value;
}

function redactValue(key: string, value: unknown): unknown {
  if (SENSITIVE_KEY.test(key)) {
    return typeof value === 'string' ? fingerprint(value) : '(已脱敏)';
  }
  if (typeof value === 'string') return redactLogString(value);
  if (value && typeof value === 'object') return redactMeta(value as Record<string, unknown>);
  return value;
}

function redactMeta(meta: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(meta)) {
    out[key] = redactValue(key, value);
  }
  return out;
}

function emit(level: LogLevel, message: string, meta?: Record<string, unknown>): void {
  const time = new Date().toISOString();
  const line = `[${time}] [${level}] ${redactLogString(message)}`;
  const payload = meta ? redactMeta(meta) : undefined;

  if (level === 'error') console.error(line, payload ?? '');
  else if (level === 'warn') console.warn(line, payload ?? '');
  else console.log(line, payload ?? '');
}

export const log = {
  info: (message: string, meta?: Record<string, unknown>) => emit('info', message, meta),
  warn: (message: string, meta?: Record<string, unknown>) => emit('warn', message, meta),
  error: (message: string, meta?: Record<string, unknown>) => emit('error', message, meta),
};
