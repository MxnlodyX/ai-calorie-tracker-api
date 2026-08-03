import { Injectable, Logger, NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';

@Injectable()
export class HttpLoggingMiddleware implements NestMiddleware {
  private readonly logger = new Logger(HttpLoggingMiddleware.name);

  use(request: Request, response: Response, next: NextFunction): void {
    const startedAt = Date.now();
    const requestContext = {
      method: request.method,
      // request.path deliberately excludes query strings such as OAuth state.
      path: request.path,
    };

    // The finish event runs after controllers, guards, and exception filters set
    // the final HTTP status, so authentication failures are logged as well.
    response.once('finish', () => {
      const entry = {
        flow: 'http',
        step: 'request_completed',
        status: response.statusCode < 400 ? 'success' : 'failed',
        message: 'HTTP request completed',
        statusCode: response.statusCode,
        durationMs: Date.now() - startedAt,
        ...requestContext,
      };

      if (response.statusCode < 400) {
        this.logger.log(entry);
      } else {
        this.logger.warn(entry);
      }
    });

    next();
  }
}
