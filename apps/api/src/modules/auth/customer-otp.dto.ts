import { Matches, MaxLength, IsIn, IsOptional, IsString, Length } from 'class-validator';

const DEVICE_NAME_PATTERN = /^[^\p{Cc}]{1,150}$/u;

export class CustomerOtpRequestDto {
  @IsString()
  @MaxLength(64)
  mobile!: string;

  @IsIn(['CUSTOMER_WEB'], {
    message: 'client must be CUSTOMER_WEB.',
  })
  client!: 'CUSTOMER_WEB';
}

export class CustomerOtpVerifyDto {
  @IsString()
  @MaxLength(100)
  challengeId!: string;

  @IsString()
  @Length(6, 6)
  @Matches(/^\d{6}$/u, {
    message: 'code must be exactly six ASCII digits.',
  })
  code!: string;

  @IsOptional()
  @IsString()
  @Matches(DEVICE_NAME_PATTERN, {
    message: 'deviceName must be control-character-free text of at most 150 characters.',
  })
  deviceName?: string;
}