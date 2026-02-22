import { Catch, ArgumentsHost, Logger } from '@nestjs/common';
import { BaseWsExceptionFilter, WsException } from '@nestjs/websockets';
import { Socket } from 'socket.io';

/**
 * Structured error payload emitted to WebSocket clients.
 *
 * Consistent shape lets frontend handle all WS errors uniformly:
 *   socket.on('exception', (error: WsErrorResponse) => { ... });
 */
export interface WsErrorResponse {
  /** Always 'error' for error events */
  status: 'error';

  /** Human-readable, security-safe error message */
  message: string;

  /** ISO timestamp for client-side correlation */
  timestamp: string;
}

/**
 * WebSocket Exception Filter
 *
 * Catches WsException in the WebSocket context and emits a structured
 * error payload to the originating socket. This ensures clients receive
 * actionable, consistent error responses instead of silent failures.
 *
 * SECURITY:
 * - Never leaks internal error details (stack traces, query info)
 * - Logs at WARNING level for security audit trail / intrusion detection
 * - Does NOT disconnect the client — they can retry or join other rooms
 *
 * Usage: Apply at class level on the gateway:
 *   @UseFilters(WsExceptionFilter)
 *   export class BoardGateway { ... }
 */
@Catch(WsException)
export class WsExceptionFilter extends BaseWsExceptionFilter {
  private readonly logger = new Logger(WsExceptionFilter.name);

  catch(exception: WsException, host: ArgumentsHost): void {
    const client = host.switchToWs().getClient<Socket>();

    // Extract the error message from the WsException
    const error = exception.getError();
    const message =
      typeof error === 'string'
        ? error
        : typeof error === 'object' && error !== null && 'message' in error
          ? String((error as Record<string, unknown>).message)
          : 'An error occurred';

    // Construct structured error response
    const errorResponse: WsErrorResponse = {
      status: 'error',
      message,
      timestamp: new Date().toISOString(),
    };

    // Security audit log — WARNING level for intrusion detection systems
    this.logger.warn(`[WS_ERROR] Client ${client.id}: ${message}`);

    // Emit to the specific client socket (not broadcast)
    client.emit('exception', errorResponse);
  }
}
