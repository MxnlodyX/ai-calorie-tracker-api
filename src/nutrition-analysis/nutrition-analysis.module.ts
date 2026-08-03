import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { NutritionAnalysisController } from './nutrition-analysis.controller';
import { NutritionAnalysisService } from './nutrition-analysis.service';

@Module({
  imports: [PrismaModule],
  controllers: [NutritionAnalysisController],
  providers: [NutritionAnalysisService],
})
export class NutritionAnalysisModule {}
