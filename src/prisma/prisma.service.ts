import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleDestroy {
  constructor(configService: ConfigService) {
    const connectionString = configService.getOrThrow<string>('DATABASE_URL');

    // Prisma 7 sends every ORM query through this PostgreSQL driver adapter.
    super({ adapter: new PrismaPg(connectionString) });
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
