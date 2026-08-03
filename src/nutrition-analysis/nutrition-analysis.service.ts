import {
  BadRequestException,
  ConflictException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  DEFAULT_OPENAI_REQUEST_TIMEOUT_MS,
  DEFAULT_SUPABASE_REQUEST_TIMEOUT_MS,
  MAX_NUTRITION_IMAGE_SIZE_BYTES,
} from './nutrition-analysis.constants';
import { NUTRITION_IMAGE_ANALYSIS_SYSTEM_PROMPT } from './nutrition-analysis.prompts';
import type {
  ConfirmNutritionAnalysisBody,
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
  private readonly logger = new Logger(NutritionAnalysisService.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  async uploadImage(userId: string, file: UploadedFile) {
    this.validateImage(file);

    const bucket = this.configService.getOrThrow<string>(
      'supabase.storageBucket',
    );
    const storagePath = this.buildStoragePath(userId, file);
    await this.uploadToSupabase(bucket, storagePath, file);

    const image = await (async () => {
      try {
        return await this.prisma.foodImage.create({
          data: {
            userId,
            storagePath,
            mimeType: file.mimetype,
            sizeBytes: file.size,
          },
        });
      } catch (error) {
        await this.deleteFromSupabase(bucket, storagePath);
        throw error;
      }
    })();

    return {
      id: image.id,
      storagePath,
      publicUrl: image.publicUrl ?? null,
      mimeType: file.mimetype,
      sizeBytes: file.size,
      bucket,
    };
  }

  async analyzeImage(userId: string, body: NutritionAnalyzeBody) {
    const foodImageId = this.requiredRequestString(
      body.foodImageId,
      'foodImageId',
    );
    const foodImage = await this.prisma.foodImage.findFirst({
      where: { id: foodImageId, userId },
    });
    if (!foodImage) {
      throw new NotFoundException('Food image was not found');
    }

    const file = await this.downloadFromSupabase(
      foodImage.storagePath,
      foodImage.mimeType,
    );

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
      const aiAnalysis = await this.completeAnalysis(
        pendingAnalysis.id,
        file,
        model,
        body,
      );

      return {
        analysis: aiAnalysis,
        image: {
          id: foodImage.id,
          storagePath: foodImage.storagePath,
        },
      };
    } catch (error) {
      await this.markAnalysisFailed(pendingAnalysis.id, error);
      throw error;
    }
  }

  async acceptAnalysis(
    userId: string,
    analysisIdValue: unknown,
    body: ConfirmNutritionAnalysisBody,
  ) {
    const analysisId = this.requiredRequestString(
      analysisIdValue,
      'analysisId',
    );
    const analysis = await this.findOwnedAnalysis(userId, analysisId);
    if (analysis.status !== 'awaiting_confirmation' || analysis.foodEntryId) {
      throw new ConflictException('AI analysis is not awaiting confirmation');
    }

    const defaults = this.readEntryDefaults(analysis.rawAiResponse);
    const name = this.requiredRequestString(
      body.name ?? body.foodName ?? analysis.foodName,
      'foodName',
    );
    const kcal = this.requiredPositiveInteger(
      body.kcal ?? body.calories ?? analysis.kcal,
      'kcal',
    );
    const proteinG = this.requestOptionalNonNegativeNumber(
      body.proteinG === undefined ? analysis.proteinG : body.proteinG,
      'proteinG',
    );
    const fatG = this.requestOptionalNonNegativeNumber(
      body.fatG === undefined ? analysis.fatG : body.fatG,
      'fatG',
    );
    const carbG = this.requestOptionalNonNegativeNumber(
      body.carbG ?? body.carbsG ?? analysis.carbG,
      'carbG',
    );
    const mealType = this.optionalString(
      body.mealType === undefined ? defaults.mealType : body.mealType,
      'mealType',
    );
    const eatenAt =
      this.optionalDate(
        body.eatenAt === undefined ? defaults.eatenAt : body.eatenAt,
        'eatenAt',
      ) ?? undefined;
    const saveToFoodList = this.optionalBoolean(
      body.saveToFoodList,
      'saveToFoodList',
    );

    return this.prisma.$transaction(async (transaction) => {
      const claimed = await transaction.aiAnalysis.updateMany({
        where: {
          id: analysisId,
          userId,
          status: 'awaiting_confirmation',
          foodEntryId: null,
        },
        data: { status: 'accepted' },
      });
      if (claimed.count !== 1) {
        throw new ConflictException('AI analysis was already handled');
      }

      const foodEntry = await transaction.foodEntry.create({
        data: {
          userId,
          name,
          kcal,
          proteinG,
          fatG,
          carbG,
          imageUrl: analysis.foodImage?.storagePath,
          mealType,
          eatenAt,
        },
        select: FOOD_ENTRY_SELECT,
      });
      const foodListItem = saveToFoodList
        ? await transaction.foodList.create({
            data: {
              userId,
              name,
              kcal,
              proteinG,
              fatG,
              carbG,
              imageUrl: analysis.foodImage?.storagePath,
              mealType,
            },
          })
        : null;

      if (analysis.foodImageId) {
        await transaction.foodImage.update({
          where: { id: analysis.foodImageId },
          data: { foodEntryId: foodEntry.id },
        });
      }
      const acceptedAnalysis = await transaction.aiAnalysis.update({
        where: { id: analysisId },
        data: { foodEntryId: foodEntry.id },
      });

      return { foodEntry, foodListItem, analysis: acceptedAnalysis };
    });
  }

  async rejectAnalysis(userId: string, analysisId: string) {
    const analysis = await this.findOwnedAnalysis(userId, analysisId);
    if (analysis.status !== 'awaiting_confirmation') {
      throw new ConflictException('AI analysis is not awaiting confirmation');
    }
    const rejected = await this.prisma.aiAnalysis.updateMany({
      where: { id: analysisId, userId, status: 'awaiting_confirmation' },
      data: { status: 'rejected' },
    });
    if (rejected.count !== 1) {
      throw new ConflictException('AI analysis was already handled');
    }
    return this.prisma.aiAnalysis.findUniqueOrThrow({
      where: { id: analysisId },
    });
  }

  async retryAnalysis(userId: string, analysisId: string) {
    const analysis = await this.findOwnedAnalysis(userId, analysisId);
    if (!['awaiting_confirmation', 'failed'].includes(analysis.status)) {
      throw new ConflictException('AI analysis cannot be retried');
    }
    if (!analysis.foodImage) {
      throw new BadRequestException('AI analysis has no image to retry');
    }

    const claimed = await this.prisma.aiAnalysis.updateMany({
      where: {
        id: analysisId,
        userId,
        status: { in: ['awaiting_confirmation', 'failed'] },
      },
      data: { status: 'pending' },
    });
    if (claimed.count !== 1) {
      throw new ConflictException('AI analysis is already being retried');
    }

    try {
      const file = await this.downloadFromSupabase(
        analysis.foodImage.storagePath,
        analysis.foodImage.mimeType,
      );
      return await this.completeAnalysis(
        analysisId,
        file,
        analysis.model ?? DEFAULT_OPENAI_MODEL,
        this.readEntryDefaults(analysis.rawAiResponse),
      );
    } catch (error) {
      await this.markAnalysisFailed(analysisId, error);
      throw error;
    }
  }

  private async completeAnalysis(
    analysisId: string,
    file: UploadedFile,
    model: string,
    entryDefaults: { mealType?: unknown; eatenAt?: unknown },
  ) {
    const mealType = this.optionalString(entryDefaults.mealType, 'mealType');
    const eatenAt = this.optionalDate(entryDefaults.eatenAt, 'eatenAt');
    const nutrition = await this.requestOpenAiAnalysis(file, model);

    return this.prisma.aiAnalysis.update({
      where: { id: analysisId },
      data: {
        foodName: nutrition.foodName,
        kcal: nutrition.kcal,
        proteinG: nutrition.proteinG,
        fatG: nutrition.fatG,
        carbG: nutrition.carbG,
        confidence: nutrition.confidence,
        status: 'awaiting_confirmation',
        rawAiResponse: {
          nutrition,
          entryDefaults: {
            mealType: mealType ?? null,
            eatenAt: eatenAt?.toISOString() ?? null,
          },
        },
      },
    });
  }

  private async markAnalysisFailed(
    analysisId: string,
    error: unknown,
  ): Promise<void> {
    await this.prisma.aiAnalysis.update({
      where: { id: analysisId },
      data: {
        status: 'failed',
        rawAiResponse: this.serializeFailure(error),
      },
    });
  }

  private async findOwnedAnalysis(userId: string, analysisId: string) {
    const analysis = await this.prisma.aiAnalysis.findFirst({
      where: { id: analysisId, userId },
      include: { foodImage: true },
    });
    if (!analysis) {
      throw new NotFoundException('AI analysis was not found');
    }
    return analysis;
  }

  private readEntryDefaults(value: Prisma.JsonValue): {
    mealType?: unknown;
    eatenAt?: unknown;
  } {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return {};
    }
    const entryDefaults = value.entryDefaults;
    if (
      !entryDefaults ||
      typeof entryDefaults !== 'object' ||
      Array.isArray(entryDefaults)
    ) {
      return {};
    }
    return {
      mealType: entryDefaults.mealType,
      eatenAt: entryDefaults.eatenAt,
    };
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
    if (file.size <= 0 || file.size > MAX_NUTRITION_IMAGE_SIZE_BYTES) {
      throw new BadRequestException('image must be between 1 byte and 5MB');
    }
  }

  private async downloadFromSupabase(
    storagePath: string,
    mimeType: string,
  ): Promise<UploadedFile> {
    const bucket = this.configService.getOrThrow<string>(
      'supabase.storageBucket',
    );
    const supabaseUrl = this.configService.getOrThrow<string>('supabase.url');
    const serviceRoleKey = this.configService.getOrThrow<string>(
      'supabase.serviceRoleKey',
    );
    const response = await this.fetchExternal(
      `${supabaseUrl}/storage/v1/object/${bucket}/${storagePath}`,
      {
        headers: {
          authorization: `Bearer ${serviceRoleKey}`,
          apikey: serviceRoleKey,
        },
      },
      'supabase.requestTimeoutMs',
      DEFAULT_SUPABASE_REQUEST_TIMEOUT_MS,
      'Supabase download',
      'Unable to load meal image',
    );
    if (!response.ok) {
      this.logUpstreamResponseFailure('Supabase download', response.status);
      throw new ServiceUnavailableException('Unable to load meal image');
    }
    const buffer = Buffer.from(await response.arrayBuffer());
    return {
      buffer,
      originalname: storagePath.split('/').at(-1) ?? 'meal-image',
      mimetype: mimeType,
      size: buffer.length,
    };
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
    const response = await this.fetchExternal(
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
      'supabase.requestTimeoutMs',
      DEFAULT_SUPABASE_REQUEST_TIMEOUT_MS,
      'Supabase upload',
      'Unable to upload meal image',
    );

    if (!response.ok) {
      this.logUpstreamResponseFailure('Supabase upload', response.status);
      if (response.status === 409) {
        throw new ConflictException('Meal image already exists');
      }
      throw new ServiceUnavailableException('Unable to upload meal image');
    }
  }

  private async deleteFromSupabase(
    bucket: string,
    storagePath: string,
  ): Promise<void> {
    const supabaseUrl = this.configService.getOrThrow<string>('supabase.url');
    const serviceRoleKey = this.configService.getOrThrow<string>(
      'supabase.serviceRoleKey',
    );

    try {
      const response = await this.fetchExternal(
        `${supabaseUrl}/storage/v1/object/${bucket}`,
        {
          method: 'DELETE',
          headers: {
            authorization: `Bearer ${serviceRoleKey}`,
            apikey: serviceRoleKey,
            'content-type': 'application/json',
          },
          body: JSON.stringify({ prefixes: [storagePath] }),
        },
        'supabase.requestTimeoutMs',
        DEFAULT_SUPABASE_REQUEST_TIMEOUT_MS,
        'Supabase cleanup',
        'Unable to clean up meal image',
      );
      if (!response.ok) {
        this.logger.error(
          `Unable to clean up Supabase object after database failure: status ${response.status}`,
        );
      }
    } catch {
      this.logger.error(
        'Unable to clean up Supabase object after database failure',
      );
    }
  }

  private async requestOpenAiAnalysis(
    file: UploadedFile,
    model: string,
  ): Promise<NutritionAnalysisResult> {
    const apiKey = this.configService.getOrThrow<string>('openai.apiKey');
    const response = await this.fetchExternal(
      'https://api.openai.com/v1/responses',
      {
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
      },
      'openai.requestTimeoutMs',
      DEFAULT_OPENAI_REQUEST_TIMEOUT_MS,
      'OpenAI analysis',
      'Unable to analyze meal image',
    );

    if (!response.ok) {
      this.logUpstreamResponseFailure('OpenAI analysis', response.status);
      throw new ServiceUnavailableException('Unable to analyze meal image');
    }

    const payload = (await response.json()) as Record<string, unknown>;
    const outputText = this.extractOutputText(payload);
    if (outputText === undefined) {
      throw new InternalServerErrorException('OpenAI response was incomplete');
    }

    return this.parseNutritionResult(outputText);
  }

  private async fetchExternal(
    input: string,
    init: RequestInit,
    timeoutConfigKey: string,
    defaultTimeoutMs: number,
    operation: string,
    clientErrorMessage: string,
  ): Promise<Response> {
    const timeoutMs = this.requestTimeoutMs(timeoutConfigKey, defaultTimeoutMs);
    try {
      return await fetch(input, {
        ...init,
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch {
      this.logger.error(`${operation} request did not complete`);
      throw new ServiceUnavailableException(clientErrorMessage);
    }
  }

  private requestTimeoutMs(configKey: string, fallback: number): number {
    const configured = this.configService.get<number>(configKey);
    return Number.isSafeInteger(configured) &&
      configured !== undefined &&
      configured > 0
      ? configured
      : fallback;
  }

  private logUpstreamResponseFailure(operation: string, status: number): void {
    this.logger.error(`${operation} failed with status ${status}`);
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

  private requiredRequestString(value: unknown, field: string): string {
    if (typeof value !== 'string' || value.trim().length === 0) {
      throw new BadRequestException(`${field} is required`);
    }
    return value.trim();
  }

  private requiredPositiveInteger(value: unknown, field: string): number {
    const number = this.parseRequestNumber(value);
    if (number === undefined || !Number.isInteger(number) || number <= 0) {
      throw new BadRequestException(`${field} must be a positive integer`);
    }
    return number;
  }

  private requestOptionalNonNegativeNumber(
    value: unknown,
    field: string,
  ): number | null {
    if (value === null || value === undefined) {
      return null;
    }
    const number = this.parseRequestNumber(value);
    if (number === undefined || !Number.isFinite(number) || number < 0) {
      throw new BadRequestException(`${field} must be a non-negative number`);
    }
    return number;
  }

  private optionalBoolean(value: unknown, field: string): boolean {
    if (value === undefined) {
      return false;
    }
    if (typeof value !== 'boolean') {
      throw new BadRequestException(`${field} must be a boolean`);
    }
    return value;
  }

  private parseRequestNumber(value: unknown): number | undefined {
    if (typeof value === 'number') {
      return value;
    }
    if (typeof value !== 'string' || value.trim().length === 0) {
      return undefined;
    }
    const number = Number(value);
    return Number.isNaN(number) ? undefined : number;
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
