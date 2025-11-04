import { ConfigService } from '@nestjs/config';
import * as fs from 'fs';
import * as path from 'path';

export interface HTTPSConfig {
  key: Buffer;
  cert: Buffer;
  ca?: Buffer;
}

export class HTTPSConfigService {
  constructor(private configService: ConfigService) {}

  /**
   * Get HTTPS configuration
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
   * Generate self-signed certificate for development
   */
  generateSelfSignedCert(): { key: string; cert: string } {
    const { execSync } = require('child_process');
    const crypto = require('crypto');

    try {
      // Generate private key
      const key = crypto.generateKeyPairSync('rsa', {
        modulusLength: 2048,
        publicKeyEncoding: {
          type: 'spki',
          format: 'pem',
        },
        privateKeyEncoding: {
          type: 'pkcs8',
          format: 'pem',
        },
      });

      // Generate self-signed certificate
      const cert = execSync(
        `openssl req -x509 -new -key <(echo "${key.privateKey}") -days 365 -out /dev/stdout -subj "/C=US/ST=State/L=City/O=Organization/CN=localhost"`,
        {
          shell: true,
          encoding: 'utf8',
        },
      );

      return {
        key: key.privateKey,
        cert: cert,
      };
    } catch (error) {
      console.error('Failed to generate self-signed certificate:', error);
      throw new Error('Self-signed certificate generation failed');
    }
  }

  /**
   * Validate SSL certificate
   */
  validateSSLCertificate(certPath: string): boolean {
    try {
      const cert = fs.readFileSync(certPath);
      const { execSync } = require('child_process');

      execSync(`openssl x509 -in ${certPath} -text -noout`, { stdio: 'pipe' });
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Get certificate expiration date
   */
  getCertificateExpiration(certPath: string): Date | null {
    try {
      const { execSync } = require('child_process');
      const output = execSync(`openssl x509 -in ${certPath} -noout -enddate`, {
        encoding: 'utf8',
        stdio: 'pipe',
      });

      const dateString = output.split('=')[1].trim();
      return new Date(dateString);
    } catch (error) {
      return null;
    }
  }
}
