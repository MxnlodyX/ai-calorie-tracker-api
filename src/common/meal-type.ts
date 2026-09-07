import { BadRequestException } from '@nestjs/common';

export const MEAL_TYPES = [
  'breakfast',
  'lunch',
  'dinner',
  'additional',
] as const;

export type MealType = (typeof MEAL_TYPES)[number];

export function optionalMealType(
  value: unknown,
  field = 'mealType',
): MealType | null | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (value === null) {
    return null;
  }
  if (typeof value !== 'string') {
    throw new BadRequestException(`${field} must be a string`);
  }

  const normalized = value.trim().toLowerCase();
  if (normalized.length === 0) {
    return null;
  }
  if (!MEAL_TYPES.includes(normalized as MealType)) {
    throw new BadRequestException(
      `${field} must be one of: ${MEAL_TYPES.join(', ')}`,
    );
  }

  return normalized as MealType;
}
