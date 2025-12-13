import { ConfigService } from '@nestjs/config';
import * as fs from 'fs';
import { execSync } from 'child_process';
import * as crypto from 'crypto';

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
          shell: '/bin/bash',
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
      execSync(`openssl x509 -in ${certPath} -text -noout`, { stdio: 'pipe' });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get certificate expiration date
   */
  getCertificateExpiration(certPath: string): Date | null {
    try {
      const output = execSync(`openssl x509 -in ${certPath} -noout -enddate`, {
        encoding: 'utf8',
        stdio: 'pipe',
      });

      const dateString = output.split('=')[1].trim();
      return new Date(dateString);
    } catch {
      return null;
    }
  }
}
