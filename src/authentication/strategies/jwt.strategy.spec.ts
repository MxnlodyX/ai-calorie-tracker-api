import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthenticationLogger } from '../authentication.logger';
import { JwtStrategy } from './jwt.strategy';

describe('JwtStrategy', () => {
  let strategy: JwtStrategy;
  const authLogger = { success: jest.fn(), failed: jest.fn() };
  const prisma = { user: { findUnique: jest.fn() } };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module = await Test.createTestingModule({
      providers: [
        JwtStrategy,
        {
          provide: ConfigService,
          useValue: { getOrThrow: jest.fn(() => 'jwt-test-secret') },
        },
        { provide: PrismaService, useValue: prisma },
        { provide: AuthenticationLogger, useValue: authLogger },
      ],
    }).compile();

    strategy = module.get(JwtStrategy);
  });

  it('loads the current safe user fields for a valid JWT subject', async () => {
    const user = {
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
    };
    prisma.user.findUnique.mockResolvedValue(user);

    await expect(
      strategy.validate({ sub: 'user-1', email: 'person@example.com' }),
    ).resolves.toEqual(user);
    expect(prisma.user.findUnique).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      select: expect.objectContaining({ id: true, email: true }) as Record<
        string,
        unknown
      >,
    });
  });

  it('rejects a JWT whose user no longer exists', async () => {
    prisma.user.findUnique.mockResolvedValue(null);

    await expect(
      strategy.validate({ sub: 'deleted-user', email: 'old@example.com' }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(authLogger.failed).toHaveBeenCalled();
  });
});
