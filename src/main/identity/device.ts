import { randomBytes } from 'node:crypto';
import { join } from 'node:path';
import { app } from 'electron';

import { log } from '../log';
import { readSecret, writeSecret } from './vault';

/**
 * device_id 标识的是**安装实例**，不是「人」，也**不是正版证明**。
 * 它可以被伪造 —— 唯一作用是让服务端能区分实例、能踢下线。
 *
 * 因此：不做机器指纹（有隐私问题、跨平台脆弱、换硬盘就变），
 * 只用随机值。重装视为新实例是可接受的。
 */

interface DeviceRecord {
  schema: 1;
  deviceId: string;
  createdAt: string;
}

let cached: string | null = null;

function identityFile(): string {
  return join(app.getPath('userData'), 'identity.bin');
}

export function getDeviceId(): string {
  if (cached) return cached;

  const raw = readSecret(identityFile());
  if (raw) {
    try {
      const record = JSON.parse(raw) as DeviceRecord;
      if (record && typeof record.deviceId === 'string' && record.deviceId.length > 0) {
        cached = record.deviceId;
        return cached;
      }
    } catch {
      log.warn('device_id 记录损坏，将重新生成');
    }
  }

  const deviceId = randomBytes(16).toString('hex');
  const record: DeviceRecord = {
    schema: 1,
    deviceId,
    createdAt: new Date().toISOString(),
  };

  const persisted = writeSecret(identityFile(), JSON.stringify(record));
  if (!persisted) {
    // 不静默写明文。退回内存态，并让用户知道本次运行结束后会变。
    log.warn('safeStorage 不可用，device_id 仅保存在内存中，重启后会变', { deviceId });
  }

  cached = deviceId;
  return cached;
}
