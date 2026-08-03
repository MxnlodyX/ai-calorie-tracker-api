import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { AuthenticatedRequest } from '../authentication/authentication.types';
import { JwtAuthGuard } from '../authentication/guards/jwt-auth.guard';
import { FoodsService } from './foods.service';
import type { FoodEntryBody, FoodListBody, FoodQuery } from './foods.types';

@Controller()
@UseGuards(JwtAuthGuard)
export class FoodsController {
  constructor(private readonly foodsService: FoodsService) {}

  @Post('foods')
  async createEntry(
    @Req() request: AuthenticatedRequest,
    @Body() body: FoodEntryBody,
  ) {
    return {
      message: 'Food entry created successfully',
      data: await this.foodsService.createEntry(request.user.id, body),
    };
  }

  @Get('foods')
  async listEntries(
    @Req() request: AuthenticatedRequest,
    @Query() query: FoodQuery,
  ) {
    const result = await this.foodsService.listEntries(request.user.id, query);
    return { data: result.items, meta: { total: result.total } };
  }

  @Get('foods/:id')
  async getEntry(
    @Req() request: AuthenticatedRequest,
    @Param('id') id: string,
  ) {
    return {
      message: 'Food entry loaded successfully',
      data: await this.foodsService.getEntry(request.user.id, id),
    };
  }

  @Patch('foods/:id')
  async updateEntry(
    @Req() request: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() body: FoodEntryBody,
  ) {
    return {
      message: 'Food entry updated successfully',
      data: await this.foodsService.updateEntry(request.user.id, id, body),
    };
  }

  @Delete('foods/:id')
  async deleteEntry(
    @Req() request: AuthenticatedRequest,
    @Param('id') id: string,
  ) {
    await this.foodsService.deleteEntry(request.user.id, id);
    return { message: 'Food entry deleted successfully' };
  }

  @Post('food-lists')
  async createFoodListItem(
    @Req() request: AuthenticatedRequest,
    @Body() body: FoodListBody,
  ) {
    return {
      message: 'Food list item created successfully',
      data: await this.foodsService.createFoodListItem(request.user.id, body),
    };
  }

  @Get('food-lists')
  async listFoodListItems(
    @Req() request: AuthenticatedRequest,
    @Query() query: FoodQuery,
  ) {
    const result = await this.foodsService.listFoodListItems(
      request.user.id,
      query,
    );
    return { data: result.items, meta: { total: result.total } };
  }

  @Get('food-lists/:id')
  async getFoodListItem(
    @Req() request: AuthenticatedRequest,
    @Param('id') id: string,
  ) {
    return {
      message: 'Food list item loaded successfully',
      data: await this.foodsService.getFoodListItem(request.user.id, id),
    };
  }

  @Patch('food-lists/:id')
  async updateFoodListItem(
    @Req() request: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() body: FoodListBody,
  ) {
    return {
      message: 'Food list item updated successfully',
      data: await this.foodsService.updateFoodListItem(
        request.user.id,
        id,
        body,
      ),
    };
  }

  @Delete('food-lists/:id')
  async deleteFoodListItem(
    @Req() request: AuthenticatedRequest,
    @Param('id') id: string,
  ) {
    await this.foodsService.deleteFoodListItem(request.user.id, id);
    return { message: 'Food list item deleted successfully' };
  }
}
