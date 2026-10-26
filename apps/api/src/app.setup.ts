import { INestApplication, ValidationPipe } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { AllExceptionsFilter } from './common/exception.filter';

/** Shared by main.ts and the e2e tests so tests exercise the real pipeline. */
export function configureApp(app: INestApplication) {
  (app as NestExpressApplication).set('trust proxy', 1);
  app.use(helmet());
  app.use(cookieParser());
  app.setGlobalPrefix('api');
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
  app.useGlobalFilters(new AllExceptionsFilter());
  const origin = process.env.CORS_ORIGIN;
  if (origin) app.enableCors({ origin: origin.split(','), credentials: true });
}
