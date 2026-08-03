import {
  BadRequestException,
  ConflictException,
  Injectable,
  InternalServerErrorException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { NUTRITION_IMAGE_ANALYSIS_SYSTEM_PROMPT } from './nutrition-analysis.prompts';
import type {
  NutritionAnalysisResult,
  NutritionAnalyzeBody,
} from './nutrition-analysis.types';

type UploadedFile = {
  buffer: Buffer;
  originalname: string;
  mimetype: string;
  size: number;
};

const ALLOWED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const MAX_IMAGE_SIZE_BYTES = 5 * 1024 * 1024;
const DEFAULT_OPENAI_MODEL = 'gpt-4o-mini';

const FOOD_ENTRY_SELECT = {
  id: true,
  userId: true,
  name: true,
  kcal: true,
  proteinG: true,
  fatG: true,
  carbG: true,
  imageUrl: true,
  mealType: true,
  eatenAt: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.FoodEntrySelect;

@Injectable()
export class NutritionAnalysisService {
  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  async analyzeImage(
    userId: string,
    file: UploadedFile,
    body: NutritionAnalyzeBody,
  ) {
    this.validateImage(file);

    const bucket = this.configService.getOrThrow<string>(
      'supabase.storageBucket',
    );
    const storagePath = this.buildStoragePath(userId, file);
    await this.uploadToSupabase(bucket, storagePath, file);

    const foodImage = await this.prisma.foodImage.create({
      data: {
        userId,
        storagePath,
        mimeType: file.mimetype,
        sizeBytes: file.size,
      },
    });

    const model =
      this.configService.get<string>('openai.imageAnalysisModel') ??
      DEFAULT_OPENAI_MODEL;
    const pendingAnalysis = await this.prisma.aiAnalysis.create({
      data: {
        userId,
        foodImageId: foodImage.id,
        provider: 'openai',
        model,
        status: 'pending',
      },
    });

    try {
      const nutrition = await this.requestOpenAiAnalysis(file, model);
      const eatenAt = this.optionalDate(body.eatenAt, 'eatenAt') ?? undefined;
      const mealType = this.optionalString(body.mealType, 'mealType');

      const [foodEntry, aiAnalysis] = await this.prisma.$transaction([
        this.prisma.foodEntry.create({
          data: {
            userId,
            name: nutrition.foodName,
            kcal: nutrition.kcal,
            proteinG: nutrition.proteinG,
            fatG: nutrition.fatG,
            carbG: nutrition.carbG,
            imageUrl: storagePath,
            mealType,
            eatenAt,
          },
          select: FOOD_ENTRY_SELECT,
        }),
        this.prisma.aiAnalysis.update({
          where: { id: pendingAnalysis.id },
          data: {
            foodName: nutrition.foodName,
            kcal: nutrition.kcal,
            proteinG: nutrition.proteinG,
            fatG: nutrition.fatG,
            carbG: nutrition.carbG,
            confidence: nutrition.confidence,
            status: 'completed',
            rawAiResponse: nutrition,
          },
        }),
      ]);

      await this.prisma.foodImage.update({
        where: { id: foodImage.id },
        data: { foodEntryId: foodEntry.id },
      });
      await this.prisma.aiAnalysis.update({
        where: { id: aiAnalysis.id },
        data: { foodEntryId: foodEntry.id },
      });

      return {
        foodEntry,
        analysis: aiAnalysis,
        image: {
          id: foodImage.id,
          storagePath,
          bucket,
        },
      };
    } catch (error) {
      await this.prisma.aiAnalysis.update({
        where: { id: pendingAnalysis.id },
        data: {
          status: 'failed',
          rawAiResponse: this.serializeFailure(error),
        },
      });
      throw error;
    }
  }

  private validateImage(
    file: UploadedFile | undefined,
  ): asserts file is UploadedFile {
    if (!file) {
      throw new BadRequestException('image file is required');
    }
    if (!ALLOWED_IMAGE_TYPES.has(file.mimetype)) {
      throw new BadRequestException('image must be JPEG, PNG, or WebP');
    }
    if (file.size <= 0 || file.size > MAX_IMAGE_SIZE_BYTES) {
      throw new BadRequestException('image must be between 1 byte and 10MB');
    }
  }

  private async uploadToSupabase(
    bucket: string,
    storagePath: string,
    file: UploadedFile,
  ): Promise<void> {
    const supabaseUrl = this.configService.getOrThrow<string>('supabase.url');
    const serviceRoleKey = this.configService.getOrThrow<string>(
      'supabase.serviceRoleKey',
    );
    const response = await fetch(
      `${supabaseUrl}/storage/v1/object/${bucket}/${storagePath}`,
      {
        method: 'POST',
        headers: {
          authorization: `Bearer ${serviceRoleKey}`,
          apikey: serviceRoleKey,
          'content-type': file.mimetype,
          'x-upsert': 'false',
        },
        body: file.buffer as unknown as BodyInit,
      },
    );

    if (!response.ok) {
      const details = await this.readErrorDetails(response);
      if (response.status === 401 || response.status === 403) {
        throw new UnauthorizedException(
          `Supabase storage rejected credentials: ${details}`,
        );
      }
      if (response.status === 404) {
        throw new BadRequestException(
          `Supabase storage bucket was not found: ${bucket}`,
        );
      }
      if (response.status === 409) {
        throw new ConflictException(
          `Supabase storage object already exists: ${storagePath}`,
        );
      }
      throw new ServiceUnavailableException(
        `Unable to upload meal image: ${details}`,
      );
    }
  }

  private async readErrorDetails(response: Response): Promise<string> {
    const fallback = `Supabase returned ${response.status}`;
    try {
      const body = await response.text();
      if (body.trim().length === 0) {
        return fallback;
      }
      return body.slice(0, 300);
    } catch {
      return fallback;
    }
  }

  private async requestOpenAiAnalysis(
    file: UploadedFile,
    model: string,
  ): Promise<NutritionAnalysisResult> {
    const apiKey = this.configService.getOrThrow<string>('openai.apiKey');
    const response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${apiKey}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model,
        input: [
          {
            role: 'system',
            content: [
              {
                type: 'input_text',
                text: NUTRITION_IMAGE_ANALYSIS_SYSTEM_PROMPT,
              },
            ],
          },
          {
            role: 'user',
            content: [
              {
                type: 'input_text',
                text: 'Analyze this meal image for nutrition tracking.',
              },
              {
                type: 'input_image',
                image_url: `data:${file.mimetype};base64,${file.buffer.toString(
                  'base64',
                )}`,
              },
            ],
          },
        ],
        text: { format: { type: 'json_object' } },
      }),
    });

    if (!response.ok) {
      throw new ServiceUnavailableException('Unable to analyze meal image');
    }

    const payload = (await response.json()) as Record<string, unknown>;
    const outputText = this.extractOutputText(payload);
    if (outputText === undefined) {
      throw new InternalServerErrorException('OpenAI response was incomplete');
    }

    return this.parseNutritionResult(outputText);
  }

  private extractOutputText(
    payload: Record<string, unknown>,
  ): string | undefined {
    if (typeof payload.output_text === 'string') {
      return payload.output_text;
    }

    const output = payload.output;
    if (!Array.isArray(output)) {
      return undefined;
    }

    const textParts: string[] = [];
    for (const item of output) {
      if (!item || typeof item !== 'object') {
        continue;
      }
      const content = (item as Record<string, unknown>).content;
      if (!Array.isArray(content)) {
        continue;
      }
      for (const contentItem of content) {
        if (!contentItem || typeof contentItem !== 'object') {
          continue;
        }
        const record = contentItem as Record<string, unknown>;
        if (record.type === 'output_text' && typeof record.text === 'string') {
          textParts.push(record.text);
        }
      }
    }

    return textParts.length > 0 ? textParts.join('') : undefined;
  }

  private parseNutritionResult(outputText: string): NutritionAnalysisResult {
    let parsed: unknown;
    try {
      parsed = JSON.parse(outputText);
    } catch {
      throw new InternalServerErrorException(
        'OpenAI response was not valid JSON',
      );
    }

    if (!parsed || typeof parsed !== 'object') {
      throw new InternalServerErrorException('OpenAI response was invalid');
    }

    const result = parsed as Record<string, unknown>;
    return {
      foodName: this.requiredString(result.foodName, 'foodName'),
      kcal: this.requiredNonNegativeInteger(result.kcal, 'kcal'),
      proteinG: this.optionalNonNegativeNumber(result.proteinG, 'proteinG'),
      fatG: this.optionalNonNegativeNumber(result.fatG, 'fatG'),
      carbG: this.optionalNonNegativeNumber(result.carbG, 'carbG'),
      confidence: this.optionalConfidence(result.confidence),
      items: Array.isArray(result.items)
        ? result.items.map((item) => this.parseItem(item))
        : [],
      notes: this.optionalString(result.notes, 'notes') ?? null,
    };
  }

  private parseItem(item: unknown): NutritionAnalysisResult['items'][number] {
    if (!item || typeof item !== 'object') {
      throw new InternalServerErrorException('OpenAI food item was invalid');
    }
    const record = item as Record<string, unknown>;
    return {
      name: this.requiredString(record.name, 'items.name'),
      portion: this.optionalString(record.portion, 'items.portion') ?? null,
      kcal: this.optionalNonNegativeInteger(record.kcal, 'items.kcal'),
      proteinG: this.optionalNonNegativeNumber(
        record.proteinG,
        'items.proteinG',
      ),
      fatG: this.optionalNonNegativeNumber(record.fatG, 'items.fatG'),
      carbG: this.optionalNonNegativeNumber(record.carbG, 'items.carbG'),
    };
  }

  private buildStoragePath(userId: string, file: UploadedFile): string {
    const extension =
      file.mimetype === 'image/png'
        ? 'png'
        : file.mimetype === 'image/webp'
          ? 'webp'
          : 'jpg';
    return `users/${userId}/meal-images/${crypto.randomUUID()}.${extension}`;
  }

  private serializeFailure(error: unknown): Prisma.InputJsonValue {
    return {
      message:
        error instanceof Error
          ? error.message
          : 'Unknown image analysis failure',
    };
  }

  private requiredString(value: unknown, field: string): string {
    if (typeof value !== 'string' || value.trim().length === 0) {
      throw new InternalServerErrorException(`${field} was missing`);
    }
    return value.trim();
  }

  private optionalString(
    value: unknown,
    field: string,
  ): string | null | undefined {
    if (value === undefined) {
      return undefined;
    }
    if (value === null) {
      return null;
    }
    if (typeof value !== 'string') {
      throw new BadRequestException(`${field} must be a string`);
    }
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }

  private requiredNonNegativeInteger(value: unknown, field: string): number {
    const number = this.optionalNonNegativeInteger(value, field);
    if (number === null || number === undefined) {
      throw new InternalServerErrorException(`${field} was missing`);
    }
    return number;
  }

  private optionalNonNegativeInteger(
    value: unknown,
    field: string,
  ): number | null {
    const number = this.optionalNonNegativeNumber(value, field);
    if (number !== null && !Number.isInteger(number)) {
      throw new InternalServerErrorException(`${field} must be an integer`);
    }
    return number;
  }

  private optionalNonNegativeNumber(
    value: unknown,
    field: string,
  ): number | null {
    if (value === null || value === undefined) {
      return null;
    }
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
      throw new InternalServerErrorException(`${field} must be non-negative`);
    }
    return value;
  }

  private optionalConfidence(value: unknown): number | null {
    const confidence = this.optionalNonNegativeNumber(value, 'confidence');
    if (confidence !== null && confidence > 1) {
      throw new InternalServerErrorException(
        'confidence must be between 0 and 1',
      );
    }
    return confidence;
  }

  private optionalDate(value: unknown, field: string): Date | null | undefined {
    if (value === undefined) {
      return undefined;
    }
    if (value === null) {
      return null;
    }
    if (typeof value !== 'string') {
      throw new BadRequestException(`${field} must be an ISO date string`);
    }
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      throw new BadRequestException(`${field} must be a valid date`);
    }
    return date;
  }
}
