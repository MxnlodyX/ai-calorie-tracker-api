import {
  Controller,
  Get,
  HttpCode,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request, Response } from 'express';
import { AuthService, type AuthTokenPair } from './authentication.service';
import { AUTHENTICATION_ROUTE } from './authentication.constants';
import { AuthenticationLogger } from './authentication.logger';
import type {
  AuthenticatedRequest,
  GoogleCallbackRequest,
} from './authentication.types';
import { GoogleOAuthGuard } from './guards/google-oauth.guard';
import { JwtAuthGuard } from './guards/jwt-auth.guard';

const ACCESS_TOKEN_COOKIE = 'access_token';
const REFRESH_TOKEN_COOKIE = 'refresh_token';

@Controller(AUTHENTICATION_ROUTE)
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly configService: ConfigService,
    private readonly authLogger: AuthenticationLogger,
  ) {}

  @Get('google')
  @UseGuards(GoogleOAuthGuard)
  // GoogleOAuthGuard sends the redirect response before this body is reached.
  startGoogleLogin(): void {}

  @Get('google/callback')
  @UseGuards(GoogleOAuthGuard)
  async googleAuthCallback(
    @Req() request: GoogleCallbackRequest,
    @Res() response: Response,
  ): Promise<void> {
    // GoogleStrategy placed the normalized profile in request.user. AuthService
    // links it to the database and returns only this backend's signed JWT.
    const tokens = await this.authService.signInWithGoogle(request.user);
    this.setTokenCookies(response, tokens);
    this.authLogger.success(
      'google_oauth',
      6,
      'create_login_session',
      'Access token stored in an HttpOnly cookie',
    );
    this.authLogger.success(
      'google_oauth',
      7,
      'redirect_to_frontend',
      'Login completed; redirecting browser to the frontend',
    );
    response.redirect(this.configService.getOrThrow<string>('frontendUrl'));
  }

  @Post('refresh')
  @HttpCode(204)
  async refresh(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<void> {
    const cookies = request.cookies as Record<string, string> | undefined;

    const refreshToken = cookies?.[REFRESH_TOKEN_COOKIE];

    try {
      const tokens = await this.authService.refreshSession(refreshToken);

      this.setTokenCookies(response, tokens);
    } catch (error: unknown) {
      this.clearTokenCookies(response);
      throw error;
    }
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  getCurrentUser(@Req() request: AuthenticatedRequest) {
    // JwtStrategy validated the cookie and attached current database user data.
    this.authLogger.success(
      'authenticated_request',
      2,
      'return_current_user',
      'Current user returned to the client',
    );
    return request.user;
  }

  @Post('logout')
  @HttpCode(204)
  async logout(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<void> {
    const cookies = request.cookies as Record<string, string> | undefined;
    const refreshToken = cookies?.[REFRESH_TOKEN_COOKIE];

    try {
      await this.authService.revokeSession(refreshToken);
    } finally {
      this.clearTokenCookies(response);
    }

    this.authLogger.success(
      'logout',
      1,
      'clear_login_session',
      'Refresh-token family revoked and token cookies cleared',
    );
  }
  private setTokenCookies(response: Response, tokens: AuthTokenPair): void {
    response.cookie(ACCESS_TOKEN_COOKIE, tokens.accessToken, {
      ...this.accessCookieOptions(),
      maxAge: this.configService.getOrThrow<number>('jwt.cookieMaxAgeMs'),
    });

    response.cookie(REFRESH_TOKEN_COOKIE, tokens.refreshToken, {
      ...this.refreshCookieOptions(),
      maxAge: this.configService.getOrThrow<number>('jwt.refreshTokenMaxAgeMs'),
    });
  }
  private clearTokenCookies(response: Response): void {
    response.clearCookie(ACCESS_TOKEN_COOKIE, this.accessCookieOptions());

    response.clearCookie(REFRESH_TOKEN_COOKIE, this.refreshCookieOptions());
  }
  private accessCookieOptions() {
    const isProduction =
      this.configService.get<string>('nodeEnv') === 'production';

    return {
      httpOnly: true,
      secure: isProduction,
      sameSite: isProduction ? ('none' as const) : ('lax' as const),
      path: '/',
    };
  }

  private refreshCookieOptions() {
    const isProduction =
      this.configService.get<string>('nodeEnv') === 'production';

    return {
      httpOnly: true,
      secure: isProduction,
      sameSite: isProduction ? ('none' as const) : ('lax' as const),
      path: `/${AUTHENTICATION_ROUTE}`,
    };
  }
}
