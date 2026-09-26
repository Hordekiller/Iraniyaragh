import { IsInt, Min } from 'class-validator';

export class RecordFulfillmentPickDto {
  @IsInt()
  @Min(1)
  quantity!: number;
}
