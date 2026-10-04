import {
  IsInt,
  IsString,
  Matches,
  Max,
  Min,
  ValidateIf,
} from "class-validator";

export class SmsTemplateSettingsUpdateDto {
  @IsInt()
  @Min(0)
  @Max(2_147_483_646)
  expectedVersion!: number;
  @IsString()
  @Matches(/^[\w-]{8,96}$/u)
  idempotencyKey!: string;
  @ValidateIf((_object, value) => value !== null)
  @IsInt()
  @Min(1)
  @Max(9_999_999_999)
  otpTemplateId!: number | null;
  @ValidateIf((_object, value) => value !== null)
  @IsInt()
  @Min(1)
  @Max(9_999_999_999)
  orderPaidTemplateId!: number | null;
  @ValidateIf((_object, value) => value !== null)
  @IsInt()
  @Min(1)
  @Max(9_999_999_999)
  shipmentDispatchedTemplateId!: number | null;
  @ValidateIf((_object, value) => value !== null)
  @IsInt()
  @Min(1)
  @Max(9_999_999_999)
  shipmentDeliveredTemplateId!: number | null;
}

const fields = {
  otpTemplateId: {
    type: "integer",
    nullable: true,
    minimum: 1,
    maximum: 9_999_999_999,
  },
  orderPaidTemplateId: {
    type: "integer",
    nullable: true,
    minimum: 1,
    maximum: 9_999_999_999,
  },
  shipmentDispatchedTemplateId: {
    type: "integer",
    nullable: true,
    minimum: 1,
    maximum: 9_999_999_999,
  },
  shipmentDeliveredTemplateId: {
    type: "integer",
    nullable: true,
    minimum: 1,
    maximum: 9_999_999_999,
  },
};
export const smsTemplateUpdateSchema = {
  type: "object",
  additionalProperties: false,
  required: ["expectedVersion", "idempotencyKey", ...Object.keys(fields)],
  properties: {
    ...fields,
    expectedVersion: { type: "integer", minimum: 0, maximum: 2_147_483_646 },
    idempotencyKey: {
      type: "string",
      minLength: 8,
      maxLength: 96,
      pattern: "^[\\w-]{8,96}$",
    },
  },
};
export const smsTemplateResponseSchema = {
  type: "object",
  required: ["data"],
  properties: {
    data: {
      type: "object",
      required: ["templates"],
      properties: {
        templates: {
          type: "object",
          required: ["version", "updatedAt", ...Object.keys(fields)],
          properties: {
            ...fields,
            version: { type: "integer", minimum: 0 },
            updatedAt: { type: "string", format: "date-time", nullable: true },
          },
        },
      },
    },
  },
};
