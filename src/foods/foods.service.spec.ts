import { BadRequestException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { FoodsService } from './foods.service';

describe('FoodsService', () => {
  let service: FoodsService;
  const prisma = {
    $transaction: jest.fn<(args: unknown[]) => Promise<unknown[]>>(),
    foodEntry: {
      create: jest.fn<(args: unknown) => Promise<unknown>>(),
      findMany: jest.fn<(args: unknown) => Promise<unknown[]>>(),
      findFirstOrThrow: jest.fn<(args: unknown) => Promise<unknown>>(),
      update: jest.fn<(args: unknown) => Promise<unknown>>(),
      delete: jest.fn<(args: unknown) => Promise<unknown>>(),
      count: jest.fn<(args: unknown) => Promise<number>>(),
    },
    foodList: {
      create: jest.fn<(args: unknown) => Promise<unknown>>(),
      findMany: jest.fn<(args: unknown) => Promise<unknown[]>>(),
      findFirstOrThrow: jest.fn<(args: unknown) => Promise<unknown>>(),
      update: jest.fn<(args: unknown) => Promise<unknown>>(),
      delete: jest.fn<(args: unknown) => Promise<unknown>>(),
      count: jest.fn<(args: unknown) => Promise<number>>(),
    },
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    prisma.$transaction.mockImplementation(async (operations) =>
      Promise.all(operations),
    );

    const module: TestingModule = await Test.createTestingModule({
      providers: [FoodsService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = module.get<FoodsService>(FoodsService);
  });

  it('creates a food entry from API aliases', async () => {
    prisma.foodEntry.create.mockResolvedValue({});

    await service.createEntry('user-1', {
      foodName: ' Chicken rice ',
      calories: 620,
      proteinG: 35,
      carbsG: 70,
      fatG: 20,
      eatenAt: '2026-08-02T12:30:00.000Z',
    });

    expect(prisma.foodEntry.create).toHaveBeenCalledWith({
      data: {
        userId: 'user-1',
        name: 'Chicken rice',
        kcal: 620,
        proteinG: 35,
        fatG: 20,
        carbG: 70,
        imageUrl: undefined,
        mealType: undefined,
        eatenAt: new Date('2026-08-02T12:30:00.000Z'),
      },
      select: expect.any(Object),
    });
  });

  it('filters food entries by date and paginates', async () => {
    prisma.foodEntry.findMany.mockResolvedValue([]);
    prisma.foodEntry.count.mockResolvedValue(0);

    await service.listEntries('user-1', {
      date: '2026-08-02',
      limit: '10',
      offset: '5',
    });

    expect(prisma.foodEntry.findMany).toHaveBeenCalledWith({
      where: {
        userId: 'user-1',
        eatenAt: {
          gte: new Date('2026-08-02T00:00:00.000Z'),
          lt: new Date('2026-08-03T00:00:00.000Z'),
        },
      },
      orderBy: { eatenAt: 'desc' },
      take: 10,
      skip: 5,
      select: expect.any(Object),
    });
  });

  it('updates only food entries owned by the current user', async () => {
    prisma.foodEntry.findFirstOrThrow.mockResolvedValue({});
    prisma.foodEntry.update.mockResolvedValue({});

    await service.updateEntry('user-1', 'entry-1', { kcal: 700 });

    expect(prisma.foodEntry.findFirstOrThrow).toHaveBeenCalledWith({
      where: { id: 'entry-1', userId: 'user-1' },
      select: expect.any(Object),
    });
    expect(prisma.foodEntry.update).toHaveBeenCalledWith({
      where: { id: 'entry-1' },
      data: { kcal: 700 },
      select: expect.any(Object),
    });
  });

  it('creates a food list item for reusable nutrition data', async () => {
    prisma.foodList.create.mockResolvedValue({});

    await service.createFoodListItem('user-1', {
      name: 'Boiled egg',
      kcal: 78,
      proteinG: 6.3,
      description: 'One large egg',
    });

    expect(prisma.foodList.create).toHaveBeenCalledWith({
      data: {
        userId: 'user-1',
        name: 'Boiled egg',
        kcal: 78,
        proteinG: 6.3,
        fatG: undefined,
        carbG: undefined,
        description: 'One large egg',
        imageUrl: undefined,
        mealType: undefined,
      },
      select: expect.any(Object),
    });
  });

  it('rejects negative nutrition values', async () => {
    await expect(
      service.createEntry('user-1', { name: 'Cake', kcal: 100, fatG: -1 }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.foodEntry.create).not.toHaveBeenCalled();
  });
});
