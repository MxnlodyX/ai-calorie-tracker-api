import {
  Body,
  Controller,
  Post,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { AuthenticatedRequest } from '../authentication/authentication.types';
import { JwtAuthGuard } from '../authentication/guards/jwt-auth.guard';
import { NutritionAnalysisService } from './nutrition-analysis.service';
import type { NutritionAnalyzeBody } from './nutrition-analysis.types';

type UploadedMealImage = {
  buffer: Buffer;
  originalname: string;
  mimetype: string;
  size: number;
};

@Controller('nutrition')
@UseGuards(JwtAuthGuard)
export class NutritionAnalysisController {
  constructor(
    private readonly nutritionAnalysisService: NutritionAnalysisService,
  ) {}

  @Post('analyze-image')
  @UseInterceptors(FileInterceptor('image'))
  async analyzeImage(
    @Req() request: AuthenticatedRequest,
    @UploadedFile() image: UploadedMealImage,
    @Body() body: NutritionAnalyzeBody,
  ) {
    return {
      message: 'Meal image analyzed successfully',
      data: await this.nutritionAnalysisService.analyzeImage(
        request.user.id,
        image,
        body,
      ),
    };
  }
}
