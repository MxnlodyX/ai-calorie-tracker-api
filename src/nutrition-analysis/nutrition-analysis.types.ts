export type NutritionAnalyzeBody = {
  foodImageId?: unknown;
  mealType?: unknown;
  eatenAt?: unknown;
};

export type ConfirmNutritionAnalysisBody = {
  analysisId?: unknown;
  foodName?: unknown;
  name?: unknown;
  kcal?: unknown;
  calories?: unknown;
  proteinG?: unknown;
  fatG?: unknown;
  carbG?: unknown;
  carbsG?: unknown;
  mealType?: unknown;
  eatenAt?: unknown;
  saveToFoodList?: unknown;
};

export type NutritionAnalysisResult = {
  foodName: string;
  kcal: number;
  proteinG: number | null;
  fatG: number | null;
  carbG: number | null;
  confidence: number | null;
  items: Array<{
    name: string;
    portion: string | null;
    kcal: number | null;
    proteinG: number | null;
    fatG: number | null;
    carbG: number | null;
  }>;
  notes: string | null;
};
