import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from '@nestjs/common';
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);
  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const request = ctx.getRequest();
    const response = ctx.getResponse();
    const status = exception instanceof HttpException ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;
    const raw = exception instanceof HttpException ? exception.getResponse() : 'Internal server error';
    const message = typeof raw === 'string' ? raw : (raw as any).message ?? 'Request failed';
    if (status >= 500) this.logger.error({ requestId: request.requestId, path: request.url, exception });
    response.status(status).json({ statusCode: status, error: typeof raw === 'object' ? (raw as any).error : undefined, message, path: request.url, timestamp: new Date().toISOString(), requestId: request.requestId });
  }
}
