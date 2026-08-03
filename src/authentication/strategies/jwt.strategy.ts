import { ExtractJwt, Strategy } from 'passport-jwt';
import { PassportStrategy } from '@nestjs/passport';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';
import { PrismaService } from '../../prisma/prisma.service';
import type { JwtPayload } from '../authentication.service';
import { AuthenticationLogger } from '../authentication.logger';
import type { AuthenticatedUser } from '../authentication.types';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(
    configService: ConfigService,
    private readonly prisma: PrismaService,
    private readonly authLogger: AuthenticationLogger,
  ) {
    const extractJwtFromCookie = (request: Request): string | null => {
      const cookies = request.cookies as Record<string, string> | undefined;
      return (
        cookies?.access_token ??
        ExtractJwt.fromAuthHeaderAsBearerToken()(request)
      );
    };

    super({
      ignoreExpiration: false,
      secretOrKey: configService.getOrThrow<string>('jwt.secret'),
      jwtFromRequest: extractJwtFromCookie,
    });
  }

  async validate(payload: JwtPayload): Promise<AuthenticatedUser> {
    // A valid signature is not enough: reload the User so deleted accounts lose
    // access immediately, then forward the safe fields as request.user.
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: {
        id: true,
        email: true,
        name: true,
        image: true,
        heightCm: true,
        weightKg: true,
        dietMode: true,
        kcalGoal: true,
        proteinGoal: true,
        fatGoal: true,
        carbGoal: true,
      },
    });

    if (!user) {
      this.authLogger.failed(
        'authenticated_request',
        1,
        'load_authenticated_user',
        'JWT user no longer exists',
      );
      throw new UnauthorizedException('Please log in to continue');
    }

    this.authLogger.success(
      'authenticated_request',
      1,
      'load_authenticated_user',
      'JWT accepted and current user loaded',
    );
    return user;
  }
}
