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
import type { Response } from 'express';
import { AuthService } from './authentication.service';
import { AUTHENTICATION_ROUTE } from './authentication.constants';
import { AuthenticationLogger } from './authentication.logger';
import type {
  AuthenticatedRequest,
  GoogleCallbackRequest,
} from './authentication.types';
import { GoogleOAuthGuard } from './guards/google-oauth.guard';
import { JwtAuthGuard } from './guards/jwt-auth.guard';

const ACCESS_TOKEN_COOKIE = 'access_token';

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
    const token = await this.authService.signInWithGoogle(request.user);

    response.cookie(ACCESS_TOKEN_COOKIE, token, {
      ...this.accessCookieOptions(),
      maxAge: this.configService.getOrThrow<number>('jwt.cookieMaxAgeMs'),
    });
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
  logout(@Res({ passthrough: true }) response: Response): void {
    // clearCookie must use the same path/security attributes, without maxAge.
    response.clearCookie(ACCESS_TOKEN_COOKIE, this.accessCookieOptions());
    this.authLogger.success(
      'logout',
      1,
      'clear_login_session',
      'Access token cookie cleared',
    );
  }

  private accessCookieOptions() {
    return {
      httpOnly: true,
      secure: this.configService.get<string>('nodeEnv') === 'production',
      sameSite: 'lax' as const,
      path: '/',
    };
  }
}
