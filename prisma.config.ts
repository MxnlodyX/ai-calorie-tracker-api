import 'dotenv/config';
import { defineConfig } from 'prisma/config';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  // Prisma CLI uses the direct connection for migrations. Runtime traffic uses
  // DATABASE_URL through PrismaPg in PrismaService.
  datasource: {
    url: process.env.DIRECT_URL || process.env.DATABASE_URL,
  },
});
