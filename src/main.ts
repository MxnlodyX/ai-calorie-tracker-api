import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module';
import cookieParser from 'cookie-parser';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const configService = app.get(ConfigService);

  // Cookies are parsed before JwtStrategy reads access_token from the request.
  app.use(cookieParser());
  app.enableCors({
    origin: configService.getOrThrow<string>('frontendOrigin'),
    credentials: true,
  });
  await app.listen(Number(process.env.PORT) || 4000);
}
void bootstrap();
