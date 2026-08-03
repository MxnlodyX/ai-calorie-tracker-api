import { Body, Controller, Get, Put, Req, UseGuards } from '@nestjs/common';
import type { AuthenticatedRequest } from '../authentication/authentication.types';
import { JwtAuthGuard } from '../authentication/guards/jwt-auth.guard';
import type { UpdateUserProfileBody } from './users.types';
import { UsersService } from './users.service';

@Controller('users')
@UseGuards(JwtAuthGuard)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('profile')
  async getProfile(@Req() request: AuthenticatedRequest) {
    return {
      message: 'User profile loaded successfully',
      data: await this.usersService.getProfile(request.user.id),
    };
  }

  @Put('profile')
  async updateProfile(
    @Req() request: AuthenticatedRequest,
    @Body() body: UpdateUserProfileBody,
  ) {
    return {
      message: 'User profile updated successfully',
      data: await this.usersService.updateProfile(request.user.id, body),
    };
  }
}
