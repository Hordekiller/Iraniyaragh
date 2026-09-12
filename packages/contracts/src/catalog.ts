import type { ApiSuccess, Money } from './index';

export type CatalogStatus = 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';

export type VariantStatus = 'ACTIVE' | 'INACTIVE' | 'ARCHIVED';
export type AttributeStatus = 'ACTIVE' | 'INACTIVE';

export type VariantDimensions = {
  lengthCm?: number;
  widthCm?: number;
  heightCm?: number;
};

export type VariantAttributeValuePayload = {
  attributeCode: string;
  optionCode: string;
};

export type VariantAttributeValue = {
  attributeCode: string;
  attributeName: string;
  optionCode: string;
  optionLabel: string;
  isVariantAxis: boolean;
};

export type AttributeOptionPayload = {
  code: string;
  label: string;
  status?: AttributeStatus;
};

export type AttributeDefinitionPayload = {
  code: string;
  name: string;
  description?: string;
  status?: AttributeStatus;
  options?: AttributeOptionPayload[];
};

export type ProductAttributeConfigurationPayload = {
  attributeCode: string;
  isVariantAxis: boolean;
  isRequired?: boolean;
};

export type CategoryNode = {
  id: string;
  name: string;
  slug: string;
  parentId: string | null;
  children: CategoryNode[];
  createdAt: string;
  updatedAt: string;
};

export type CategoryTreeResponse = ApiSuccess<{ tree: CategoryNode[] }>;

export type CategorySummary = {
  id: string;
  name: string;
  slug: string;
  parentId: string | null;
  productCount: number;
};

export type CategoryListResponse = ApiSuccess<{ items: CategorySummary[] }>;

export type CategoryCreateRequest = {
  name: string;
  slug: string;
  parentId?: string;
};

export type CategoryUpdateRequest = {
  name?: string;
  slug?: string;
  parentId?: string | null;
};

export type CategoryResponse = ApiSuccess<{ category: CategoryNode }>;

export type BrandSummary = {
  id: string;
  name: string;
  slug: string;
  productCount: number;
};

export type BrandListResponse = ApiSuccess<{ items: BrandSummary[] }>;

export type BrandCreateRequest = {
  name: string;
  slug: string;
};

export type BrandUpdateRequest = {
  name?: string;
  slug?: string;
};

export type BrandResponse = ApiSuccess<{ brand: BrandSummary }>;

export type ProductVariantPayload = {
  sku: string;
  barcode?: string;
  title?: string;
  costPrice: Money;
  salePrice: Money;
  weightGrams?: number;
  status?: VariantStatus;
  dimensions?: VariantDimensions;
  attributeValues?: VariantAttributeValuePayload[];
};

export type ProductPayload = {
  name: string;
  slug: string;
  description?: string;
  brandId?: string;
  categoryId?: string;
  status?: CatalogStatus;
  attributeConfig?: ProductAttributeConfigurationPayload[];
  variants?: ProductVariantPayload[];
};

export type ProductCreateRequest = ProductPayload;

export type ProductUpdateRequest = Partial<Omit<ProductPayload, 'variants'>> & {
  expectedVersion: number;
};

export type ProductListItem = {
  id: string;
  name: string;
  slug: string;
  status: CatalogStatus;
  brandId: string | null;
  categoryId: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ProductListQuery = {
  page?: number;
  perPage?: number;
  search?: string;
  status?: CatalogStatus;
  brandId?: string;
  categoryId?: string;
  sortBy?: 'name' | 'createdAt' | 'updatedAt';
  sortDir?: 'asc' | 'desc';
};

export type ProductListMeta = {
  page: number;
  perPage: number;
  total: number;
  pages: number;
};

export type ProductListResponse = ApiSuccess<{
  items: ProductListItem[];
  meta: ProductListMeta;
}>;

export type ProductVariant = Omit<ProductVariantPayload, 'status'> & {
  id: string;
  status?: VariantStatus;
  isActive: boolean;
  version?: number;
  attributeValues?: VariantAttributeValue[];
  createdAt: string;
  updatedAt: string;
};

export type ProductAttributeConfiguration = {
  attributeCode: string;
  attributeName: string;
  isVariantAxis: boolean;
  isRequired: boolean;
};

export type ProductDetail = ProductListItem & {
  description: string | null;
  brand: BrandSummary | null;
  category: CategorySummary | null;
  version?: number;
  attributes?: ProductAttributeConfiguration[];
  variants: ProductVariant[];
};

export type ProductDetailResponse = ApiSuccess<{ product: ProductDetail }>;

export type ProductVariantPublic = Omit<
  ProductVariant,
  'barcode' | 'costPrice'
>;

export type ProductDetailPublic = ProductListItem & {
  description: string | null;
  brand: BrandSummary | null;
  category: CategorySummary | null;
  variants: ProductVariantPublic[];
};

export type ProductDetailPublicResponse = ApiSuccess<{
  product: ProductDetailPublic;
}>;

export type ProductStatusAction =
  { action: 'publish' } | { action: 'unpublish' } | { action: 'archive' };

export type ProductStatusResponse = ApiSuccess<{ product: ProductDetail }>;

export type AttributeOptionSummary = {
  id: string;
  code: string;
  label: string;
  status: AttributeStatus;
  version: number;
  createdAt: string;
  updatedAt: string;
};

export type AttributeDefinitionSummary = {
  id: string;
  code: string;
  name: string;
  description: string | null;
  status: AttributeStatus;
  optionCount: number;
  version: number;
  createdAt: string;
  updatedAt: string;
};

export type AttributeDefinitionDetail = AttributeDefinitionSummary & {
  options: AttributeOptionSummary[];
};

export type AttributeDefinitionCreateRequest = AttributeDefinitionPayload;

export type AttributeDefinitionUpdateRequest = {
  name?: string;
  description?: string | null;
  status?: AttributeStatus;
  expectedVersion: number;
};

export type AttributeOptionCreateRequest = AttributeOptionPayload;

export type AttributeOptionUpdateRequest = {
  label?: string;
  status?: AttributeStatus;
  expectedVersion: number;
};

export type AttributeListResponse = ApiSuccess<{
  items: AttributeDefinitionSummary[];
}>;
export type AttributeDefinitionResponse = ApiSuccess<{
  attribute: AttributeDefinitionDetail;
}>;
export type AttributeOptionResponse = ApiSuccess<{
  option: AttributeOptionSummary;
}>;

export type ProductVariantUpdateRequest = {
  barcode?: string | null;
  title?: string | null;
  weightGrams?: number | null;
  dimensions?: VariantDimensions | null;
  expectedVersion: number;
};

export type ProductVariantStatusRequest = {
  status: VariantStatus;
  expectedVersion: number;
};

export type VariantPriceSource = 'ADMIN' | 'IMPORT' | 'SYSTEM';

export type VariantPriceRecord = {
  id: string;
  variantId: string;
  costPrice: Money;
  salePrice: Money;
  effectiveAt: string;
  source: VariantPriceSource;
  actorUserId: string | null;
  reason: string | null;
  requestId: string | null;
  createdAt: string;
};

export type VariantPriceUpdateRequest = {
  costPrice: Money;
  salePrice: Money;
  reason?: string;
  effectiveAt?: string;
  expectedVersion: number;
};

export type ProductVariantResponse = ApiSuccess<{ variant: ProductVariant }>;
export type VariantPriceResponse = ApiSuccess<{
  variant: ProductVariant;
  record: VariantPriceRecord;
}>;
export type VariantPriceHistoryResponse = ApiSuccess<{
  items: VariantPriceRecord[];
  meta: ProductListMeta;
}>;

export type VariantGeneratePreviewRequest = {
  optionSelection: Record<string, string[]>;
};

export type VariantCombinationPreview = {
  label: string;
  combinationSignature: string;
  attributeValues: VariantAttributeValue[];
};

export type VariantGeneratePreviewResponse = ApiSuccess<{
  combinations: VariantCombinationPreview[];
  total: number;
  limit: number;
}>;

export type VariantGenerateRequest = VariantGeneratePreviewRequest & {
  costPrice: Money;
  salePrice: Money;
  titlePattern?: string;
};

export type VariantGenerateResponse = ApiSuccess<{
  variants: ProductVariant[];
}>;

export const CATALOG_IMPORT_WORKBOOK_VERSION = '1' as const;

export type CatalogImportStatus = 'UPLOADED' | 'READY' | 'COMMITTED' | 'FAILED';
export type CatalogImportAction = 'create' | 'update' | 'unchanged' | 'error';
export type CatalogImportErrorCode =
  | 'DUPLICATE_SKU'
  | 'DUPLICATE_BARCODE'
  | 'DUPLICATE_VARIANT_COMBINATION'
  | 'SKU_CHANGE_NOT_ALLOWED'
  | 'ATTRIBUTE_OPTION_INVALID'
  | 'IMPORT_VALIDATION'
  | 'IMPORT_TOO_LARGE'
  | 'COMBINATION_LIMIT_EXCEEDED'
  | 'IMPORT_NOT_AVAILABLE';

export type CatalogImportSummary = {
  products: {
    create: number;
    update: number;
    unchanged: number;
    error: number;
  };
  variants: {
    create: number;
    update: number;
    unchanged: number;
    error: number;
  };
  attributes: {
    create: number;
    update: number;
    unchanged: number;
    error: number;
  };
  options: { create: number; update: number; unchanged: number; error: number };
};

export type CatalogImportIssue = {
  sheet: string;
  rowNumber: number;
  key: string | null;
  code: CatalogImportErrorCode;
  message: string;
};

export type CatalogImportReportItem = {
  sheet: string;
  key: string;
  action: CatalogImportAction;
  warnings: string[];
};

export type CatalogImportDryRunReport = {
  importId: string;
  status: CatalogImportStatus;
  summary: CatalogImportSummary;
  issues: CatalogImportIssue[];
  items: CatalogImportReportItem[];
  truncated: boolean;
  totalRows: number;
};

export type CatalogImportCommitResult = {
  importId: string;
  status: CatalogImportStatus;
  committedAt: string;
  summary: CatalogImportSummary;
  errorCount: number;
};

export type CatalogImportUploadResponse = ApiSuccess<{
  report: CatalogImportDryRunReport;
}>;
export type CatalogImportDryRunResponse = ApiSuccess<{
  report: CatalogImportDryRunReport;
}>;
export type CatalogImportCommitResponse = ApiSuccess<{
  result: CatalogImportCommitResult;
}>;
export type CatalogImportDetailResponse = ApiSuccess<{
  report: CatalogImportDryRunReport;
}>;

export type CatalogExportQuery = {
  status?: CatalogStatus;
  brandId?: string;
  categoryId?: string;
};
