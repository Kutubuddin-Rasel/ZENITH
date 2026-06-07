import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { IAccessControlConfig } from '../interfaces/access-control.interfaces';

@Injectable()
export class AccessControlConfigService implements IAccessControlConfig {
  readonly isEnabled: boolean;
  readonly defaultPolicy: 'allow' | 'deny';
  readonly emergencyAccessEnabled: boolean;

  constructor(config: ConfigService) {
    this.isEnabled = config.get<boolean>('ACCESS_CONTROL_ENABLED') ?? true;
    this.defaultPolicy =
      config.get<'allow' | 'deny'>('ACCESS_CONTROL_DEFAULT_POLICY') ?? 'deny';
    this.emergencyAccessEnabled =
      config.get<boolean>('EMERGENCY_ACCESS_ENABLED') ?? true;
  }
}
