import {
  BadRequestException,
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuthenticationLogger } from './authentication.logger';
import type {
  AuthenticatedUser,
  GoogleUserProfile,
} from './authentication.types';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
export type JwtPayload = {
  sub: string;
  email: string;
};
export type AuthTokenPair = {
  accessToken: string;
  refreshToken: string;
};

@Injectable()
export class AuthService {
  constructor(
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService,
    private readonly authLogger: AuthenticationLogger,
    private readonly configService: ConfigService,
  ) {}

  async signInWithGoogle(
    profile: GoogleUserProfile | undefined,
  ): Promise<AuthTokenPair> {
    if (!profile) {
      this.authLogger.failed(
        'google_oauth',
        3,
        'validate_google_profile',
        'Google profile was not available to the authentication service',
      );
      throw new BadRequestException('Unauthenticated');
    }

    const linkedAccount = await this.prisma.googleAccount.findUnique({
      where: { googleAccountId: profile.googleAccountId },
      include: { user: true },
    });

    if (linkedAccount) {
      // Existing Google identity forwards its local User to the JWT issuer.
      const user = await this.prisma.user.update({
        where: { id: linkedAccount.userId },
        data: { name: profile.name, image: profile.image },
      });
      this.authLogger.success(
        'google_oauth',
        4,
        'resolve_local_account',
        'Existing Google account link and local user loaded',
      );
      return this.issueTokenPair(user);
    }

    try {
      const user = await this.prisma.$transaction(async (transaction) => {
        // A verified Google email may reuse the same local User. The provider ID
        // is then persisted separately so future logins never rely on email alone.
        const localUser = await transaction.user.upsert({
          where: { email: profile.email },
          update: { name: profile.name, image: profile.image },
          create: {
            email: profile.email,
            name: profile.name,
            image: profile.image,
          },
        });

        await transaction.googleAccount.create({
          data: {
            googleAccountId: profile.googleAccountId,
            userId: localUser.id,
          },
        });

        return localUser;
      });

      this.authLogger.success(
        'google_oauth',
        4,
        'resolve_local_account',
        'New Google account link and local user created',
      );
      return this.issueTokenPair(user);
    } catch (error: unknown) {
      if (this.isUniqueConstraintError(error)) {
        this.authLogger.failed(
          'google_oauth',
          4,
          'resolve_local_account',
          'Google account could not be linked to a local user',
        );
        throw new ConflictException('This Google account is already linked');
      }
      throw error;
    }
  }

  async refreshSession(
    rawRefreshToken: string | undefined,
  ): Promise<AuthTokenPair> {
    if (!rawRefreshToken) {
      throw new UnauthorizedException('Refresh token is required');
    }

    const tokenHash = this.hashRefreshToken(rawRefreshToken);

    const currentToken = await this.prisma.refreshToken.findUnique({
      where: { tokenHash },
      include: { user: true },
    });

    if (!currentToken) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    const now = new Date();

    const isInvalid =
      currentToken.usedAt !== null ||
      currentToken.revokedAt !== null ||
      currentToken.expiresAt.getTime() <= now.getTime();

    if (isInvalid) {
      await this.revokeRefreshTokenFamily(currentToken.familyId, now);
      throw new UnauthorizedException('Refresh token is no longer valid');
    }

    const replacementToken = randomBytes(32).toString('base64url');
    const replacementHash = this.hashRefreshToken(replacementToken);

    const rotated = await this.prisma.$transaction(async (transaction) => {
      const claimed = await transaction.refreshToken.updateMany({
        where: {
          id: currentToken.id,
          usedAt: null,
          revokedAt: null,
          expiresAt: {
            gt: now,
          },
        },
        data: {
          usedAt: now,
        },
      });

      if (claimed.count !== 1) {
        return false;
      }

      await transaction.refreshToken.create({
        data: {
          userId: currentToken.userId,
          familyId: currentToken.familyId,
          tokenHash: replacementHash,
          expiresAt: currentToken.expiresAt,
        },
      });

      return true;
    });

    if (!rotated) {
      await this.revokeRefreshTokenFamily(currentToken.familyId, now);
      throw new UnauthorizedException('Refresh token reuse detected');
    }

    return {
      accessToken: this.issueAccessToken(currentToken.user),
      refreshToken: replacementToken,
    };
  }

  async revokeSession(rawRefreshToken: string | undefined): Promise<void> {
    if (!rawRefreshToken) {
      return;
    }

    const tokenHash = this.hashRefreshToken(rawRefreshToken);
    const currentToken = await this.prisma.refreshToken.findUnique({
      where: { tokenHash },
      select: { familyId: true },
    });

    if (!currentToken) {
      return;
    }

    await this.revokeRefreshTokenFamily(currentToken.familyId, new Date());
  }

  private async revokeRefreshTokenFamily(
    familyId: string,
    revokedAt: Date,
  ): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: {
        familyId,
        revokedAt: null,
      },
      data: {
        revokedAt,
      },
    });
  }

  private async issueTokenPair(
    user: AuthenticatedUser,
  ): Promise<AuthTokenPair> {
    const refreshToken = randomBytes(32).toString('base64url');
    const tokenHash = this.hashRefreshToken(refreshToken);
    const familyId = randomUUID();

    const maxAgeMs = this.configService.getOrThrow<number>(
      'jwt.refreshTokenMaxAgeMs',
    );

    await this.prisma.refreshToken.create({
      data: {
        userId: user.id,
        familyId,
        tokenHash,
        expiresAt: new Date(Date.now() + maxAgeMs),
      },
    });

    return {
      accessToken: this.issueAccessToken(user),
      refreshToken,
    };
  }

  private hashRefreshToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }
  private issueAccessToken(user: AuthenticatedUser): string {
    const payload: JwtPayload = { sub: user.id, email: user.email };
    const token = this.jwtService.sign(payload);
    this.authLogger.success(
      'google_oauth',
      5,
      'issue_access_token',
      'Backend access token issued',
    );
    return token;
  }

  private isUniqueConstraintError(error: unknown): boolean {
    return (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    );
  }
}
