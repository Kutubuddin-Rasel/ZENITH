import { Injectable, Logger } from '@nestjs/common';
import * as geoip from 'geoip-lite';
import {
  IGeoIpLookup,
  IPLocation,
} from '../interfaces/access-control.interfaces';

@Injectable()
export class GeoIpService extends IGeoIpLookup {
  private readonly logger = new Logger(GeoIpService.name);

  lookup(ipAddress: string): IPLocation | null {
    try {
      const geo = geoip.lookup(ipAddress);
      if (!geo) return null;
      return {
        country: geo.country,
        region: geo.region,
        city: geo.city,
        timezone: geo.timezone,
        latitude: geo.ll[0],
        longitude: geo.ll[1],
      };
    } catch (error) {
      this.logger.warn(`Failed to get location for IP ${ipAddress}`, error);
      return null;
    }
  }
}
