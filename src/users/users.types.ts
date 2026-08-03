export const DIET_MODES = ['lose', 'maintain', 'gain'] as const;

export type DietMode = (typeof DIET_MODES)[number];

export type UserProfileResponse = {
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

export type UpdateUserProfileBody = {
  name?: unknown;
  image?: unknown;
  heightCm?: unknown;
  weightKg?: unknown;
  dietMode?: unknown;
  kcalGoal?: unknown;
  proteinGoal?: unknown;
  fatGoal?: unknown;
  carbGoal?: unknown;
};
