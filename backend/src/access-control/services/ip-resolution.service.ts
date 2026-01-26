import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';
import * as net from 'net';

/**
 * Parsed proxy configuration
 */
interface TrustedProxyConfig {
  address: string;
  prefixLength: number;
  isIPv6: boolean;
}

/**
 * IP Resolution Service
 *
 * Implements RFC 7239 compliant trusted proxy configuration to prevent
 * X-Forwarded-For header spoofing attacks.
 *
 * SECURITY MODEL:
 * 1. Get socket IP (physical connection source)
 * 2. Verify socket IP is in TRUSTED_PROXIES list
 * 3. If trusted: Extract rightmost untrusted IP from X-Forwarded-For chain
 * 4. If untrusted: Return socket IP (treat headers as garbage)
 *
 * CONFIGURATION:
 * - TRUSTED_PROXIES: Comma-separated list of IPs/CIDRs (e.g., "10.0.0.0/8,172.16.0.0/12")
 * - If not set or empty: Trust no proxies (always use socket IP)
 *
 * THREAT MITIGATION:
 * - Prevents direct clients from spoofing X-Forwarded-For to bypass IP blocklists
 * - Ensures only known load balancers/proxies can set client IP
 */
@Injectable()
export class IpResolutionService implements OnModuleInit {
  private readonly logger = new Logger(IpResolutionService.name);

  /**
   * Parsed trusted proxy configurations
   * Empty array = trust no proxies
   */
  private trustedProxies: TrustedProxyConfig[] = [];

  constructor(private configService: ConfigService) {}

  onModuleInit(): void {
    this.loadTrustedProxies();
  }

  /**
   * Load and parse TRUSTED_PROXIES from environment
   */
  private loadTrustedProxies(): void {
    const trustedProxiesEnv = this.configService.get<string>('TRUSTED_PROXIES');

    if (!trustedProxiesEnv || trustedProxiesEnv.trim() === '') {
      this.logger.warn(
        'TRUSTED_PROXIES not configured. All proxy headers will be ignored (socket IP used).',
      );
      this.trustedProxies = [];
      return;
    }

    const entries = trustedProxiesEnv
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    this.trustedProxies = [];

    for (const entry of entries) {
      try {
        const parsed = this.parseProxyConfig(entry);
        if (parsed) {
          this.trustedProxies.push(parsed);
        }
      } catch (error) {
        this.logger.error(
          `Invalid TRUSTED_PROXIES entry: "${entry}". Skipping.`,
          error,
        );
      }
    }

    if (this.trustedProxies.length > 0) {
      this.logger.log(
        `Loaded ${this.trustedProxies.length} trusted proxy configurations: ${this.trustedProxies.map((p) => `${p.address}/${p.prefixLength}`).join(', ')}`,
      );
    } else {
      this.logger.warn(
        'No valid TRUSTED_PROXIES found. All proxy headers will be ignored.',
      );
    }
  }

  /**
   * Parse a single proxy configuration entry (IP or CIDR)
   */
  private parseProxyConfig(entry: string): TrustedProxyConfig | null {
    // Check if it's CIDR notation
    if (entry.includes('/')) {
      const [address, prefixStr] = entry.split('/');
      const prefixLength = parseInt(prefixStr, 10);

      const ipVersion = net.isIP(address);
      if (ipVersion === 0) {
        throw new Error(`Invalid IP address: ${address}`);
      }

      const maxPrefix = ipVersion === 4 ? 32 : 128;
      if (isNaN(prefixLength) || prefixLength < 0 || prefixLength > maxPrefix) {
        throw new Error(`Invalid prefix length: ${prefixStr}`);
      }

      return {
        address: this.normalizeIp(address),
        prefixLength,
        isIPv6: ipVersion === 6,
      };
    }

    // Single IP address (equivalent to /32 or /128)
    const ipVersion = net.isIP(entry);
    if (ipVersion === 0) {
      throw new Error(`Invalid IP address: ${entry}`);
    }

    return {
      address: this.normalizeIp(entry),
      prefixLength: ipVersion === 4 ? 32 : 128,
      isIPv6: ipVersion === 6,
    };
  }

  // ===========================================================================
  // PUBLIC API
  // ===========================================================================

  /**
   * Get the real client IP address from a request
   *
   * ALGORITHM (RFC 7239 compliant):
   * 1. Get socket IP (physical connection)
   * 2. If socket IP is NOT from a trusted proxy → return socket IP
   * 3. If socket IP IS from a trusted proxy:
   *    - Parse X-Forwarded-For header
   *    - Walk the chain from right to left (most recent → oldest)
   *    - Return the first (rightmost) IP that is NOT a trusted proxy
   *    - This is the edge of our trusted network = the real client
   *
   * @param request Express request object
   * @returns The resolved client IP address
   */
  getClientIp(request: Request): string {
    // Step 1: Get socket IP (physical connection source)
    const socketIp = this.getSocketIp(request);

    // Step 2: If no trusted proxies configured, always use socket IP
    if (this.trustedProxies.length === 0) {
      this.logger.debug(`No trusted proxies - using socket IP: ${socketIp}`);
      return socketIp;
    }

    // Step 3: Check if socket IP is from a trusted proxy
    if (!this.isIpTrusted(socketIp)) {
      // Direct connection from untrusted source - ignore headers
      this.logger.debug(
        `Socket IP ${socketIp} not trusted - ignoring proxy headers`,
      );
      return socketIp;
    }

    // Step 4: Socket is from trusted proxy - parse X-Forwarded-For
    const forwardedFor = request.headers['x-forwarded-for'];
    if (!forwardedFor) {
      // Trusted proxy but no header - use socket IP
      this.logger.debug(
        `Socket from trusted proxy but no X-Forwarded-For - using socket IP: ${socketIp}`,
      );
      return socketIp;
    }

    // Step 5: Parse and walk the chain to find rightmost untrusted IP
    const clientIp = this.extractRightmostUntrustedIp(forwardedFor.toString());

    this.logger.debug(
      `Resolved client IP from X-Forwarded-For chain: ${clientIp} (socket: ${socketIp})`,
    );

    return clientIp;
  }

  /**
   * Get raw socket IP from request
   */
  private getSocketIp(request: Request): string {
    const rawIp =
      request.socket?.remoteAddress ||
      request.connection?.remoteAddress ||
      '127.0.0.1';

    return this.normalizeIp(rawIp);
  }

  /**
   * Extract the rightmost untrusted IP from X-Forwarded-For chain
   *
   * Format: "client, proxy1, proxy2, proxy3"
   *
   * We walk from right to left, finding the first IP that is NOT a trusted proxy.
   * This is the edge of our trusted network = the real client.
   *
   * Example:
   * - Chain: "203.0.113.50, 10.0.0.1, 10.0.0.2"
   * - Trusted: 10.0.0.0/8
   * - Result: 203.0.113.50 (first from right that isn't in 10.0.0.0/8)
   */
  private extractRightmostUntrustedIp(forwardedFor: string): string {
    const ips = forwardedFor
      .split(',')
      .map((ip) => this.normalizeIp(ip.trim()))
      .filter((ip) => net.isIP(ip) !== 0); // Only valid IPs

    if (ips.length === 0) {
      return '127.0.0.1'; // Fallback
    }

    // Walk from right to left to find the edge of trusted network
    for (let i = ips.length - 1; i >= 0; i--) {
      const ip = ips[i];
      if (!this.isIpTrusted(ip)) {
        return ip; // Found the rightmost untrusted IP (the real client)
      }
    }

    // All IPs in chain are trusted - return leftmost (original client)
    // This shouldn't happen in production but handles edge cases
    return ips[0];
  }

  // ===========================================================================
  // IP MATCHING UTILITIES
  // ===========================================================================

  /**
   * Check if an IP address is in the trusted proxies list
   */
  private isIpTrusted(ip: string): boolean {
    const normalizedIp = this.normalizeIp(ip);

    for (const proxy of this.trustedProxies) {
      if (this.isIpInCidr(normalizedIp, proxy)) {
        return true;
      }
    }

    return false;
  }

  /**
   * Check if an IP is within a CIDR range
   */
  private isIpInCidr(ip: string, cidr: TrustedProxyConfig): boolean {
    const ipVersion = net.isIP(ip);
    if (ipVersion === 0) return false;

    // Handle IPv6-mapped IPv4 comparison
    const normalizedIp = this.normalizeIp(ip);
    const ipIsV6 = net.isIP(normalizedIp) === 6;

    // Version mismatch
    if (ipIsV6 !== cidr.isIPv6) {
      return false;
    }

    if (ipIsV6) {
      return this.isIpv6InCidr(normalizedIp, cidr.address, cidr.prefixLength);
    } else {
      return this.isIpv4InCidr(normalizedIp, cidr.address, cidr.prefixLength);
    }
  }

  /**
   * Check if IPv4 address is in CIDR range
   */
  private isIpv4InCidr(
    ip: string,
    network: string,
    prefixLength: number,
  ): boolean {
    const ipNum = this.ipv4ToNumber(ip);
    const networkNum = this.ipv4ToNumber(network);
    const mask =
      prefixLength === 0 ? 0 : (0xffffffff << (32 - prefixLength)) >>> 0;

    return (ipNum & mask) === (networkNum & mask);
  }

  /**
   * Check if IPv6 address is in CIDR range
   * Simplified implementation using string prefix comparison
   */
  private isIpv6InCidr(
    ip: string,
    network: string,
    prefixLength: number,
  ): boolean {
    // Expand both addresses to full form for comparison
    const expandedIp = this.expandIpv6(ip);
    const expandedNetwork = this.expandIpv6(network);

    // Calculate how many hex characters to compare (each char = 4 bits)
    const charsToCompare = Math.floor(prefixLength / 4);
    const remainingBits = prefixLength % 4;

    // Compare full characters first
    if (
      expandedIp.substring(0, charsToCompare) !==
      expandedNetwork.substring(0, charsToCompare)
    ) {
      return false;
    }

    // Compare remaining bits if any
    if (remainingBits > 0 && charsToCompare < expandedIp.length) {
      const ipChar = parseInt(expandedIp[charsToCompare], 16);
      const netChar = parseInt(expandedNetwork[charsToCompare], 16);
      const mask = (0xf << (4 - remainingBits)) & 0xf;

      if ((ipChar & mask) !== (netChar & mask)) {
        return false;
      }
    }

    return true;
  }

  /**
   * Convert IPv4 address to number
   */
  private ipv4ToNumber(ip: string): number {
    const parts = ip.split('.');
    return (
      ((parseInt(parts[0]) << 24) |
        (parseInt(parts[1]) << 16) |
        (parseInt(parts[2]) << 8) |
        parseInt(parts[3])) >>>
      0
    );
  }

  /**
   * Expand IPv6 address to full form (no :: shorthand)
   * Returns hex string without colons
   */
  private expandIpv6(ip: string): string {
    // Handle :: expansion
    let parts: string[] = ip.split(':');

    if (ip.includes('::')) {
      const emptyIndex = parts.findIndex((p) => p === '');
      const missing = 8 - parts.filter((p) => p !== '').length;
      const expansion: string[] = Array(missing).fill('0000') as string[];

      // Use explicit typing to help TypeScript track types through filter
      const beforeEmpty: string[] = parts
        .slice(0, emptyIndex)
        .filter((p): p is string => p !== '');
      const afterEmpty: string[] = parts
        .slice(emptyIndex + 1)
        .filter((p): p is string => p !== '');

      parts = [...beforeEmpty, ...expansion, ...afterEmpty];
    }

    // Pad each segment to 4 hex chars and join
    return parts.map((p) => p.padStart(4, '0')).join('');
  }

  /**
   * Normalize IP address
   * - Handles IPv6-mapped IPv4 (::ffff:192.168.1.1 → 192.168.1.1)
   * - Trims whitespace
   * - Lowercase
   */
  private normalizeIp(ip: string): string {
    const normalized = ip.trim().toLowerCase();

    // Handle IPv6-mapped IPv4 addresses
    // Format: ::ffff:192.168.1.1 or ::ffff:c0a8:0101
    if (normalized.startsWith('::ffff:')) {
      const suffix = normalized.slice(7);

      // Check if it's dotted notation (192.168.1.1)
      if (suffix.includes('.')) {
        return suffix;
      }

      // Check if it's hex notation (c0a8:0101 = 192.168.1.1)
      if (suffix.includes(':')) {
        const hexParts = suffix.split(':');
        if (hexParts.length === 2) {
          const part1 = parseInt(hexParts[0], 16);
          const part2 = parseInt(hexParts[1], 16);
          return `${(part1 >> 8) & 0xff}.${part1 & 0xff}.${(part2 >> 8) & 0xff}.${part2 & 0xff}`;
        }
      }
    }

    return normalized;
  }

  // ===========================================================================
  // DIAGNOSTICS
  // ===========================================================================

  /**
   * Get current trusted proxy configuration for diagnostics
   */
  getTrustedProxies(): string[] {
    return this.trustedProxies.map((p) => `${p.address}/${p.prefixLength}`);
  }

  /**
   * Check if a specific IP would be trusted (for testing)
   */
  isIpInTrustedProxies(ip: string): boolean {
    return this.isIpTrusted(ip);
  }

  // ===========================================================================
  // PUBLIC IP ALLOWLIST MATCHING (Used by API Key Guard)
  // ===========================================================================

  /**
   * Check if an IP address matches any entry in an allowlist.
   *
   * Supports:
   * - Single IP addresses: "192.168.1.100", "2001:db8::1"
   * - CIDR ranges: "10.0.0.0/24", "2001:db8::/32"
   * - Mixed lists of both
   *
   * IMPORTANT:
   * - Returns TRUE if allowlist is empty/null (unrestricted)
   * - Returns TRUE if IP matches any entry
   * - Returns FALSE if IP matches no entries
   *
   * @param ip The IP address to check
   * @param allowlist Array of IPs and/or CIDR ranges
   * @returns true if IP is allowed, false if blocked
   */
  isIpInAllowlist(ip: string, allowlist: string[] | null | undefined): boolean {
    // Empty or null allowlist = unrestricted (allow all)
    if (!allowlist || allowlist.length === 0) {
      return true;
    }

    const normalizedIp = this.normalizeIp(ip);
    const ipVersion = net.isIP(normalizedIp);

    if (ipVersion === 0) {
      this.logger.warn(`Invalid IP address for allowlist check: ${ip}`);
      return false; // Invalid IP = deny
    }

    for (const entry of allowlist) {
      const trimmedEntry = entry.trim();
      if (!trimmedEntry) continue;

      // Check if entry is CIDR notation
      if (trimmedEntry.includes('/')) {
        const parsed = this.parseProxyConfig(trimmedEntry);
        if (parsed && this.isIpInCidr(normalizedIp, parsed)) {
          return true;
        }
      } else {
        // Single IP comparison (normalized)
        const normalizedEntry = this.normalizeIp(trimmedEntry);
        if (normalizedIp === normalizedEntry) {
          return true;
        }
      }
    }

    return false; // No match found
  }

  /**
   * Expose normalizeIp for external use (e.g., audit logging)
   */
  public normalizeIpAddress(ip: string): string {
    return this.normalizeIp(ip);
  }
}
