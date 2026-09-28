export type Supplier = {
  id: string;
  code: string;
  name: string;
  mobile: string | null;
  phone: string | null;
  email: string | null;
  nationalId: string | null;
  economicCode: string | null;
  isActive: boolean;
  version: number;
  createdAt: string;
  updatedAt: string;
};

export type SupplierListResponse = { items: Supplier[]; count: number };
export type SupplierCreateRequest = Pick<Supplier, 'code' | 'name'> & Partial<Pick<Supplier, 'mobile' | 'phone' | 'email' | 'nationalId' | 'economicCode'>>;
export type SupplierUpdateRequest = Partial<Pick<Supplier, 'name' | 'mobile' | 'phone' | 'email' | 'nationalId' | 'economicCode' | 'isActive'>> & { expectedVersion: number };
export type SupplierAuditEntry = { id: string; action: string; actorId: string | null; createdAt: string };
export type SupplierAuditResponse = { items: SupplierAuditEntry[]; count: number };
