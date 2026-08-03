import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { AuthenticationLogger } from '../authentication.logger';
import { GoogleStrategy } from './google.strategy';

describe('GoogleStrategy', () => {
  let strategy: GoogleStrategy;
  const authLogger = { success: jest.fn(), failed: jest.fn() };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module = await Test.createTestingModule({
      providers: [
        GoogleStrategy,
        {
          provide: ConfigService,
          useValue: { getOrThrow: jest.fn(() => 'test-value') },
        },
        { provide: AuthenticationLogger, useValue: authLogger },
      ],
    }).compile();

    strategy = module.get(GoogleStrategy);
  });

  it('normalizes a verified Google profile', () => {
    expect(
      strategy.validate('access-token', 'refresh-token', {
        id: 'google-1',
        displayName: ' Test Person ',
        emails: [{ value: ' PERSON@EXAMPLE.COM ' }],
        photos: [{ value: 'https://example.com/avatar.jpg' }],
        _json: { email_verified: true },
      }),
    ).toEqual({
      googleAccountId: 'google-1',
      email: 'person@example.com',
      name: 'Test Person',
      image: 'https://example.com/avatar.jpg',
    });
  });

  it('rejects profiles without a verified email', () => {
    expect(() =>
      strategy.validate('access-token', 'refresh-token', {
        id: 'google-1',
        emails: [{ value: 'person@example.com' }],
        _json: { email_verified: false },
      }),
    ).toThrow(UnauthorizedException);
    expect(authLogger.failed).toHaveBeenCalled();
  });
});
