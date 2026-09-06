import { Injectable, Logger } from '@nestjs/common';
import type {
  IResponseCompressor,
  CompressionOptions,
} from '../interfaces/performance.interfaces';
import { Request, Response } from 'express';

/**
 * ResponseCompressorService — Gzip Compression/Decompression.
 *
 * SRP: Owns gzip compression of response payloads, decompression of
 * cached compressed data, and compression-related HTTP headers.
 * Pure infrastructure logic — no cache or domain dependencies.
 */
@Injectable()
export class ResponseCompressorService implements IResponseCompressor {
  private readonly logger = new Logger(ResponseCompressorService.name);
  private readonly compressionOptions: CompressionOptions = {
    threshold: 1024, // 1KB
    level: 6,
    memLevel: 8,
  };

  /**
   * Compress response data to gzip Buffer.
   *
   * TYPE SAFETY (Phase 5):
   * Uses generic <T> to accept typed input. Output is always Buffer.
   * JSON.stringify accepts any serializable type.
   *
   * @param data - Input data of type T (must be JSON-serializable)
   * @returns Promise<Buffer> - Compressed or uncompressed buffer
   */
  async compressResponse<T>(data: T): Promise<Buffer> {
    const zlib = await import('zlib');
    const jsonString = JSON.stringify(data);
    const buffer = Buffer.from(jsonString, 'utf8');

    // Only compress if data is larger than threshold
    if (buffer.length < this.compressionOptions.threshold) {
      return buffer;
    }

    return new Promise((resolve, reject) => {
      zlib.gzip(
        buffer,
        {
          level: this.compressionOptions.level,
          memLevel: this.compressionOptions.memLevel,
        },
        (err, compressed) => {
          if (err) {
            reject(err);
          } else {
            resolve(compressed);
          }
        },
      );
    });
  }

  /**
   * Decompress gzip Buffer back to typed data.
   *
   * TYPE SAFETY (Phase 5):
   * Uses generic <T> so caller specifies expected output type.
   * JSON.parse returns unknown, we cast to T inside the function.
   *
   * USAGE:
   *   const user = await decompressResponse<User>(buffer);
   *   // user is typed as User, not any
   *
   * @param compressedData - Gzip compressed Buffer (or uncompressed JSON buffer)
   * @returns Promise<T> - Parsed and typed data
   */
  async decompressResponse<T>(compressedData: Buffer): Promise<T> {
    const zlib = await import('zlib');

    return new Promise((resolve, reject) => {
      zlib.gunzip(compressedData, (err, decompressed) => {
        if (err) {
          reject(err);
        } else {
          try {
            const jsonString = decompressed.toString('utf8');
            // TYPE ASSERTION: Cast JSON.parse result to caller-specified type T
            // This is safe because caller knows what type they compressed
            const parsed: unknown = JSON.parse(jsonString);
            resolve(parsed as T);
          } catch (parseError) {
            reject(
              parseError instanceof Error
                ? parseError
                : new Error(String(parseError)),
            );
          }
        }
      });
    });
  }

  /**
   * Set compression headers on the response.
   */
  setCompressionHeaders(res: Response, compressed: boolean = false): void {
    if (compressed) {
      res.set('Content-Encoding', 'gzip');
      res.set('Vary', 'Accept-Encoding');
    }
  }

  /**
   * Check if client accepts gzip compression.
   */
  acceptsCompression(req: Request): boolean {
    const acceptEncoding = req.headers['accept-encoding'] || '';
    return acceptEncoding.includes('gzip');
  }
}
