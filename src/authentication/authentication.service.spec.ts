import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { createHash } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { AuthService } from './authentication.service';
import type { GoogleUserProfile } from './authentication.types';
import { AuthenticationLogger } from './authentication.logger';

describe('AuthService', () => {
  let service: AuthService;
  const jwtService = { sign: jest.fn().mockReturnValue('signed-jwt') };
  const authLogger = { success: jest.fn(), failed: jest.fn() };
  const configService = {
    getOrThrow: jest.fn((key: string) => {
      if (key === 'jwt.refreshTokenMaxAgeMs') return 2_592_000_000;
      throw new Error(`Unexpected config key: ${key}`);
    }),
  };
  const transaction = {
    user: { upsert: jest.fn() },
    googleAccount: { create: jest.fn() },
    refreshToken: {
      create: jest.fn(),
      updateMany: jest.fn(),
    },
  };
  const prisma = {
    googleAccount: { findUnique: jest.fn() },
    user: { update: jest.fn() },
    refreshToken: {
      create: jest.fn(),
      findUnique: jest.fn(),
      updateMany: jest.fn(),
    },
    $transaction: jest.fn((callback: (client: typeof transaction) => unknown) =>
      callback(transaction),
    ),
  };
  const profile: GoogleUserProfile = {
    googleAccountId: 'google-123',
    email: 'person@example.com',
    name: 'Test Person',
    image: 'https://example.com/avatar.jpg',
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: JwtService, useValue: jwtService },
        { provide: PrismaService, useValue: prisma },
        { provide: AuthenticationLogger, useValue: authLogger },
        { provide: ConfigService, useValue: configService },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('issues a JWT for an already linked Google account', async () => {
    prisma.googleAccount.findUnique.mockResolvedValue({
      userId: 'user-1',
      user: { id: 'user-1' },
    });
    prisma.user.update.mockResolvedValue({
      id: 'user-1',
      email: profile.email,
      name: profile.name,
      image: profile.image,
    });

    const tokens = await service.signInWithGoogle(profile);

    expect(tokens).toEqual({
      accessToken: 'signed-jwt',
      refreshToken: expect.any(String) as string,
    });
    expect(jwtService.sign).toHaveBeenCalledWith({
      sub: 'user-1',
      email: profile.email,
    });
    expect(prisma.refreshToken.create).toHaveBeenCalledWith({
      data: {
        userId: 'user-1',
        familyId: expect.any(String) as string,
        tokenHash: expect.stringMatching(/^[a-f0-9]{64}$/) as string,
        expiresAt: expect.any(Date) as Date,
      },
    });
    expect(prisma.refreshToken.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        tokenHash: createHash('sha256')
          .update(tokens.refreshToken)
          .digest('hex'),
      }) as Record<string, unknown>,
    });
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(authLogger.success).toHaveBeenCalledWith(
      'google_oauth',
      4,
      'resolve_local_account',
      'Existing Google account link and local user loaded',
    );
  });

  it('creates a local user link before issuing a JWT', async () => {
    prisma.googleAccount.findUnique.mockResolvedValue(null);
    transaction.user.upsert.mockResolvedValue({
      id: 'user-2',
      email: profile.email,
      name: profile.name,
      image: profile.image,
    });
    transaction.googleAccount.create.mockResolvedValue({ id: 'account-1' });

    await expect(service.signInWithGoogle(profile)).resolves.toEqual({
      accessToken: 'signed-jwt',
      refreshToken: expect.any(String) as string,
    });
    expect(transaction.user.upsert).toHaveBeenCalledWith({
      where: { email: profile.email },
      update: { name: profile.name, image: profile.image },
      create: {
        email: profile.email,
        name: profile.name,
        image: profile.image,
      },
    });
    expect(transaction.googleAccount.create).toHaveBeenCalledWith({
      data: { googleAccountId: profile.googleAccountId, userId: 'user-2' },
    });
    expect(prisma.refreshToken.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ userId: 'user-2' }) as Record<
        string,
        unknown
      >,
    });
    expect(authLogger.success).toHaveBeenCalledWith(
      'google_oauth',
      4,
      'resolve_local_account',
      'New Google account link and local user created',
    );
  });

  it('rotates a valid refresh token and keeps its absolute expiration', async () => {
    const expiresAt = new Date('2099-01-01T00:00:00.000Z');
    prisma.refreshToken.findUnique.mockResolvedValue({
      id: 'refresh-1',
      userId: 'user-1',
      familyId: 'family-1',
      tokenHash: 'old-token-hash',
      expiresAt,
      usedAt: null,
      revokedAt: null,
      user: { id: 'user-1', email: profile.email },
    });
    transaction.refreshToken.updateMany.mockResolvedValue({ count: 1 });

    const tokens = await service.refreshSession('old-refresh-token');

    expect(prisma.refreshToken.findUnique).toHaveBeenCalledWith({
      where: {
        tokenHash: createHash('sha256')
          .update('old-refresh-token')
          .digest('hex'),
      },
      include: { user: true },
    });
    expect(transaction.refreshToken.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'refresh-1',
        usedAt: null,
        revokedAt: null,
        expiresAt: { gt: expect.any(Date) as Date },
      },
      data: { usedAt: expect.any(Date) as Date },
    });
    expect(transaction.refreshToken.create).toHaveBeenCalledWith({
      data: {
        userId: 'user-1',
        familyId: 'family-1',
        tokenHash: createHash('sha256')
          .update(tokens.refreshToken)
          .digest('hex'),
        expiresAt,
      },
    });
    expect(tokens).toEqual({
      accessToken: 'signed-jwt',
      refreshToken: expect.any(String) as string,
    });
    expect(prisma.refreshToken.updateMany).not.toHaveBeenCalled();
  });

  it.each([undefined, 'unknown-refresh-token'])(
    'rejects a missing or unknown refresh token',
    async (refreshToken) => {
      prisma.refreshToken.findUnique.mockResolvedValue(null);

      await expect(service.refreshSession(refreshToken)).rejects.toMatchObject({
        status: 401,
      });

      expect(transaction.refreshToken.updateMany).not.toHaveBeenCalled();
      expect(transaction.refreshToken.create).not.toHaveBeenCalled();
    },
  );

  it.each([
    {
      name: 'used',
      usedAt: new Date('2026-01-01T00:00:00.000Z'),
      revokedAt: null,
      expiresAt: new Date('2099-01-01T00:00:00.000Z'),
    },
    {
      name: 'revoked',
      usedAt: null,
      revokedAt: new Date('2026-01-01T00:00:00.000Z'),
      expiresAt: new Date('2099-01-01T00:00:00.000Z'),
    },
    {
      name: 'expired',
      usedAt: null,
      revokedAt: null,
      expiresAt: new Date('2020-01-01T00:00:00.000Z'),
    },
  ])('revokes the token family when a token is $name', async (tokenState) => {
    prisma.refreshToken.findUnique.mockResolvedValue({
      id: 'refresh-1',
      userId: 'user-1',
      familyId: 'family-1',
      tokenHash: 'old-token-hash',
      ...tokenState,
      user: { id: 'user-1', email: profile.email },
    });

    await expect(
      service.refreshSession('old-refresh-token'),
    ).rejects.toMatchObject({ status: 401 });

    expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith({
      where: { familyId: 'family-1', revokedAt: null },
      data: { revokedAt: expect.any(Date) as Date },
    });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('revokes the family when another request already claimed the token', async () => {
    prisma.refreshToken.findUnique.mockResolvedValue({
      id: 'refresh-1',
      userId: 'user-1',
      familyId: 'family-1',
      tokenHash: 'old-token-hash',
      expiresAt: new Date('2099-01-01T00:00:00.000Z'),
      usedAt: null,
      revokedAt: null,
      user: { id: 'user-1', email: profile.email },
    });
    transaction.refreshToken.updateMany.mockResolvedValue({ count: 0 });

    await expect(service.refreshSession('old-refresh-token')).rejects.toThrow(
      'Refresh token reuse detected',
    );

    expect(transaction.refreshToken.create).not.toHaveBeenCalled();
    expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith({
      where: { familyId: 'family-1', revokedAt: null },
      data: { revokedAt: expect.any(Date) as Date },
    });
  });

  it('revokes the refresh-token family when logging out', async () => {
    prisma.refreshToken.findUnique.mockResolvedValue({ familyId: 'family-1' });

    await service.revokeSession('current-refresh-token');

    expect(prisma.refreshToken.findUnique).toHaveBeenCalledWith({
      where: {
        tokenHash: createHash('sha256')
          .update('current-refresh-token')
          .digest('hex'),
      },
      select: { familyId: true },
    });
    expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith({
      where: { familyId: 'family-1', revokedAt: null },
      data: { revokedAt: expect.any(Date) as Date },
    });
  });

  it.each([undefined, 'unknown-refresh-token'])(
    'allows logout without a known refresh token',
    async (refreshToken) => {
      prisma.refreshToken.findUnique.mockResolvedValue(null);

      await expect(
        service.revokeSession(refreshToken),
      ).resolves.toBeUndefined();

      expect(prisma.refreshToken.updateMany).not.toHaveBeenCalled();
    },
  );
});
