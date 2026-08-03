import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';
import { AuthService } from './authentication.service';
import type { GoogleUserProfile } from './authentication.types';
import { AuthenticationLogger } from './authentication.logger';

describe('AuthService', () => {
  let service: AuthService;
  const jwtService = { sign: jest.fn().mockReturnValue('signed-jwt') };
  const authLogger = { success: jest.fn(), failed: jest.fn() };
  const transaction = {
    user: { upsert: jest.fn() },
    googleAccount: { create: jest.fn() },
  };
  const prisma = {
    googleAccount: { findUnique: jest.fn() },
    user: { update: jest.fn() },
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

    await expect(service.signInWithGoogle(profile)).resolves.toBe('signed-jwt');
    expect(jwtService.sign).toHaveBeenCalledWith({
      sub: 'user-1',
      email: profile.email,
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

    await expect(service.signInWithGoogle(profile)).resolves.toBe('signed-jwt');
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
    expect(authLogger.success).toHaveBeenCalledWith(
      'google_oauth',
      4,
      'resolve_local_account',
      'New Google account link and local user created',
    );
  });
});
