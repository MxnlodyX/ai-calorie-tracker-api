import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuthenticationLogger } from './authentication.logger';
import type {
  AuthenticatedUser,
  GoogleUserProfile,
} from './authentication.types';

export type JwtPayload = {
  sub: string;
  email: string;
};

@Injectable()
export class AuthService {
  constructor(
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService,
    private readonly authLogger: AuthenticationLogger,
  ) {}

  async signInWithGoogle(
    profile: GoogleUserProfile | undefined,
  ): Promise<string> {
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
      return this.issueAccessToken(user);
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
      return this.issueAccessToken(user);
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
