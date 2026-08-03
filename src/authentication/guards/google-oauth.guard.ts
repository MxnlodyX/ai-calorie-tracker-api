import {
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuthGuard } from '@nestjs/passport';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import type { Response } from 'express';
import { GOOGLE_OAUTH_COOKIE_PATH } from '../authentication.constants';
import { AuthenticationLogger } from '../authentication.logger';
import type { OAuthStateRequest } from '../authentication.types';

const OAUTH_STATE_COOKIE = 'oauth_state';

@Injectable()
export class GoogleOAuthGuard extends AuthGuard('google') {
  constructor(
    private readonly configService: ConfigService,
    private readonly authLogger: AuthenticationLogger,
  ) {
    super();
  }

  canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<OAuthStateRequest>();
    const response = context.switchToHttp().getResponse<Response>();

    if (request.path.endsWith('/callback')) {
      // The value returned by Google must match the HttpOnly cookie created at
      // login start. This blocks login CSRF before Passport exchanges the code.
      this.assertValidState(request);
      this.authLogger.success(
        'google_oauth',
        2,
        'validate_oauth_state',
        'OAuth state matched the login cookie',
      );
      response.clearCookie(OAUTH_STATE_COOKIE, this.stateCookieOptions());
    } else {
      request.oauthState = randomBytes(32).toString('hex');
      response.cookie(
        OAUTH_STATE_COOKIE,
        request.oauthState,
        this.stateCookieOptions(10 * 60 * 1000),
      );
      this.authLogger.success(
        'google_oauth',
        1,
        'redirect_to_google',
        'OAuth state cookie created; redirecting browser to Google',
      );
    }

    return super.canActivate(context);
  }

  getAuthenticateOptions(context: ExecutionContext): { state?: string } {
    const request = context.switchToHttp().getRequest<OAuthStateRequest>();
    return request.oauthState ? { state: request.oauthState } : {};
  }

  private assertValidState(request: OAuthStateRequest): void {
    const cookies = request.cookies as Record<string, string> | undefined;
    const expected = cookies?.[OAUTH_STATE_COOKIE];
    const received =
      typeof request.query.state === 'string' ? request.query.state : undefined;

    if (!expected || !received || expected.length !== received.length) {
      this.authLogger.failed(
        'google_oauth',
        2,
        'validate_oauth_state',
        'OAuth state cookie was missing or invalid',
      );
      throw new ForbiddenException('Invalid OAuth state');
    }

    if (!timingSafeEqual(Buffer.from(expected), Buffer.from(received))) {
      this.authLogger.failed(
        'google_oauth',
        2,
        'validate_oauth_state',
        'OAuth state did not match the login cookie',
      );
      throw new ForbiddenException('Invalid OAuth state');
    }
  }

  private stateCookieOptions(maxAge?: number) {
    return {
      httpOnly: true,
      secure: this.configService.get<string>('nodeEnv') === 'production',
      sameSite: 'lax' as const,
      path: GOOGLE_OAUTH_COOKIE_PATH,
      ...(maxAge === undefined ? {} : { maxAge }),
    };
  }
}
