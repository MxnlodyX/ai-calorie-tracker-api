import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type {
  FoodEntryBody,
  FoodListBody,
  FoodQuery,
  MealCalendarDateQuery,
  MealCalendarMonthQuery,
} from './foods.types';

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

const FOOD_LIST_SELECT = {
  id: true,
  userId: true,
  name: true,
  kcal: true,
  proteinG: true,
  fatG: true,
  carbG: true,
  description: true,
  imageUrl: true,
  mealType: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.FoodListSelect;

type FoodEntryCreateData = Omit<Prisma.FoodEntryUncheckedCreateInput, 'userId'>;
type FoodEntryUpdateData = Prisma.FoodEntryUncheckedUpdateInput;
type FoodListCreateData = Omit<Prisma.FoodListUncheckedCreateInput, 'userId'>;
type FoodListUpdateData = Prisma.FoodListUncheckedUpdateInput;
const MAX_PAGINATION_LIMIT = 100;

@Injectable()
export class FoodsService {
  constructor(private readonly prisma: PrismaService) {}

  async createEntry(userId: string, body: FoodEntryBody) {
    return this.prisma.foodEntry.create({
      data: { userId, ...this.parseFoodEntryCreate(body) },
      select: FOOD_ENTRY_SELECT,
    });
  }

  async listEntries(userId: string, query: FoodQuery) {
    const { limit, offset } = this.parsePagination(query);
    const where = this.parseEntryWhere(userId, query);
    const [items, total] = await this.prisma.$transaction([
      this.prisma.foodEntry.findMany({
        where,
        orderBy: { eatenAt: 'desc' },
        take: limit,
        skip: offset,
        select: FOOD_ENTRY_SELECT,
      }),
      this.prisma.foodEntry.count({ where }),
    ]);

    return { items, total };
  }

  async listMealCalendarMonth(userId: string, query: MealCalendarMonthQuery) {
    const month = this.requiredMonth(query.month);
    const year = this.requiredYear(query.year);
    const start = new Date(Date.UTC(year, month - 1, 1));
    const end = new Date(Date.UTC(year, month, 1));

    return this.listCalendarEntries(userId, start, end);
  }

  async listMealCalendarDate(userId: string, query: MealCalendarDateQuery) {
    const start = this.parseDateOnly(query.date, 'date');
    const end = new Date(start);
    end.setUTCDate(end.getUTCDate() + 1);

    return this.listCalendarEntries(userId, start, end);
  }

  async getEntry(userId: string, id: string) {
    return this.prisma.foodEntry.findFirstOrThrow({
      where: { id, userId },
      select: FOOD_ENTRY_SELECT,
    });
  }

  async updateEntry(userId: string, id: string, body: FoodEntryBody) {
    await this.getEntry(userId, id);
    return this.prisma.foodEntry.update({
      where: { id },
      data: this.parseFoodEntryUpdate(body),
      select: FOOD_ENTRY_SELECT,
    });
  }

  async deleteEntry(userId: string, id: string) {
    await this.getEntry(userId, id);
    await this.prisma.foodEntry.delete({ where: { id } });
  }

  async createFoodListItem(userId: string, body: FoodListBody) {
    return this.prisma.foodList.create({
      data: { userId, ...this.parseFoodListCreate(body) },
      select: FOOD_LIST_SELECT,
    });
  }

  async listFoodListItems(userId: string, query: FoodQuery) {
    const { limit, offset } = this.parsePagination(query);
    const [items, total] = await this.prisma.$transaction([
      this.prisma.foodList.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
        select: FOOD_LIST_SELECT,
      }),
      this.prisma.foodList.count({ where: { userId } }),
    ]);

    return { items, total };
  }

  async getFoodListItem(userId: string, id: string) {
    return this.prisma.foodList.findFirstOrThrow({
      where: { id, userId },
      select: FOOD_LIST_SELECT,
    });
  }

  async updateFoodListItem(userId: string, id: string, body: FoodListBody) {
    await this.getFoodListItem(userId, id);
    return this.prisma.foodList.update({
      where: { id },
      data: this.parseFoodListUpdate(body),
      select: FOOD_LIST_SELECT,
    });
  }

  async deleteFoodListItem(userId: string, id: string) {
    await this.getFoodListItem(userId, id);
    await this.prisma.foodList.delete({ where: { id } });
  }

  private parseFoodEntryCreate(body: FoodEntryBody): FoodEntryCreateData {
    return {
      name: this.requiredString(body.name ?? body.foodName, 'name'),
      kcal: this.requiredPositiveInteger(body.kcal ?? body.calories, 'kcal'),
      proteinG: this.optionalNonNegativeNumber(body.proteinG, 'proteinG'),
      fatG: this.optionalNonNegativeNumber(body.fatG, 'fatG'),
      carbG: this.optionalNonNegativeNumber(body.carbG ?? body.carbsG, 'carbG'),
      imageUrl: this.optionalString(body.imageUrl, 'imageUrl'),
      mealType: this.optionalString(body.mealType, 'mealType'),
      eatenAt: this.optionalDate(body.eatenAt, 'eatenAt') ?? undefined,
    };
  }

  private parseFoodEntryUpdate(body: FoodEntryBody): FoodEntryUpdateData {
    const data: FoodEntryUpdateData = {};
    this.assignFoodFields(data, body);
    if (body.eatenAt !== undefined) {
      data.eatenAt = this.requiredDate(body.eatenAt, 'eatenAt');
    }
    return data;
  }

  private parseFoodListCreate(body: FoodListBody): FoodListCreateData {
    return {
      name: this.requiredString(body.name, 'name'),
      kcal: this.requiredPositiveInteger(body.kcal ?? body.calories, 'kcal'),
      proteinG: this.optionalNonNegativeNumber(body.proteinG, 'proteinG'),
      fatG: this.optionalNonNegativeNumber(body.fatG, 'fatG'),
      carbG: this.optionalNonNegativeNumber(body.carbG ?? body.carbsG, 'carbG'),
      description: this.optionalString(body.description, 'description'),
      imageUrl: this.optionalString(body.imageUrl, 'imageUrl'),
      mealType: this.optionalString(body.mealType, 'mealType'),
    };
  }

  private parseFoodListUpdate(body: FoodListBody): FoodListUpdateData {
    const data: FoodListUpdateData = {};
    this.assignFoodFields(data, body);
    if (body.description !== undefined) {
      data.description = this.optionalString(body.description, 'description');
    }
    return data;
  }

  private assignFoodFields(
    data: FoodEntryUpdateData | FoodListUpdateData,
    body: FoodEntryBody | FoodListBody,
  ): void {
    const foodName = 'foodName' in body ? body.foodName : undefined;
    if (body.name !== undefined || foodName !== undefined) {
      data.name = this.requiredString(body.name ?? foodName, 'name');
    }
    if (body.kcal !== undefined || body.calories !== undefined) {
      data.kcal = this.requiredPositiveInteger(
        body.kcal ?? body.calories,
        'kcal',
      );
    }
    if (body.proteinG !== undefined) {
      data.proteinG = this.optionalNonNegativeNumber(body.proteinG, 'proteinG');
    }
    if (body.fatG !== undefined) {
      data.fatG = this.optionalNonNegativeNumber(body.fatG, 'fatG');
    }
    if (body.carbG !== undefined || body.carbsG !== undefined) {
      data.carbG = this.optionalNonNegativeNumber(
        body.carbG ?? body.carbsG,
        'carbG',
      );
    }
    if (body.imageUrl !== undefined) {
      data.imageUrl = this.optionalString(body.imageUrl, 'imageUrl');
    }
    if (body.mealType !== undefined) {
      data.mealType = this.optionalString(body.mealType, 'mealType');
    }
  }

  private parseEntryWhere(
    userId: string,
    query: FoodQuery,
  ): Prisma.FoodEntryWhereInput {
    const where: Prisma.FoodEntryWhereInput = { userId };
    if (query.date !== undefined) {
      const start = this.parseDateOnly(query.date, 'date');
      const end = new Date(start);
      end.setUTCDate(end.getUTCDate() + 1);
      where.eatenAt = { gte: start, lt: end };
      return where;
    }

    const from = this.optionalDate(query.from, 'from');
    const to = this.optionalDate(query.to, 'to');
    if (from !== undefined || to !== undefined) {
      where.eatenAt = {};
      if (from !== undefined && from !== null) {
        where.eatenAt.gte = from;
      }
      if (to !== undefined && to !== null) {
        where.eatenAt.lte = to;
      }
    }
    return where;
  }

  private parsePagination(query: FoodQuery): { limit: number; offset: number } {
    const limit = this.optionalPositiveInteger(query.limit, 'limit') ?? 50;
    if (limit > MAX_PAGINATION_LIMIT) {
      throw new BadRequestException(
        `limit must be at most ${MAX_PAGINATION_LIMIT}`,
      );
    }
    return {
      limit,
      offset: this.optionalNonNegativeInteger(query.offset, 'offset') ?? 0,
    };
  }

  private async listCalendarEntries(userId: string, start: Date, end: Date) {
    const where: Prisma.FoodEntryWhereInput = {
      userId,
      eatenAt: { gte: start, lt: end },
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.foodEntry.findMany({
        where,
        orderBy: { eatenAt: 'asc' },
        select: FOOD_ENTRY_SELECT,
      }),
      this.prisma.foodEntry.count({ where }),
    ]);

    return { items, total };
  }

  private requiredString(value: unknown, field: string): string {
    if (typeof value !== 'string') {
      throw new BadRequestException(`${field} must be a string`);
    }
    const trimmed = value.trim();
    if (trimmed.length === 0) {
      throw new BadRequestException(`${field} is required`);
    }
    return trimmed;
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

  private requiredPositiveInteger(value: unknown, field: string): number {
    const number = this.optionalPositiveInteger(value, field);
    if (number === undefined || number === null) {
      throw new BadRequestException(`${field} is required`);
    }
    return number;
  }

  private optionalPositiveInteger(
    value: unknown,
    field: string,
  ): number | null | undefined {
    if (value === undefined) {
      return undefined;
    }
    if (value === null) {
      return null;
    }
    const number = this.parseNumber(value);
    if (number === undefined || !Number.isInteger(number) || number <= 0) {
      throw new BadRequestException(`${field} must be a positive integer`);
    }
    return number;
  }

  private optionalNonNegativeInteger(
    value: unknown,
    field: string,
  ): number | null | undefined {
    if (value === undefined) {
      return undefined;
    }
    if (value === null) {
      return null;
    }
    const number = this.parseNumber(value);
    if (number === undefined || !Number.isInteger(number) || number < 0) {
      throw new BadRequestException(`${field} must be a non-negative integer`);
    }
    return number;
  }

  private requiredMonth(value: unknown): number {
    const month = this.requiredPositiveInteger(value, 'month');
    if (month > 12) {
      throw new BadRequestException('month must be between 1 and 12');
    }
    return month;
  }

  private requiredYear(value: unknown): number {
    const year = this.requiredPositiveInteger(value, 'year');
    if (year < 1900 || year > 9999) {
      throw new BadRequestException('year must be between 1900 and 9999');
    }
    return year;
  }

  private optionalNonNegativeNumber(
    value: unknown,
    field: string,
  ): number | null | undefined {
    if (value === undefined) {
      return undefined;
    }
    if (value === null) {
      return null;
    }
    const number = this.parseNumber(value);
    if (number === undefined || !Number.isFinite(number) || number < 0) {
      throw new BadRequestException(`${field} must be a non-negative number`);
    }
    return number;
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

  private requiredDate(value: unknown, field: string): Date {
    if (value === null) {
      throw new BadRequestException(`${field} must be an ISO date string`);
    }
    const date = this.optionalDate(value, field);
    if (date === undefined || date === null) {
      throw new BadRequestException(`${field} is required`);
    }
    return date;
  }

  private parseDateOnly(value: unknown, field: string): Date {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      throw new BadRequestException(`${field} must be YYYY-MM-DD`);
    }
    return new Date(`${value}T00:00:00.000Z`);
  }

  private parseNumber(value: unknown): number | undefined {
    if (typeof value === 'number') {
      return value;
    }
    if (typeof value !== 'string' || value.trim() === '') {
      return undefined;
    }
    const number = Number(value);
    return Number.isNaN(number) ? undefined : number;
  }
}
