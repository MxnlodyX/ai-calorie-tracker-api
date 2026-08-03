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
  heightCm: number | null;
  weightKg: number | null;
  dietMode: string | null;
  kcalGoal: number | null;
  proteinGoal: number | null;
  fatGoal: number | null;
  carbGoal: number | null;
};

export type GoogleCallbackRequest = Request & { user: GoogleUserProfile };
export type AuthenticatedRequest = Request & { user: AuthenticatedUser };
export type OAuthStateRequest = Request & { oauthState?: string };
