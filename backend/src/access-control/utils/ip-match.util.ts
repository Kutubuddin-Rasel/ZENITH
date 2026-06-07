import { IPAccessRule, IPType } from '../entities/ip-access-rule.entity';

export function ipToNumber(ip: string): number {
  return (
    ip.split('.').reduce((acc, octet) => (acc << 8) + parseInt(octet), 0) >>> 0
  );
}

export function isIPInRange(
  ipAddress: string,
  startIP: string,
  endIP: string,
): boolean {
  const ip = ipToNumber(ipAddress);
  const start = ipToNumber(startIP);
  const end = ipToNumber(endIP);
  return ip >= start && ip <= end;
}

export function isIPInCIDR(ipAddress: string, cidr: string): boolean {
  const [network, prefixLength] = cidr.split('/');
  const ip = ipToNumber(ipAddress);
  const networkIP = ipToNumber(network);
  const mask = (0xffffffff << (32 - parseInt(prefixLength))) >>> 0;
  return (ip & mask) === (networkIP & mask);
}

export function isIPWildcardMatch(ipAddress: string, pattern: string): boolean {
  const regex = new RegExp(pattern.replace(/\*/g, '.*'));
  return regex.test(ipAddress);
}

export function isIPMatch(
  ipAddress: string,
  ruleIP: string,
  ipType: IPType,
  endIP?: string,
): boolean {
  switch (ipType) {
    case IPType.SINGLE:
      return ipAddress === ruleIP;
    case IPType.RANGE:
      if (!endIP) return false;
      return isIPInRange(ipAddress, ruleIP, endIP);
    case IPType.CIDR:
      return isIPInCIDR(ipAddress, ruleIP);
    case IPType.WILDCARD:
      return isIPWildcardMatch(ipAddress, ruleIP);
    default:
      return false;
  }
}

export function isTimeAllowed(rule: IPAccessRule): boolean {
  const now = new Date();
  const currentTime = now.toTimeString().slice(0, 5);
  const currentDay = now.getDay();

  if (rule.allowedStartTime && rule.allowedEndTime) {
    if (
      currentTime < rule.allowedStartTime ||
      currentTime > rule.allowedEndTime
    ) {
      return false;
    }
  }

  if (rule.allowedDays && !rule.allowedDays.includes(currentDay)) {
    return false;
  }

  return true;
}
