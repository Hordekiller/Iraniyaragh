import { Type } from "class-transformer";
import { IsArray, IsEnum, IsInt, IsOptional, IsString, Matches, Max, MaxLength, Min, ValidateNested } from "class-validator";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

export class ProductMediaUploadDto {
  @ApiProperty({ type: String, enum: ["IMAGE", "VIDEO"] })
  @IsEnum(["IMAGE", "VIDEO"])
  kind!: "IMAGE" | "VIDEO";

  @ApiProperty({ type: String, enum: ["PRIMARY", "GALLERY", "VIDEO_POSTER"] })
  @IsEnum(["PRIMARY", "GALLERY", "VIDEO_POSTER"])
  role!: "PRIMARY" | "GALLERY" | "VIDEO_POSTER";

  @ApiProperty({ type: Number, minimum: 0 })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  position!: number;

  @ApiProperty({ type: String, maxLength: 255 })
  @IsString()
  @MaxLength(255)
  originalFilename!: string;

  @ApiProperty({
    type: String,
    enum: ["image/jpeg", "image/png", "image/webp", "video/mp4"],
  })
  @IsEnum(["image/jpeg", "image/png", "image/webp", "video/mp4"])
  declaredMime!: "image/jpeg" | "image/png" | "image/webp" | "video/mp4";

  @ApiProperty({ type: Number, minimum: 1, maximum: 104857600 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100 * 1024 * 1024)
  bytes!: number;

  @ApiProperty({ type: Number, minimum: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  productVersion!: number;
}

export class ProductMediaConfirmDto {
  @ApiPropertyOptional({ type: String, pattern: "^[a-f0-9]{64}$" })
  @IsOptional()
  @IsString()
  @Matches(/^[a-f0-9]{64}$/u)
  checksumSha256?: string;
}

export class ProductMediaMetadataDto {
  @ApiProperty({ type: Number, minimum: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  expectedVersion!: number;

  @ApiPropertyOptional({ type: String, nullable: true, maxLength: 300 })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  altText?: string | null;

  @ApiPropertyOptional({ type: String, nullable: true, maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  caption?: string | null;

  @ApiPropertyOptional({ type: String, nullable: true, maxLength: 128 })
  @IsOptional()
  @IsString()
  @MaxLength(128)
  posterMediaId?: string | null;
}

export class ProductMediaOrderItemDto {
  @ApiProperty({ type: String, maxLength: 128 })
  @IsString()
  @MaxLength(128)
  mediaId!: string;

  @ApiProperty({ type: Number, minimum: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  expectedVersion!: number;

  @ApiProperty({ type: Number, minimum: 0 })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  position!: number;
}

export class ProductMediaReorderDto {
  @ApiProperty({ type: Number, minimum: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  expectedProductVersion!: number;

  @ApiProperty({ type: () => [ProductMediaOrderItemDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ProductMediaOrderItemDto)
  items!: ProductMediaOrderItemDto[];
}

export class ProductMediaArchiveDto {
  @ApiProperty({ type: Number, minimum: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  expectedVersion!: number;
}

export class ProductMediaPrimaryDto {
  @ApiProperty({ type: Number, minimum: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  expectedProductVersion!: number;

  @ApiProperty({ type: Number, minimum: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  expectedVersion!: number;
}
