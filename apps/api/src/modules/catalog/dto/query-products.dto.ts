import { IsOptional, IsString, MaxLength } from 'class-validator';
import { PageQueryDto } from '../../../common/dto/pagination.dto';

export class QueryProductsDto extends PageQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  categorySlug?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  search?: string;
}
