import { Controller, Get } from '@nestjs/common';

@Controller('health')
export class AppController {
  @Get()
  getHealth() {
    return {
      message: 'Backend is running',
      data: { status: 'ok' },
    };
  }
}
