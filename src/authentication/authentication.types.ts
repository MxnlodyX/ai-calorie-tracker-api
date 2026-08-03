import type { Request } from 'express';

export type GoogleUserProfile = {
  googleAccountId: string;
  email: string;
  name: string | null;
  image: string | null;
};

export type AuthenticatedUser = {
  id: string;
  email: string;
  name: string | null;
  image: string | null;
};

export type GoogleCallbackRequest = Request & { user: GoogleUserProfile };
export type AuthenticatedRequest = Request & { user: AuthenticatedUser };
export type OAuthStateRequest = Request & { oauthState?: string };
