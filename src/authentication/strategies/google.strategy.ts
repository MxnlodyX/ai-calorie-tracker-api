import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy } from 'passport-google-oauth2';
import { AuthenticationLogger } from '../authentication.logger';
import type { GoogleUserProfile } from '../authentication.types';

type GooglePassportProfile = {
  id?: string;
  displayName?: string;
  name?: { givenName?: string; familyName?: string };
  emails?: Array<{ value?: string }>;
  photos?: Array<{ value?: string }>;
  _json?: { email_verified?: boolean };
};

@Injectable()
export class GoogleStrategy extends PassportStrategy(Strategy, 'google') {
  constructor(
    configService: ConfigService,
    private readonly authLogger: AuthenticationLogger,
  ) {
    super({
      clientID: configService.getOrThrow<string>('google.clientId'),
      clientSecret: configService.getOrThrow<string>('google.clientSecret'),
      callbackURL: configService.getOrThrow<string>('google.callbackUrl'),
      scope: ['profile', 'email'],
    });
  }

  validate(
    _accessToken: string,
    _refreshToken: string,
    profile: GooglePassportProfile,
  ): GoogleUserProfile {
    const email = profile.emails?.[0]?.value?.trim().toLowerCase();

    if (!profile.id || !email || profile._json?.email_verified !== true) {
      this.authLogger.failed(
        'google_oauth',
        3,
        'validate_google_profile',
        'Google did not return an account with a verified email',
      );
      throw new UnauthorizedException(
        'Google did not provide a verified email',
      );
    }

    this.authLogger.success(
      'google_oauth',
      3,
      'validate_google_profile',
      'Google profile and verified email accepted',
    );
    // Passport forwards this normalized object as request.user to AuthController.
    return {
      googleAccountId: profile.id,
      email,
      name: profile.displayName?.trim() || null,
      image: profile.photos?.[0]?.value ?? null,
    };
  }
}
