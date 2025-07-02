// src/revisions/interceptors/user-id.interceptor.ts
import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';

@Injectable()
export class UserIdInterceptor implements NestInterceptor {
  intercept(ctx: ExecutionContext, next: CallHandler<any>): Observable<any> {
    // Monkey‑patch DataSource.getQueryRunner to inject userId
    // const origRunner = contextData.runner; // Unused
    // Simplest: for every request attach userId to dataSource.manager.queryRunner.data
    return next.handle();
  }
}
