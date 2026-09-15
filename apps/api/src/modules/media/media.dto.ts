import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, Matches, Max, MaxLength, Min } from 'class-validator';

export class ProductMediaUploadDto {
  @IsEnum(['IMAGE', 'VIDEO'])
  kind!: 'IMAGE' | 'VIDEO';

  @IsEnum(['PRIMARY', 'GALLERY', 'VIDEO_POSTER'])
  role!: 'PRIMARY' | 'GALLERY' | 'VIDEO_POSTER';

  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(11)
  position!: number;

  @IsString()
  @MaxLength(255)
  originalFilename!: string;

  @IsEnum(['image/jpeg', 'image/png', 'image/webp', 'video/mp4'])
  declaredMime!: 'image/jpeg' | 'image/png' | 'image/webp' | 'video/mp4';

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100 * 1024 * 1024)
  bytes!: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  productVersion!: number;
}

export class ProductMediaConfirmDto {
  @IsOptional()
  @IsString()
  @Matches(/^[a-f0-9]{64}$/u)
  checksumSha256?: string;
}
