export type NutritionAnalyzeBody = {
  mealType?: unknown;
  eatenAt?: unknown;
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
