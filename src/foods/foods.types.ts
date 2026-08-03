export type FoodEntryBody = {
  name?: unknown;
  foodName?: unknown;
  kcal?: unknown;
  calories?: unknown;
  proteinG?: unknown;
  fatG?: unknown;
  carbG?: unknown;
  carbsG?: unknown;
  imageUrl?: unknown;
  mealType?: unknown;
  eatenAt?: unknown;
};

export type FoodListBody = {
  name?: unknown;
  kcal?: unknown;
  calories?: unknown;
  proteinG?: unknown;
  fatG?: unknown;
  carbG?: unknown;
  carbsG?: unknown;
  description?: unknown;
  imageUrl?: unknown;
  mealType?: unknown;
};

export type FoodQuery = {
  date?: unknown;
  from?: unknown;
  to?: unknown;
  limit?: unknown;
  offset?: unknown;
};
