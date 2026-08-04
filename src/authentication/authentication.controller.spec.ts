import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { PATH_METADATA } from '@nestjs/common/constants';
import type { Response } from 'express';
import { AuthController } from './authentication.controller';
import {
  AUTHENTICATION_ROUTE,
  GOOGLE_OAUTH_COOKIE_PATH,
} from './authentication.constants';
import { AuthService } from './authentication.service';
import { AuthenticationLogger } from './authentication.logger';
import type { GoogleCallbackRequest } from './authentication.types';

describe('AuthController', () => {
  let controller: AuthController;
  let nodeEnv: string;
  const signInWithGoogle = jest.fn();

  beforeEach(async () => {
    nodeEnv = 'development';
    signInWithGoogle.mockReset();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        { provide: AuthService, useValue: { signInWithGoogle } },
        {
          provide: AuthenticationLogger,
          useValue: { success: jest.fn(), failed: jest.fn() },
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) =>
              key === 'nodeEnv' ? nodeEnv : undefined,
            ),
            getOrThrow: jest.fn((key: string) => {
              if (key === 'jwt.cookieMaxAgeMs') return 900_000;
              if (key === 'frontendUrl') return 'http://localhost:3000';
              throw new Error(`Unexpected config key: ${key}`);
            }),
          },
        },
      ],
    }).compile();

    controller = module.get<AuthController>(AuthController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('keeps the OAuth state cookie under the controller route', () => {
    expect(Reflect.getMetadata(PATH_METADATA, AuthController)).toBe(
      AUTHENTICATION_ROUTE,
    );
    expect(GOOGLE_OAUTH_COOKIE_PATH).toBe(`/${AUTHENTICATION_ROUTE}/google`);
  });

  it.each([
    {
      environment: 'production',
      secure: true,
      sameSite: 'none' as const,
    },
    {
      environment: 'development',
      secure: false,
      sameSite: 'lax' as const,
    },
  ])(
    'sets the access cookie with $environment attributes',
    async ({ environment, secure, sameSite }) => {
      nodeEnv = environment;
      signInWithGoogle.mockResolvedValue('signed-access-token');
      const cookie = jest.fn();
      const redirect = jest.fn();
      const response = { cookie, redirect } as unknown as Response;
      const request = { user: {} } as GoogleCallbackRequest;

      await controller.googleAuthCallback(request, response);

      expect(cookie).toHaveBeenCalledWith(
        'access_token',
        'signed-access-token',
        {
          httpOnly: true,
          secure,
          sameSite,
          path: '/',
          maxAge: 900_000,
        },
      );
      expect(redirect).toHaveBeenCalledWith('http://localhost:3000');
    },
  );

  it.each([
    {
      environment: 'production',
      secure: true,
      sameSite: 'none' as const,
    },
    {
      environment: 'development',
      secure: false,
      sameSite: 'lax' as const,
    },
  ])(
    'clears the access cookie with matching $environment attributes and no maxAge',
    ({ environment, secure, sameSite }) => {
      nodeEnv = environment;
      const clearCookie = jest.fn();
      const response = { clearCookie } as unknown as Response;

      controller.logout(response);

      expect(clearCookie).toHaveBeenCalledWith('access_token', {
        httpOnly: true,
        secure,
        sameSite,
        path: '/',
      });
    },
  );
});
