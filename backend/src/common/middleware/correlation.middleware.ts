import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { ClsService } from 'nestjs-cls';
import { randomUUID } from 'crypto';

@Injectable()
export class CorrelationMiddleware implements NestMiddleware {
  constructor(private readonly cls: ClsService) {}

  use(req: Request, res: Response, next: NextFunction) {
    // Accept existing ID from upstream proxy, or generate new
    const requestId = (req.headers['x-request-id'] as string) || randomUUID();

    // Store in CLS for automatic propagation to all services
    this.cls.set('requestId', requestId);
    this.cls.set('method', req.method);
    this.cls.set('path', req.url);

    // Echo back for client debugging
    res.setHeader('X-Request-ID', requestId);

    next();
  }
}
