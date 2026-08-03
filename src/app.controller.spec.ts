import { Test, TestingModule } from '@nestjs/testing';
import { AppController } from './app.controller';

describe('AppController', () => {
  let appController: AppController;

  beforeEach(async () => {
    const app: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
    }).compile();

    appController = app.get<AppController>(AppController);
  });

  it('returns the documented health response', () => {
    expect(appController.getHealth()).toEqual({
      message: 'Backend is running',
      data: { status: 'ok' },
    });
  });
});
