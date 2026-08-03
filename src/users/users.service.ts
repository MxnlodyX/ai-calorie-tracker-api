import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  DIET_MODES,
  type DietMode,
  type UpdateUserProfileBody,
  type UserProfileResponse,
} from './users.types';

const USER_PROFILE_SELECT = {
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
} satisfies Prisma.UserSelect;

type UserProfileUpdateData = Prisma.UserUpdateInput;

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async getProfile(userId: string): Promise<UserProfileResponse> {
    return this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: USER_PROFILE_SELECT,
    });
  }

  async updateProfile(
    userId: string,
    body: UpdateUserProfileBody,
  ): Promise<UserProfileResponse> {
    const data = this.parseProfileUpdate(body);
    const nutritionGoals = this.calculateNutritionGoals(data, body);

    return this.prisma.user.update({
      where: { id: userId },
      data: { ...data, ...nutritionGoals },
      select: USER_PROFILE_SELECT,
    });
  }

  calculateNutritionGoals(
    data: UserProfileUpdateData,
    body: UpdateUserProfileBody,
  ): Pick<
    UserProfileUpdateData,
    'kcalGoal' | 'proteinGoal' | 'fatGoal' | 'carbGoal'
  > {
    const manualGoals = {
      kcalGoal: this.optionalPositiveInteger(body.kcalGoal, 'kcalGoal'),
      proteinGoal: this.optionalPositiveNumber(body.proteinGoal, 'proteinGoal'),
      fatGoal: this.optionalPositiveNumber(body.fatGoal, 'fatGoal'),
      carbGoal: this.optionalPositiveNumber(body.carbGoal, 'carbGoal'),
    };

    if (Object.values(manualGoals).some((value) => value !== undefined)) {
      return manualGoals;
    }

    if (data.weightKg === undefined || data.dietMode === undefined) {
      return {};
    }

    const weightKg = data.weightKg as number;
    const dietMode = data.dietMode as DietMode;
    const kcalPerKgByDietMode: Record<DietMode, number> = {
      lose: 26,
      maintain: 30,
      gain: 34,
    };
    const kcalGoal = Math.round(weightKg * kcalPerKgByDietMode[dietMode]);
    const proteinGoal = this.roundMacro(weightKg * 1.8);
    const fatGoal = this.roundMacro(weightKg * 0.8);
    const carbGoal = this.roundMacro(
      (kcalGoal - proteinGoal * 4 - fatGoal * 9) / 4,
    );

    return { kcalGoal, proteinGoal, fatGoal, carbGoal: Math.max(carbGoal, 0) };
  }

  private parseProfileUpdate(
    body: UpdateUserProfileBody,
  ): UserProfileUpdateData {
    const data: UserProfileUpdateData = {};

    if (body.name !== undefined) {
      data.name = this.optionalString(body.name, 'name');
    }
    if (body.image !== undefined) {
      data.image = this.optionalString(body.image, 'image');
    }
    if (body.heightCm !== undefined) {
      data.heightCm = this.optionalPositiveNumber(body.heightCm, 'heightCm');
    }
    if (body.weightKg !== undefined) {
      data.weightKg = this.optionalPositiveNumber(body.weightKg, 'weightKg');
    }
    if (body.dietMode !== undefined) {
      data.dietMode = this.parseDietMode(body.dietMode);
    }

    return data;
  }

  private optionalString(value: unknown, field: string): string | null {
    if (value === null) {
      return null;
    }
    if (typeof value !== 'string') {
      throw new BadRequestException(`${field} must be a string`);
    }
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }

  private optionalPositiveNumber(
    value: unknown,
    field: string,
  ): number | null | undefined {
    if (value === undefined) {
      return undefined;
    }
    if (value === null) {
      return null;
    }
    if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
      throw new BadRequestException(`${field} must be a positive number`);
    }
    return value;
  }

  private optionalPositiveInteger(
    value: unknown,
    field: string,
  ): number | null | undefined {
    const number = this.optionalPositiveNumber(value, field);
    if (number === null || number === undefined) {
      return number;
    }
    if (!Number.isInteger(number)) {
      throw new BadRequestException(`${field} must be a positive integer`);
    }
    return number;
  }

  private parseDietMode(value: unknown): DietMode | null {
    if (value === null) {
      return null;
    }
    if (typeof value !== 'string') {
      throw new BadRequestException('dietMode must be a string');
    }
    if (!DIET_MODES.includes(value as DietMode)) {
      throw new BadRequestException('dietMode must be lose, maintain, or gain');
    }
    return value as DietMode;
  }

  private roundMacro(value: number): number {
    return Math.round(value * 10) / 10;
  }
}
