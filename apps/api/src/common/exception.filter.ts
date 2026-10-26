import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { Response } from 'express';

// Consistent error shape; never leaks stack traces or internals.
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private log = new Logger('Exceptions');
  catch(e: unknown, host: ArgumentsHost) {
    const res = host.switchToHttp().getResponse<Response>();
    if (e instanceof HttpException) {
      const body = e.getResponse();
      const message = typeof body === 'string' ? body : (body as { message?: string | string[] }).message ?? e.message;
      return res.status(e.getStatus()).json({ statusCode: e.getStatus(), message });
    }
    const code = (e as { code?: string })?.code;
    if (code === 'P2025') return res.status(404).json({ statusCode: 404, message: 'موردی یافت نشد' });
    if (code === 'P2002') return res.status(409).json({ statusCode: 409, message: 'مقدار تکراری' });
    this.log.error(e instanceof Error ? e.stack : String(e));
    res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({ statusCode: 500, message: 'خطای داخلی سرور' });
  }
}
