import { ArrayMaxSize, IsArray, IsBoolean, IsInt, IsOptional, IsString, MaxLength, Min, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class BannerDto {
  @IsString() @MaxLength(64) id!: string;
  @IsString() @MaxLength(80) title!: string;
  @IsOptional() @IsString() @MaxLength(160) subtitle!: string | null;
  @IsString() @MaxLength(40) ctaLabel!: string;
  @IsString() @MaxLength(500) href!: string;
  @IsString() @MaxLength(128) desktopMediaId!: string;
  @IsOptional() @IsString() @MaxLength(128) mobileMediaId!: string | null;
  @IsString() @MaxLength(200) imageAlt!: string;
  @IsBoolean() enabled!: boolean;
  @IsOptional() @IsString() @MaxLength(40) publishAt!: string | null;
  @IsOptional() @IsString() @MaxLength(40) unpublishAt!: string | null;
}

export class BannersUpdateDto {
  @IsInt() @Min(0) expectedVersion!: number;
  @IsArray() @ArrayMaxSize(4) @ValidateNested({ each: true }) @Type(() => BannerDto) banners!: BannerDto[];
}
