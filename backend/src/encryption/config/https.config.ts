import { ConfigService } from '@nestjs/config';
import * as fs from 'fs';
import * as forge from 'node-forge';

export interface HTTPSConfig {
  key: Buffer;
  cert: Buffer;
  ca?: Buffer;
}

/**
 * Options for generating development certificates.
 */
export interface DevCertificateOptions {
  /** Common Name for the certificate (default: 'localhost') */
  commonName?: string;
  /** Validity period in days (default: 365) */
  validityDays?: number;
  /** Organization name (default: 'Development') */
  organization?: string;
  /** Country code (default: 'US') */
  country?: string;
  /** State/Province (default: 'State') */
  state?: string;
  /** City/Locality (default: 'City') */
  locality?: string;
  /** RSA key size in bits (default: 2048) */
  keyBits?: number;
}

/**
 * Generated certificate result.
 */
export interface GeneratedCertificate {
  /** Private key in PEM format */
  privateKey: string;
  /** Public key in PEM format */
  publicKey: string;
  /** Certificate in PEM format */
  certificate: string;
  /** Certificate expiration date */
  expiresAt: Date;
  /** Certificate serial number */
  serialNumber: string;
}

export class HTTPSConfigService {
  constructor(private configService: ConfigService) {}

  /**
   * Get HTTPS configuration from files
   */
  getHTTPSConfig(): HTTPSConfig | null {
    const sslKeyPath = this.configService.get<string>('SSL_KEY_PATH');
    const sslCertPath = this.configService.get<string>('SSL_CERT_PATH');
    const sslCaPath = this.configService.get<string>('SSL_CA_PATH');

    if (!sslKeyPath || !sslCertPath) {
      return null;
    }

    try {
      const key = fs.readFileSync(sslKeyPath);
      const cert = fs.readFileSync(sslCertPath);
      const ca = sslCaPath ? fs.readFileSync(sslCaPath) : undefined;

      return { key, cert, ca };
    } catch (error) {
      console.error('Failed to load SSL certificates:', error);
      return null;
    }
  }

  /**
   * Generate self-signed certificate for development using pure JavaScript.
   *
   * SECURITY IMPROVEMENT:
   * - Replaces shell-based OpenSSL execution (command injection risk)
   * - Uses node-forge pure JS implementation
   * - Platform-independent (no OpenSSL binary required)
   *
   * PERFORMANCE NOTE:
   * - Uses ASYNC key generation to avoid blocking the event loop
   * - 2048-bit RSA key generation takes ~100-500ms depending on hardware
   * - For production, use pre-generated certificates
   *
   * @param options - Certificate generation options
   * @returns Promise resolving to generated certificate and keys in PEM format
   */
  async generateDevCertificate(
    options?: DevCertificateOptions,
  ): Promise<GeneratedCertificate> {
    // Apply defaults
    const opts: Required<DevCertificateOptions> = {
      commonName: options?.commonName ?? 'localhost',
      validityDays: options?.validityDays ?? 365,
      organization: options?.organization ?? 'Development',
      country: options?.country ?? 'US',
      state: options?.state ?? 'State',
      locality: options?.locality ?? 'City',
      keyBits: options?.keyBits ?? 2048,
    };

    console.log(
      `Generating ${opts.keyBits}-bit RSA key pair (async to avoid blocking)...`,
    );

    // ASYNC key generation - does NOT block the event loop
    const keypair = await new Promise<forge.pki.rsa.KeyPair>(
      (resolve, reject) => {
        forge.pki.rsa.generateKeyPair(
          { bits: opts.keyBits, workers: -1 }, // workers: -1 uses Web Workers if available
          (err, keys) => {
            if (err) reject(err);
            else resolve(keys);
          },
        );
      },
    );

    console.log('Key pair generated, creating X.509 certificate...');

    // Create certificate
    const cert = forge.pki.createCertificate();

    // Set public key
    cert.publicKey = keypair.publicKey;

    // Generate cryptographically random serial number (20 bytes = 160 bits)
    const serialHex = forge.util.bytesToHex(forge.random.getBytesSync(20));
    cert.serialNumber = serialHex;

    // Set validity period
    const now = new Date();
    const expiresAt = new Date(
      now.getTime() + opts.validityDays * 24 * 60 * 60 * 1000,
    );
    cert.validity.notBefore = now;
    cert.validity.notAfter = expiresAt;

    // Set subject (same as issuer for self-signed)
    const attrs: forge.pki.CertificateField[] = [
      { name: 'commonName', value: opts.commonName },
      { name: 'countryName', value: opts.country },
      { name: 'stateOrProvinceName', value: opts.state },
      { name: 'localityName', value: opts.locality },
      { name: 'organizationName', value: opts.organization },
    ];

    cert.setSubject(attrs);
    cert.setIssuer(attrs); // Self-signed: issuer = subject

    // Set extensions
    cert.setExtensions([
      {
        name: 'basicConstraints',
        cA: true, // Certificate Authority (can sign other certs)
      },
      {
        name: 'keyUsage',
        keyCertSign: true,
        digitalSignature: true,
        keyEncipherment: true,
      },
      {
        name: 'extKeyUsage',
        serverAuth: true,
        clientAuth: true,
      },
      {
        name: 'subjectAltName',
        altNames: [
          { type: 2, value: opts.commonName }, // DNS name
          { type: 2, value: 'localhost' },
          { type: 7, ip: '127.0.0.1' }, // IP address
          { type: 7, ip: '::1' }, // IPv6 localhost
        ],
      },
    ]);

    // Self-sign with SHA-256 (SHA-1 is deprecated)
    cert.sign(keypair.privateKey, forge.md.sha256.create());

    console.log(
      `Certificate generated: CN=${opts.commonName}, expires=${expiresAt.toISOString()}`,
    );

    // Convert to PEM format
    return {
      privateKey: forge.pki.privateKeyToPem(keypair.privateKey),
      publicKey: forge.pki.publicKeyToPem(keypair.publicKey),
      certificate: forge.pki.certificateToPem(cert),
      expiresAt,
      serialNumber: serialHex,
    };
  }

  /**
   * Generate self-signed certificate (sync wrapper for backward compatibility).
   *
   * @deprecated Use generateDevCertificate() instead for better performance
   */
  generateSelfSignedCert(): { key: string; cert: string } {
    // Use forge.pki.rsa.generateKeyPair synchronously (blocks event loop)
    console.warn(
      'generateSelfSignedCert() is deprecated. Use async generateDevCertificate() instead.',
    );

    const keypair = forge.pki.rsa.generateKeyPair({ bits: 2048 });
    const cert = forge.pki.createCertificate();

    cert.publicKey = keypair.publicKey;
    cert.serialNumber = forge.util.bytesToHex(forge.random.getBytesSync(20));

    const now = new Date();
    cert.validity.notBefore = now;
    cert.validity.notAfter = new Date(
      now.getTime() + 365 * 24 * 60 * 60 * 1000,
    );

    const attrs: forge.pki.CertificateField[] = [
      { name: 'commonName', value: 'localhost' },
      { name: 'countryName', value: 'US' },
      { name: 'stateOrProvinceName', value: 'State' },
      { name: 'localityName', value: 'City' },
      { name: 'organizationName', value: 'Organization' },
    ];

    cert.setSubject(attrs);
    cert.setIssuer(attrs);
    cert.sign(keypair.privateKey, forge.md.sha256.create());

    return {
      key: forge.pki.privateKeyToPem(keypair.privateKey),
      cert: forge.pki.certificateToPem(cert),
    };
  }

  /**
   * Validate SSL certificate using pure JavaScript.
   *
   * @param certPath - Path to certificate file
   * @returns true if certificate is valid and not expired
   */
  validateSSLCertificate(certPath: string): boolean {
    try {
      const certPem = fs.readFileSync(certPath, 'utf8');
      const cert = forge.pki.certificateFromPem(certPem);

      // Check if certificate is currently valid
      const now = new Date();
      const notBefore = cert.validity.notBefore;
      const notAfter = cert.validity.notAfter;

      if (now < notBefore || now > notAfter) {
        console.warn(
          `Certificate is not valid: ${notBefore.toISOString()} to ${notAfter.toISOString()}`,
        );
        return false;
      }

      return true;
    } catch (error) {
      console.error('Certificate validation failed:', error);
      return false;
    }
  }

  /**
   * Get certificate expiration date using pure JavaScript.
   *
   * @param certPath - Path to certificate file
   * @returns Expiration date or null if parsing fails
   */
  getCertificateExpiration(certPath: string): Date | null {
    try {
      const certPem = fs.readFileSync(certPath, 'utf8');
      const cert = forge.pki.certificateFromPem(certPem);
      return cert.validity.notAfter;
    } catch (error) {
      console.error('Failed to parse certificate:', error);
      return null;
    }
  }

  /**
   * Get certificate details for debugging/logging.
   *
   * @param certPath - Path to certificate file
   * @returns Certificate details or null if parsing fails
   */
  getCertificateDetails(certPath: string): {
    subject: string;
    issuer: string;
    serialNumber: string;
    notBefore: Date;
    notAfter: Date;
    isExpired: boolean;
    isCA: boolean;
  } | null {
    try {
      const certPem = fs.readFileSync(certPath, 'utf8');
      const cert = forge.pki.certificateFromPem(certPem);

      const getAttrValue = (
        attrs: forge.pki.CertificateField[],
        name: string,
      ): string => {
        const attr = attrs.find((a) => a.name === name);
        return attr?.value?.toString() ?? '';
      };

      const subjectCN = getAttrValue(cert.subject.attributes, 'commonName');
      const issuerCN = getAttrValue(cert.issuer.attributes, 'commonName');

      // Check for CA extension
      const basicConstraints = cert.getExtension('basicConstraints') as
        | { cA?: boolean }
        | undefined;

      return {
        subject: subjectCN,
        issuer: issuerCN,
        serialNumber: cert.serialNumber,
        notBefore: cert.validity.notBefore,
        notAfter: cert.validity.notAfter,
        isExpired: new Date() > cert.validity.notAfter,
        isCA: basicConstraints?.cA ?? false,
      };
    } catch (error) {
      console.error('Failed to parse certificate:', error);
      return null;
    }
  }
}
