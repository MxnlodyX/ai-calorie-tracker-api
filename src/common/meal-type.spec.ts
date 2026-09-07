import { BadRequestException } from '@nestjs/common';
import { MEAL_TYPES, optionalMealType } from './meal-type';

describe('meal type', () => {
  it.each(MEAL_TYPES)('accepts the frontend meal type %s', (mealType) => {
    expect(optionalMealType(mealType)).toBe(mealType);
  });

  it('normalizes the display casing used by the dashboard', () => {
    expect(optionalMealType(' Breakfast ')).toBe('breakfast');
    expect(optionalMealType('Lunch')).toBe('lunch');
    expect(optionalMealType('DINNER')).toBe('dinner');
    expect(optionalMealType('Additional')).toBe('additional');
  });

  it('preserves optional values', () => {
    expect(optionalMealType(undefined)).toBeUndefined();
    expect(optionalMealType(null)).toBeNull();
    expect(optionalMealType('  ')).toBeNull();
  });

  it('rejects values outside the frontend meal types', () => {
    expect(() => optionalMealType('brunch')).toThrow(BadRequestException);
    expect(() => optionalMealType('brunch')).toThrow(
      'mealType must be one of: breakfast, lunch, dinner, additional',
    );
  });
});
