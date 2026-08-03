import { BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { NutritionAnalysisService } from './nutrition-analysis.service';

describe('NutritionAnalysisService', () => {
  let service: NutritionAnalysisService;
  const fetchMock = jest.fn();
  const prisma = {
    $transaction: jest.fn<(args: Promise<unknown>[]) => Promise<unknown[]>>(),
    foodImage: {
      create: jest.fn(),
      update: jest.fn(),
    },
    aiAnalysis: {
      create: jest.fn(),
      update: jest.fn(),
    },
    foodEntry: {
      create: jest.fn(),
    },
  };
  const configService = {
    get: jest.fn((key: string) =>
      key === 'openai.imageAnalysisModel' ? undefined : undefined,
    ),
    getOrThrow: jest.fn((key: string) => {
      const values: Record<string, string> = {
        'supabase.url': 'https://example.supabase.co',
        'supabase.serviceRoleKey': 'service-role',
        'supabase.storageBucket': 'meal-images',
        'openai.apiKey': 'openai-key',
      };
      return values[key];
    }),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    global.fetch = fetchMock;
    prisma.$transaction.mockImplementation(async (operations) =>
      Promise.all(operations),
    );

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NutritionAnalysisService,
        { provide: ConfigService, useValue: configService },
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get(NutritionAnalysisService);
  });

  it('uploads the image, analyzes it, and creates linked records', async () => {
    fetchMock.mockResolvedValueOnce({ ok: true }).mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          output: [
            {
              content: [
                {
                  type: 'output_text',
                  text: JSON.stringify({
                    foodName: 'Chicken rice',
                    kcal: 620,
                    proteinG: 35,
                    fatG: 20,
                    carbG: 70,
                    confidence: 0.82,
                    items: [],
                    notes: 'Estimated from image.',
                  }),
                },
              ],
            },
          ],
        }),
    });
    prisma.foodImage.create.mockResolvedValue({ id: 'image-1' });
    prisma.aiAnalysis.create.mockResolvedValue({ id: 'analysis-1' });
    prisma.foodEntry.create.mockResolvedValue({ id: 'entry-1' });
    prisma.aiAnalysis.update.mockResolvedValue({ id: 'analysis-1' });
    prisma.foodImage.update.mockResolvedValue({});

    const result = await service.analyzeImage(
      'user-1',
      {
        buffer: Buffer.from('image-bytes'),
        originalname: 'meal.jpg',
        mimetype: 'image/jpeg',
        size: 11,
      },
      { mealType: 'lunch', eatenAt: '2026-08-04T05:00:00.000Z' },
    );

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const expectedImageData = expect.objectContaining({
      userId: 'user-1',
      mimeType: 'image/jpeg',
      sizeBytes: 11,
    }) as Record<string, unknown>;
    const expectedFoodEntryData = expect.objectContaining({
      userId: 'user-1',
      name: 'Chicken rice',
      kcal: 620,
      proteinG: 35,
      fatG: 20,
      carbG: 70,
      mealType: 'lunch',
      eatenAt: new Date('2026-08-04T05:00:00.000Z'),
    }) as Record<string, unknown>;

    expect(prisma.foodImage.create).toHaveBeenCalledWith({
      data: expectedImageData,
    });
    expect(prisma.foodEntry.create).toHaveBeenCalledWith({
      data: expectedFoodEntryData,
      select: expect.any(Object) as Record<string, unknown>,
    });
    expect(result.image.bucket).toBe('meal-images');
  });

  it('rejects unsupported image types before external calls', async () => {
    await expect(
      service.analyzeImage(
        'user-1',
        {
          buffer: Buffer.from('not-image'),
          originalname: 'meal.gif',
          mimetype: 'image/gif',
          size: 9,
        },
        {},
      ),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(fetchMock).not.toHaveBeenCalled();
    expect(prisma.foodImage.create).not.toHaveBeenCalled();
  });
});
