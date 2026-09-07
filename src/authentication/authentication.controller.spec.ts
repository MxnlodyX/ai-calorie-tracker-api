import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { UnauthorizedException } from '@nestjs/common';
import { PATH_METADATA } from '@nestjs/common/constants';
import type { Request, Response } from 'express';
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
  const refreshSession = jest.fn();
  const revokeSession = jest.fn();

  beforeEach(async () => {
    nodeEnv = 'development';
    signInWithGoogle.mockReset();
    refreshSession.mockReset();
    revokeSession.mockReset();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        {
          provide: AuthService,
          useValue: { signInWithGoogle, refreshSession, revokeSession },
        },
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
              if (key === 'jwt.refreshTokenMaxAgeMs') return 2_592_000_000;
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
    'sets the token cookies with $environment attributes',
    async ({ environment, secure, sameSite }) => {
      nodeEnv = environment;
      signInWithGoogle.mockResolvedValue({
        accessToken: 'signed-access-token',
        refreshToken: 'refresh-token',
      });
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
      expect(cookie).toHaveBeenCalledWith('refresh_token', 'refresh-token', {
        httpOnly: true,
        secure,
        sameSite,
        path: '/authentications',
        maxAge: 2_592_000_000,
      });
      expect(cookie).toHaveBeenCalledTimes(2);
      expect(redirect).toHaveBeenCalledWith('http://localhost:3000');
    },
  );

  it('rotates both token cookies when refreshing a session', async () => {
    refreshSession.mockResolvedValue({
      accessToken: 'new-access-token',
      refreshToken: 'new-refresh-token',
    });
    const cookie = jest.fn();
    const clearCookie = jest.fn();
    const request = {
      cookies: { refresh_token: 'old-refresh-token' },
    } as unknown as Request;
    const response = { cookie, clearCookie } as unknown as Response;

    await controller.refresh(request, response);

    expect(refreshSession).toHaveBeenCalledWith('old-refresh-token');
    expect(cookie).toHaveBeenCalledWith('access_token', 'new-access-token', {
      httpOnly: true,
      secure: false,
      sameSite: 'lax',
      path: '/',
      maxAge: 900_000,
    });
    expect(cookie).toHaveBeenCalledWith('refresh_token', 'new-refresh-token', {
      httpOnly: true,
      secure: false,
      sameSite: 'lax',
      path: '/authentications',
      maxAge: 2_592_000_000,
    });
    expect(cookie).toHaveBeenCalledTimes(2);
    expect(clearCookie).not.toHaveBeenCalled();
  });

  it('clears both token cookies when refreshing fails', async () => {
    refreshSession.mockRejectedValue(
      new UnauthorizedException('Invalid refresh token'),
    );
    const cookie = jest.fn();
    const clearCookie = jest.fn();
    const request = {
      cookies: { refresh_token: 'invalid-refresh-token' },
    } as unknown as Request;
    const response = { cookie, clearCookie } as unknown as Response;

    await expect(controller.refresh(request, response)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );

    expect(refreshSession).toHaveBeenCalledWith('invalid-refresh-token');
    expect(cookie).not.toHaveBeenCalled();
    expect(clearCookie).toHaveBeenCalledWith('access_token', {
      httpOnly: true,
      secure: false,
      sameSite: 'lax',
      path: '/',
    });
    expect(clearCookie).toHaveBeenCalledWith('refresh_token', {
      httpOnly: true,
      secure: false,
      sameSite: 'lax',
      path: '/authentications',
    });
    expect(clearCookie).toHaveBeenCalledTimes(2);
  });

  it('passes a missing refresh cookie to the service as undefined', async () => {
    refreshSession.mockRejectedValue(
      new UnauthorizedException('Refresh token is required'),
    );
    const clearCookie = jest.fn();
    const request = { cookies: {} } as unknown as Request;
    const response = { clearCookie } as unknown as Response;

    await expect(controller.refresh(request, response)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );

    expect(refreshSession).toHaveBeenCalledWith(undefined);
    expect(clearCookie).toHaveBeenCalledTimes(2);
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
    'revokes the session and clears both cookies with $environment attributes',
    async ({ environment, secure, sameSite }) => {
      nodeEnv = environment;
      const clearCookie = jest.fn();
      const response = { clearCookie } as unknown as Response;
      const request = {
        cookies: { refresh_token: 'current-refresh-token' },
      } as unknown as Request;

      await controller.logout(request, response);

      expect(revokeSession).toHaveBeenCalledWith('current-refresh-token');
      expect(clearCookie).toHaveBeenCalledWith('access_token', {
        httpOnly: true,
        secure,
        sameSite,
        path: '/',
      });
      expect(clearCookie).toHaveBeenCalledWith('refresh_token', {
        httpOnly: true,
        secure,
        sameSite,
        path: '/authentications',
      });
      expect(clearCookie).toHaveBeenCalledTimes(2);
    },
  );

  it('still clears both cookies when session revocation fails', async () => {
    const databaseError = new Error('database unavailable');
    revokeSession.mockRejectedValue(databaseError);
    const clearCookie = jest.fn();
    const request = {
      cookies: { refresh_token: 'current-refresh-token' },
    } as unknown as Request;
    const response = { clearCookie } as unknown as Response;

    await expect(controller.logout(request, response)).rejects.toBe(
      databaseError,
    );

    expect(clearCookie).toHaveBeenCalledTimes(2);
  });
});
