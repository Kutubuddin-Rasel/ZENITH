import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Response } from 'express';
import { ApiResponse } from '../interfaces/api-response.interface';

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    // const request = ctx.getRequest<Request>(); // Unused

    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    const message =
      exception instanceof HttpException
        ? exception.message
        : 'Internal server error';

    // Extract details if available (e.g. class-validator array)

    let details: any = null;
    if (exception instanceof HttpException) {
      const res = exception.getResponse();
      if (typeof res === 'object' && res !== null && 'message' in res) {
        // If the response object has a message property that is an array (class-validator)
        // usage might vary, but we capture the raw response for debugging or detailed errors
        details = res;

        // DEBUG: Log validation errors explicitly
        if (status === 400) {
          this.logger.error(`Validation Error Details: ${JSON.stringify(res, null, 2)}`);
        }
      }
    } else {
      // Log generic errors
      this.logger.error(exception);
    }

    const errorResponse: ApiResponse<null> = {
      success: false,
      statusCode: status,
      message,
      data: null,
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      meta: details ? { details } : undefined,
      timestamp: new Date().toISOString(),
    };

    response.status(status).json(errorResponse);
  }
}
