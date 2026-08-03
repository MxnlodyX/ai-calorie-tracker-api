import {
  BadRequestException,
  ConflictException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { NutritionAnalysisService } from './nutrition-analysis.service';

describe('NutritionAnalysisService', () => {
  let service: NutritionAnalysisService;
  const fetchMock = jest.fn();
  const prisma = {
    $transaction: jest.fn(),
    foodImage: {
      create: jest.fn(),
      deleteMany: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
    },
    aiAnalysis: {
      create: jest.fn(),
      count: jest.fn(),
      findFirst: jest.fn(),
      findUniqueOrThrow: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
    foodEntry: { create: jest.fn() },
    foodList: { create: jest.fn() },
  };
  const configService = {
    get: jest.fn(() => undefined),
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
    prisma.$transaction.mockImplementation(
      async (callback: (client: typeof prisma) => Promise<unknown>) =>
        callback(prisma),
    );
    prisma.aiAnalysis.count.mockResolvedValue(0);
    prisma.foodImage.deleteMany.mockResolvedValue({ count: 1 });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NutritionAnalysisService,
        { provide: ConfigService, useValue: configService },
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get(NutritionAnalysisService);
  });

  it('uploads an image without analyzing it or creating food data', async () => {
    fetchMock.mockResolvedValueOnce({ ok: true });
    prisma.foodImage.create.mockResolvedValue({
      id: 'image-1',
    });

    const result = await service.uploadImage('user-1', mealImage());

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        signal: expect.any(AbortSignal) as AbortSignal,
      }),
    );
    expect(prisma.foodImage.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: 'user-1',
        mimeType: 'image/jpeg',
        sizeBytes: 11,
      }) as Record<string, unknown>,
    });
    expect(prisma.aiAnalysis.create).not.toHaveBeenCalled();
    expect(prisma.foodEntry.create).not.toHaveBeenCalled();
    expect(result.id).toBe('image-1');
  });

  it('maps an aborted storage request to a safe availability error', async () => {
    fetchMock.mockRejectedValueOnce(
      new DOMException('The operation timed out', 'TimeoutError'),
    );

    await expect(
      service.uploadImage('user-1', mealImage()),
    ).rejects.toMatchObject({
      message: 'Unable to upload meal image',
      status: 503,
    });

    expect(prisma.foodImage.create).not.toHaveBeenCalled();
  });

  it('does not expose or read a Supabase error response body', async () => {
    const text = jest.fn().mockResolvedValue('internal storage details');
    fetchMock.mockResolvedValueOnce({ ok: false, status: 500, text });
    const upload = service.uploadImage('user-1', mealImage());

    await expect(upload).rejects.toBeInstanceOf(ServiceUnavailableException);
    await expect(upload).rejects.toThrow('Unable to upload meal image');

    expect(text).not.toHaveBeenCalled();
  });

  it('deletes the uploaded object when the image record cannot be created', async () => {
    const databaseError = new Error('database unavailable');
    fetchMock
      .mockResolvedValueOnce({ ok: true })
      .mockResolvedValueOnce({ ok: true });
    prisma.foodImage.create.mockRejectedValueOnce(databaseError);

    await expect(service.uploadImage('user-1', mealImage())).rejects.toBe(
      databaseError,
    );

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'https://example.supabase.co/storage/v1/object/meal-images',
      expect.objectContaining({
        method: 'DELETE',
        body: expect.stringMatching(
          /^\{"prefixes":\["users\/user-1\/meal-images\/.+\.jpg"\]\}$/,
        ) as string,
      }),
    );
  });

  it('preserves the database error when storage cleanup also fails', async () => {
    const databaseError = new Error('database unavailable');
    fetchMock
      .mockResolvedValueOnce({ ok: true })
      .mockRejectedValueOnce(new Error('storage unavailable'));
    prisma.foodImage.create.mockRejectedValueOnce(databaseError);

    await expect(service.uploadImage('user-1', mealImage())).rejects.toBe(
      databaseError,
    );

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('analyzes an owned upload and waits for confirmation', async () => {
    prisma.foodImage.findFirst.mockResolvedValue({
      id: 'image-1',
      userId: 'user-1',
      storagePath: 'users/user-1/meal-images/meal.jpg',
      mimeType: 'image/jpeg',
    });
    prisma.aiAnalysis.create.mockResolvedValue({ id: 'analysis-1' });
    prisma.aiAnalysis.update.mockResolvedValue({
      id: 'analysis-1',
      status: 'awaiting_confirmation',
      foodName: 'Chicken rice',
      kcal: 620,
    });
    mockImageDownloadAndAiResponse();

    const result = await service.analyzeImage('user-1', {
      foodImageId: 'image-1',
      mealType: 'lunch',
      eatenAt: '2026-08-04T05:00:00.000Z',
    });

    expect(prisma.foodImage.findFirst).toHaveBeenCalledWith({
      where: { id: 'image-1', userId: 'user-1' },
    });
    expect(prisma.aiAnalysis.update).toHaveBeenCalledWith({
      where: { id: 'analysis-1' },
      data: expect.objectContaining({
        status: 'awaiting_confirmation',
        foodName: 'Chicken rice',
        kcal: 620,
      }) as Record<string, unknown>,
    });
    expect(prisma.foodEntry.create).not.toHaveBeenCalled();
    expect(prisma.foodList.create).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      expect.any(String),
      expect.objectContaining({
        signal: expect.any(AbortSignal) as AbortSignal,
      }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'https://api.openai.com/v1/responses',
      expect.objectContaining({
        signal: expect.any(AbortSignal) as AbortSignal,
      }),
    );
    expect(result.analysis.status).toBe('awaiting_confirmation');
  });

  it('accepts edited AI data and does not save to Food List by default', async () => {
    prisma.aiAnalysis.findFirst.mockResolvedValue(awaitingAnalysis());
    prisma.aiAnalysis.updateMany.mockResolvedValue({ count: 1 });
    prisma.foodEntry.create.mockResolvedValue({ id: 'entry-1' });
    prisma.foodImage.update.mockResolvedValue({});
    prisma.aiAnalysis.update.mockResolvedValue({
      id: 'analysis-1',
      status: 'accepted',
      foodEntryId: 'entry-1',
    });

    const result = await service.acceptAnalysis('user-1', 'analysis-1', {
      foodName: 'Edited chicken rice',
      calories: 600,
    });

    expect(prisma.foodEntry.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: 'user-1',
        name: 'Edited chicken rice',
        kcal: 600,
      }) as Record<string, unknown>,
      select: expect.any(Object) as Record<string, unknown>,
    });
    expect(prisma.foodList.create).not.toHaveBeenCalled();
    expect(result.foodListItem).toBeNull();
  });

  it('runs food creation and relation updates in one atomic transaction', async () => {
    prisma.aiAnalysis.findFirst.mockResolvedValue(awaitingAnalysis());
    const transaction = {
      aiAnalysis: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        update: jest.fn(),
      },
      foodEntry: {
        create: jest.fn().mockResolvedValue({ id: 'entry-1' }),
      },
      foodList: { create: jest.fn() },
      foodImage: {
        update: jest
          .fn()
          .mockRejectedValue(new Error('relation update failed')),
      },
    };
    prisma.$transaction.mockImplementationOnce(
      async (callback: (client: typeof prisma) => Promise<unknown>) =>
        callback(transaction as unknown as typeof prisma),
    );

    await expect(
      service.acceptAnalysis('user-1', 'analysis-1', {}),
    ).rejects.toThrow('relation update failed');

    expect(transaction.aiAnalysis.updateMany).toHaveBeenCalledTimes(1);
    expect(transaction.foodEntry.create).toHaveBeenCalledTimes(1);
    expect(transaction.foodImage.update).toHaveBeenCalledTimes(1);
    expect(transaction.aiAnalysis.update).not.toHaveBeenCalled();
    expect(prisma.foodEntry.create).not.toHaveBeenCalled();
    expect(prisma.foodImage.update).not.toHaveBeenCalled();
    expect(prisma.aiAnalysis.update).not.toHaveBeenCalled();
  });

  it('saves confirmed data to Food List only when requested', async () => {
    prisma.aiAnalysis.findFirst.mockResolvedValue(awaitingAnalysis());
    prisma.aiAnalysis.updateMany.mockResolvedValue({ count: 1 });
    prisma.foodEntry.create.mockResolvedValue({ id: 'entry-1' });
    prisma.foodList.create.mockResolvedValue({ id: 'food-list-1' });
    prisma.foodImage.update.mockResolvedValue({});
    prisma.aiAnalysis.update.mockResolvedValue({ id: 'analysis-1' });

    const result = await service.acceptAnalysis('user-1', 'analysis-1', {
      saveToFoodList: true,
    });

    expect(prisma.foodList.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: 'user-1',
        name: 'Chicken rice',
        kcal: 620,
      }) as Record<string, unknown>,
    });
    expect(result.foodListItem).toEqual({ id: 'food-list-1' });
  });

  it('rejects an analysis without creating any food data', async () => {
    prisma.aiAnalysis.findFirst.mockResolvedValue(awaitingAnalysis());
    prisma.aiAnalysis.updateMany.mockResolvedValue({ count: 1 });
    fetchMock.mockResolvedValueOnce({ ok: true });
    prisma.aiAnalysis.findUniqueOrThrow.mockResolvedValue({
      id: 'analysis-1',
      status: 'rejected',
    });

    const result = await service.rejectAnalysis('user-1', 'analysis-1');

    expect(result.status).toBe('rejected');
    expect(prisma.aiAnalysis.count).toHaveBeenCalledWith({
      where: {
        foodImageId: 'image-1',
        status: { not: 'rejected' },
      },
    });
    expect(prisma.foodImage.deleteMany).toHaveBeenCalledWith({
      where: {
        id: 'image-1',
        foodEntryId: null,
        aiAnalyses: { every: { status: 'rejected' } },
      },
    });
    expect(prisma.foodEntry.create).not.toHaveBeenCalled();
    expect(prisma.foodList.create).not.toHaveBeenCalled();
  });

  it('keeps a rejected image that is linked to a food entry', async () => {
    prisma.aiAnalysis.findFirst.mockResolvedValue({
      ...awaitingAnalysis(),
      foodImage: {
        ...awaitingAnalysis().foodImage,
        foodEntryId: 'entry-1',
      },
    });
    prisma.aiAnalysis.updateMany.mockResolvedValue({ count: 1 });
    prisma.aiAnalysis.findUniqueOrThrow.mockResolvedValue({
      id: 'analysis-1',
      status: 'rejected',
    });

    await service.rejectAnalysis('user-1', 'analysis-1');

    expect(prisma.aiAnalysis.count).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(prisma.foodImage.deleteMany).not.toHaveBeenCalled();
  });

  it('keeps a rejected image while another analysis still uses it', async () => {
    prisma.aiAnalysis.findFirst.mockResolvedValue(awaitingAnalysis());
    prisma.aiAnalysis.updateMany.mockResolvedValue({ count: 1 });
    prisma.aiAnalysis.count.mockResolvedValue(1);
    prisma.aiAnalysis.findUniqueOrThrow.mockResolvedValue({
      id: 'analysis-1',
      status: 'rejected',
    });

    await service.rejectAnalysis('user-1', 'analysis-1');

    expect(fetchMock).not.toHaveBeenCalled();
    expect(prisma.foodImage.deleteMany).not.toHaveBeenCalled();
  });

  it('preserves rejection when rejected image cleanup fails', async () => {
    prisma.aiAnalysis.findFirst.mockResolvedValue(awaitingAnalysis());
    prisma.aiAnalysis.updateMany.mockResolvedValue({ count: 1 });
    prisma.aiAnalysis.findUniqueOrThrow.mockResolvedValue({
      id: 'analysis-1',
      status: 'rejected',
    });
    fetchMock.mockRejectedValueOnce(new Error('storage unavailable'));

    await expect(
      service.rejectAnalysis('user-1', 'analysis-1'),
    ).resolves.toMatchObject({ status: 'rejected' });

    expect(prisma.foodImage.deleteMany).not.toHaveBeenCalled();
  });

  it('retries an analysis using the existing image', async () => {
    prisma.aiAnalysis.findFirst.mockResolvedValue(awaitingAnalysis());
    prisma.aiAnalysis.updateMany.mockResolvedValue({ count: 1 });
    prisma.aiAnalysis.update.mockResolvedValue({
      id: 'analysis-1',
      status: 'awaiting_confirmation',
    });
    mockImageDownloadAndAiResponse();

    const result = await service.retryAnalysis('user-1', 'analysis-1');

    expect(prisma.aiAnalysis.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: 'pending' } }),
    );
    expect(result.status).toBe('awaiting_confirmation');
    expect(prisma.foodEntry.create).not.toHaveBeenCalled();
  });

  it('prevents accepting an analysis more than once', async () => {
    prisma.aiAnalysis.findFirst.mockResolvedValue({
      ...awaitingAnalysis(),
      status: 'accepted',
      foodEntryId: 'entry-1',
    });

    await expect(
      service.acceptAnalysis('user-1', 'analysis-1', {}),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('rejects unsupported image types before external calls', async () => {
    await expect(
      service.uploadImage('user-1', {
        ...mealImage(),
        originalname: 'meal.gif',
        mimetype: 'image/gif',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(fetchMock).not.toHaveBeenCalled();
    expect(prisma.foodImage.create).not.toHaveBeenCalled();
  });

  function mealImage() {
    return {
      buffer: Buffer.from('image-bytes'),
      originalname: 'meal.jpg',
      mimetype: 'image/jpeg',
      size: 11,
    };
  }

  function awaitingAnalysis() {
    return {
      id: 'analysis-1',
      userId: 'user-1',
      foodImageId: 'image-1',
      foodEntryId: null,
      foodName: 'Chicken rice',
      kcal: 620,
      proteinG: 35,
      fatG: 20,
      carbG: 70,
      status: 'awaiting_confirmation',
      model: 'gpt-4o-mini',
      rawAiResponse: {
        entryDefaults: {
          mealType: 'lunch',
          eatenAt: '2026-08-04T05:00:00.000Z',
        },
      },
      foodImage: {
        id: 'image-1',
        foodEntryId: null,
        storagePath: 'users/user-1/meal-images/meal.jpg',
        mimeType: 'image/jpeg',
      },
    };
  }

  function mockImageDownloadAndAiResponse(): void {
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        arrayBuffer: () => Promise.resolve(Buffer.from('image-bytes')),
      })
      .mockResolvedValueOnce({
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
  }
});
