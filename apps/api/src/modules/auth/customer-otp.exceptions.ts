import { UnauthorizedException } from '@nestjs/common';

export class InvalidOtpChallengeException extends UnauthorizedException {
  constructor() {
    super({
      code: 'AUTH_CHALLENGE_INVALID',
      message: 'Authentication could not be completed.',
      statusCode: 401,
    });
    this.name = 'InvalidOtpChallengeException';
  }
}

export class ExpiredOtpChallengeException extends UnauthorizedException {
  constructor() {
    super({
      code: 'AUTH_CHALLENGE_EXPIRED',
      message: 'Authentication could not be completed.',
      statusCode: 401,
    });
    this.name = 'ExpiredOtpChallengeException';
  }
}