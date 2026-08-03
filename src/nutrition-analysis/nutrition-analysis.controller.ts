import {
  Body,
  Controller,
  Param,
  Post,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { AuthenticatedRequest } from '../authentication/authentication.types';
import { JwtAuthGuard } from '../authentication/guards/jwt-auth.guard';
import { MAX_NUTRITION_IMAGE_SIZE_BYTES } from './nutrition-analysis.constants';
import { NutritionAnalysisService } from './nutrition-analysis.service';
import type {
  ConfirmNutritionAnalysisBody,
  NutritionAnalyzeBody,
} from './nutrition-analysis.types';

type UploadedMealImage = {
  buffer: Buffer;
  originalname: string;
  mimetype: string;
  size: number;
};

@Controller()
@UseGuards(JwtAuthGuard)
export class NutritionAnalysisController {
  constructor(
    private readonly nutritionAnalysisService: NutritionAnalysisService,
  ) {}

  @Post('upload/food-image')
  @UseInterceptors(
    FileInterceptor('image', {
      limits: { fileSize: MAX_NUTRITION_IMAGE_SIZE_BYTES },
    }),
  )
  async uploadImage(
    @Req() request: AuthenticatedRequest,
    @UploadedFile() image: UploadedMealImage,
  ) {
    return {
      message: 'Food image uploaded successfully',
      data: await this.nutritionAnalysisService.uploadImage(
        request.user.id,
        image,
      ),
    };
  }

  @Post('analyze/food-image')
  async analyzeImage(
    @Req() request: AuthenticatedRequest,
    @Body() body: NutritionAnalyzeBody,
  ) {
    return {
      message: 'Food image analyzed successfully',
      data: await this.nutritionAnalysisService.analyzeImage(
        request.user.id,
        body,
      ),
    };
  }

  @Post('foods/from-analysis')
  async createFoodFromAnalysis(
    @Req() request: AuthenticatedRequest,
    @Body() body: ConfirmNutritionAnalysisBody,
  ) {
    return {
      message: 'AI analysis accepted and food entry created successfully',
      data: await this.nutritionAnalysisService.acceptAnalysis(
        request.user.id,
        body.analysisId,
        body,
      ),
    };
  }

  @Post('analyze/:analysisId/accept')
  async acceptAnalysis(
    @Req() request: AuthenticatedRequest,
    @Param('analysisId') analysisId: string,
    @Body() body: ConfirmNutritionAnalysisBody,
  ) {
    return {
      message: 'AI analysis accepted and food entry created successfully',
      data: await this.nutritionAnalysisService.acceptAnalysis(
        request.user.id,
        analysisId,
        body,
      ),
    };
  }

  @Post('analyze/:analysisId/reject')
  async rejectAnalysis(
    @Req() request: AuthenticatedRequest,
    @Param('analysisId') analysisId: string,
  ) {
    return {
      message: 'AI analysis rejected successfully',
      data: await this.nutritionAnalysisService.rejectAnalysis(
        request.user.id,
        analysisId,
      ),
    };
  }

  @Post('analyze/:analysisId/retry')
  async retryAnalysis(
    @Req() request: AuthenticatedRequest,
    @Param('analysisId') analysisId: string,
  ) {
    return {
      message: 'Food image analyzed again successfully',
      data: await this.nutritionAnalysisService.retryAnalysis(
        request.user.id,
        analysisId,
      ),
    };
  }
}
