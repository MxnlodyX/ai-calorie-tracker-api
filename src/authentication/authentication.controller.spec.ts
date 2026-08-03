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

describe('AuthController', () => {
  let controller: AuthController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        { provide: AuthService, useValue: { signInWithGoogle: jest.fn() } },
        {
          provide: AuthenticationLogger,
          useValue: { success: jest.fn(), failed: jest.fn() },
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn().mockReturnValue('test'),
            getOrThrow: jest.fn().mockReturnValue(900_000),
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

  it('clears the access cookie without setting a new max age', () => {
    const clearCookie = jest.fn();
    const response = { clearCookie } as unknown as Response;

    controller.logout(response);

    expect(clearCookie).toHaveBeenCalledWith('access_token', {
      httpOnly: true,
      secure: false,
      sameSite: 'lax',
      path: '/',
    });
  });
});
