import { BadRequestException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { UsersService } from './users.service';

describe('UsersService', () => {
  let service: UsersService;
  const prisma = {
    user: {
      findUniqueOrThrow: jest.fn<(args: unknown) => Promise<unknown>>(),
      update: jest.fn<(args: unknown) => Promise<unknown>>(),
    },
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [UsersService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = module.get<UsersService>(UsersService);
  });

  it('calculates calorie and macro goals from weight and diet mode', async () => {
    prisma.user.update.mockResolvedValue({
      id: 'user-1',
      email: 'person@example.com',
      name: 'Person',
      image: null,
      heightCm: 170,
      weightKg: 70,
      dietMode: 'maintain',
      kcalGoal: 2100,
      proteinGoal: 126,
      fatGoal: 56,
      carbGoal: 273,
    });

    await service.updateProfile('user-1', {
      name: ' Person ',
      heightCm: 170,
      weightKg: 70,
      dietMode: 'maintain',
    });

    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: {
        name: 'Person',
        heightCm: 170,
        weightKg: 70,
        dietMode: 'maintain',
        kcalGoal: 2100,
        proteinGoal: 126,
        fatGoal: 56,
        carbGoal: 273,
      },
      select: {
        id: true,
        email: true,
        name: true,
        image: true,
        heightCm: true,
        weightKg: true,
        dietMode: true,
        kcalGoal: true,
        proteinGoal: true,
        fatGoal: true,
        carbGoal: true,
      },
    });
  });

  it('uses manually supplied nutrition goals when present', async () => {
    prisma.user.update.mockResolvedValue({});

    await service.updateProfile('user-1', {
      weightKg: 70,
      dietMode: 'gain',
      kcalGoal: 2400,
      proteinGoal: 130,
      fatGoal: 70,
      carbGoal: 300,
    });

    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: {
        weightKg: 70,
        dietMode: 'gain',
        kcalGoal: 2400,
        proteinGoal: 130,
        fatGoal: 70,
        carbGoal: 300,
      },
      select: {
        id: true,
        email: true,
        name: true,
        image: true,
        heightCm: true,
        weightKg: true,
        dietMode: true,
        kcalGoal: true,
        proteinGoal: true,
        fatGoal: true,
        carbGoal: true,
      },
    });
  });

  it('rejects unsupported diet modes', async () => {
    await expect(
      service.updateProfile('user-1', { dietMode: 'extreme-cut' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.user.update).not.toHaveBeenCalled();
  });
});
