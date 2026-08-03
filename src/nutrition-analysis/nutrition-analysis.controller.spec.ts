import type {
  CanActivate,
  ExecutionContext,
  INestApplication,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types';
import { JwtAuthGuard } from '../authentication/guards/jwt-auth.guard';
import { MAX_NUTRITION_IMAGE_SIZE_BYTES } from './nutrition-analysis.constants';
import { NutritionAnalysisController } from './nutrition-analysis.controller';
import { NutritionAnalysisService } from './nutrition-analysis.service';

describe('NutritionAnalysisController', () => {
  let app: INestApplication<App>;
  const uploadImage = jest.fn();
  const authGuard: CanActivate = {
    canActivate(context: ExecutionContext) {
      const request = context.switchToHttp().getRequest<{
        user: { id: string };
      }>();
      request.user = { id: 'user-1' };
      return true;
    },
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module = await Test.createTestingModule({
      controllers: [NutritionAnalysisController],
      providers: [
        {
          provide: NutritionAnalysisService,
          useValue: {
            uploadImage,
            analyzeImage: jest.fn(),
            acceptAnalysis: jest.fn(),
            rejectAnalysis: jest.fn(),
            retryAnalysis: jest.fn(),
          },
        },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue(authGuard)
      .compile();

    app = module.createNestApplication();
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it('rejects an oversized image before calling the upload service', async () => {
    await request(app.getHttpServer())
      .post('/upload/food-image')
      .attach('image', Buffer.alloc(MAX_NUTRITION_IMAGE_SIZE_BYTES + 1), {
        filename: 'meal.jpg',
        contentType: 'image/jpeg',
      })
      .expect(413);

    expect(uploadImage).not.toHaveBeenCalled();
  });
});
