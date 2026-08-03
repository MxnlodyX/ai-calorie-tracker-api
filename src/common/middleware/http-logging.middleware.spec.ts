import { Logger } from '@nestjs/common';
import { EventEmitter } from 'node:events';
import type { NextFunction, Request, Response } from 'express';
import { HttpLoggingMiddleware } from './http-logging.middleware';

describe('HttpLoggingMiddleware', () => {
  const request = {
    method: 'GET',
    path: '/authentications/me',
  } as Request;

  afterEach(() => jest.restoreAllMocks());

  it('logs a successful API response with step and status', () => {
    const log = jest.spyOn(Logger.prototype, 'log').mockImplementation();
    const response = new EventEmitter() as Response & EventEmitter;
    response.statusCode = 200;
    const next = jest.fn() as NextFunction;

    new HttpLoggingMiddleware().use(request, response, next);
    response.emit('finish');

    expect(next).toHaveBeenCalled();
    expect(log).toHaveBeenCalledWith(
      expect.objectContaining({
        flow: 'http',
        step: 'request_completed',
        status: 'success',
        statusCode: 200,
        method: 'GET',
        path: '/authentications/me',
      }),
    );
  });

  it('logs an authentication failure without request data', () => {
    jest.spyOn(Logger.prototype, 'log').mockImplementation();
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    const response = new EventEmitter() as Response & EventEmitter;
    response.statusCode = 401;

    new HttpLoggingMiddleware().use(request, response, jest.fn());
    response.emit('finish');

    expect(warn).toHaveBeenCalledWith(
      expect.objectContaining({
        flow: 'http',
        step: 'request_completed',
        status: 'failed',
        statusCode: 401,
        method: 'GET',
        path: '/authentications/me',
      }),
    );
  });
});
