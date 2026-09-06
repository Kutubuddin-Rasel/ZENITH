import { Injectable } from '@nestjs/common';
import * as crypto from 'crypto';
import { UAParser } from 'ua-parser-js';
import { generateHexToken } from '../../common/utils/token.util';
import {
  DeviceInfo,
  ISessionDeviceParser,
} from '../interfaces/session.interfaces';

/**
 * {@link ISessionDeviceParser} — pure device-fingerprinting and session-id
 * generation. No persistence, no config; extracted verbatim from the legacy
 * SessionService.
 */
@Injectable()
export class DeviceFingerprintService extends ISessionDeviceParser {
  parseUserAgent(userAgent: string): DeviceInfo {
    if (!userAgent) {
      return {
        deviceId: generateHexToken(32), // 32 hex chars = 16 bytes
        isMobile: false,
        isTablet: false,
        isDesktop: true,
      };
    }

    const parser = new UAParser(userAgent);
    const result = parser.getResult();

    return {
      deviceId: crypto
        .createHash('sha256')
        .update(userAgent)
        .digest('hex')
        .substring(0, 16),
      deviceName: `${result.device.vendor || 'Unknown'} ${result.device.model || 'Device'}`,
      osName: result.os.name,
      osVersion: result.os.version,
      browserName: result.browser.name,
      browserVersion: result.browser.version,
      isMobile: result.device.type === 'mobile',
      isTablet: result.device.type === 'tablet',
      isDesktop: !result.device.type || result.device.type === 'desktop',
    };
  }

  generateSessionId(): string {
    return generateHexToken(64); // 64 hex chars = 32 bytes
  }
}
