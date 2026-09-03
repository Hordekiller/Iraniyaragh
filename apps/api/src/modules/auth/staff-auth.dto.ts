import { IsNotEmpty, IsOptional, IsString, MaxLength, Matches } from 'class-validator';

const DEV_CODE_PATTERN = /^[A-Za-z0-9._~-]{6,256}$/u;

export class StaffDevSignInDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(256)
  @Matches(DEV_CODE_PATTERN, {
    message: 'code must be a non-empty alphanumeric value no longer than 256 characters.',
  })
  code!: string;

  @IsOptional()
  @IsString()
  @MaxLength(150)
  deviceName?: string;
}
