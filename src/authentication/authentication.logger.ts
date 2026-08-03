import { Injectable, Logger } from '@nestjs/common';

export type AuthenticationFlow =
  'google_oauth' | 'authenticated_request' | 'logout';

type AuthenticationLogEntry = {
  flow: AuthenticationFlow;
  step: number;
  action: string;
  status: 'success' | 'failed';
  message: string;
};

@Injectable()
export class AuthenticationLogger {
  private readonly logger = new Logger('AuthenticationFlow');

  success(
    flow: AuthenticationFlow,
    step: number,
    action: string,
    message: string,
  ): void {
    this.write({ flow, step, action, status: 'success', message });
  }

  failed(
    flow: AuthenticationFlow,
    step: number,
    action: string,
    message: string,
  ): void {
    this.write({ flow, step, action, status: 'failed', message });
  }

  private write(entry: AuthenticationLogEntry): void {
    if (entry.status === 'failed') {
      this.logger.warn(entry);
      return;
    }

    this.logger.log(entry);
  }
}
