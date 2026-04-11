/** Lookup types — slim payloads from GET /api/v1/lookups */

export interface LookupVendor {
  public_id: string;
  name: string;
  abbreviation: string | null;
  is_contract_labor: boolean;
}

export interface LookupProject {
  public_id: string;
  name: string;
  abbreviation: string | null;
}

export interface LookupSubCostCode {
  public_id: string;
  number: string;
  name: string;
  cost_code_id: number | null;
}

export interface LookupCostCode {
  public_id: string;
  number: string;
  name: string;
}

export interface LookupPaymentTerm {
  public_id: string;
  name: string;
  due_days: number | null;
}

export interface LookupCustomer {
  public_id: string;
  name: string;
}

export interface LookupVendorType {
  public_id: string;
  name: string;
}

export interface LookupAddressType {
  public_id: string;
  name: string;
  display_order: number | null;
}

export interface LookupRole {
  public_id: string;
  name: string;
}

export interface LookupModule {
  public_id: string;
  name: string;
  route: string | null;
}

export interface Lookups {
  vendors?: LookupVendor[];
  projects?: LookupProject[];
  sub_cost_codes?: LookupSubCostCode[];
  cost_codes?: LookupCostCode[];
  payment_terms?: LookupPaymentTerm[];
  customers?: LookupCustomer[];
  vendor_types?: LookupVendorType[];
  address_types?: LookupAddressType[];
  roles?: LookupRole[];
  modules?: LookupModule[];
}

/** Full entity types — returned by CRUD endpoints */

export interface Vendor {
  id: number;
  public_id: string;
  row_version: string;
  created_datetime: string | null;
  modified_datetime: string | null;
  name: string;
  abbreviation: string | null;
  taxpayer_id: number | null;
  vendor_type_id: number | null;
  is_draft: boolean;
  is_deleted: boolean;
  is_contract_labor: boolean;
}

/** Auth types */

export interface AuthResponse {
  auth: {
    public_id: string;
    username: string;
    user_public_id: string | null;
  };
  token: {
    access_token: string;
    token_type: string;
    expires_in: number;
  };
  refresh_token?: {
    refresh_token: string;
    expires_in: number;
  };
}
