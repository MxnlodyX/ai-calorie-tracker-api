import {
  MiddlewareConsumer,
  Module,
  NestModule,
  RequestMethod,
} from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthenticationModule } from './authentication/authentication.module';
import configuration from './config/configuration';
import { PrismaModule } from './prisma/prisma.module';
import { HttpLoggingMiddleware } from './common/middleware/http-logging.middleware';
import { FoodsModule } from './foods/foods.module';
import { NutritionAnalysisModule } from './nutrition-analysis/nutrition-analysis.module';
import { UsersModule } from './users/users.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, load: [configuration] }),
    PrismaModule,
    AuthenticationModule,
    UsersModule,
    FoodsModule,
    NutritionAnalysisModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer
      .apply(HttpLoggingMiddleware)
      .forRoutes({ path: '{*splat}', method: RequestMethod.ALL });
  }
}
