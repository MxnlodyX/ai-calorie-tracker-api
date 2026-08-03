import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';

describe('AppController (e2e)', () => {
  let app: INestApplication<App>;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  it('/health (GET)', () => {
    return request(app.getHttpServer())
      .get('/health')
      .expect(200)
      .expect({
        message: 'Backend is running',
        data: { status: 'ok' },
      });
  });

  it.each([
    ['GET', '/users/profile'],
    ['GET', '/foods'],
    ['POST', '/upload/food-image'],
  ])('protects %s %s without an authenticated session', (method, path) => {
    const call =
      method === 'GET'
        ? request(app.getHttpServer()).get(path)
        : request(app.getHttpServer()).post(path);

    return call.expect(401);
  });

  afterEach(async () => {
    await app.close();
  });
});
