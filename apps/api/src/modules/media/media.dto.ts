import { Type } from 'class-transformer';
import { IsArray, IsEnum, IsInt, IsOptional, IsString, Matches, Max, MaxLength, Min, ValidateNested } from 'class-validator';

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

export class ProductMediaMetadataDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  expectedVersion!: number;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  altText?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  caption?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  posterMediaId?: string | null;
}

export class ProductMediaOrderItemDto {
  @IsString()
  @MaxLength(128)
  mediaId!: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  expectedVersion!: number;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(11)
  position!: number;
}

export class ProductMediaReorderDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  expectedProductVersion!: number;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ProductMediaOrderItemDto)
  items!: ProductMediaOrderItemDto[];
}

export class ProductMediaArchiveDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  expectedVersion!: number;
}
