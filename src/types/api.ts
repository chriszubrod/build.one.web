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

export interface VendorType {
  id: number;
  public_id: string;
  row_version: string;
  created_datetime: string | null;
  modified_datetime: string | null;
  name: string;
  description: string | null;
}

export interface Role {
  id: number;
  public_id: string;
  row_version: string;
  created_datetime: string | null;
  modified_datetime: string | null;
  name: string;
}

export interface Module {
  id: number;
  public_id: string;
  row_version: string;
  created_datetime: string | null;
  modified_datetime: string | null;
  name: string;
  route: string | null;
}

export interface AddressType {
  id: number;
  public_id: string;
  row_version: string;
  created_datetime: string | null;
  modified_datetime: string | null;
  name: string;
  description: string | null;
  display_order: number | null;
}

export interface PaymentTerm {
  id: number;
  public_id: string;
  row_version: string;
  created_datetime: string | null;
  modified_datetime: string | null;
  name: string;
  description: string | null;
  due_days: number | null;
  discount_days: number | null;
  discount_percent: number | null;
}

export interface Customer {
  id: number;
  public_id: string;
  row_version: string;
  created_datetime: string | null;
  modified_datetime: string | null;
  name: string;
  email: string;
  phone: string;
}

export interface Company {
  id: number;
  public_id: string;
  row_version: string;
  created_datetime: string | null;
  modified_datetime: string | null;
  name: string;
  website: string;
}

export interface Organization {
  id: number;
  public_id: string;
  row_version: string;
  created_datetime: string | null;
  modified_datetime: string | null;
  name: string;
  website: string | null;
}

export interface Project {
  id: number;
  public_id: string;
  row_version: string;
  created_datetime: string | null;
  modified_datetime: string | null;
  name: string;
  description: string | null;
  status: string | null;
  customer_id: number | null;
  abbreviation: string | null;
}

export interface CostCode {
  id: number;
  public_id: string;
  row_version: string;
  created_datetime: string | null;
  modified_datetime: string | null;
  number: string;
  name: string;
  description: string | null;
}

export interface SubCostCode {
  id: number;
  public_id: string;
  row_version: string;
  created_datetime: string | null;
  modified_datetime: string | null;
  number: string;
  name: string;
  description: string | null;
  cost_code_id: number;
}

export interface User {
  id: number;
  public_id: string;
  row_version: string;
  created_datetime: string | null;
  modified_datetime: string | null;
  firstname: string;
  lastname: string | null;
}

export interface ReviewStatus {
  id: number;
  public_id: string;
  row_version: string;
  created_datetime: string | null;
  modified_datetime: string | null;
  name: string;
  description: string | null;
  sort_order: number;
  is_final: boolean;
  is_declined: boolean;
  is_active: boolean;
  color: string | null;
}

export interface ClassificationOverride {
  id: number;
  public_id: string;
  row_version: string;
  created_datetime: string | null;
  modified_datetime: string | null;
  match_type: string;
  match_value: string;
  classification_type: string;
  notes: string | null;
  is_active: boolean;
  created_by: string | null;
}

export interface Taxpayer {
  id: number;
  public_id: string;
  row_version: string;
  created_datetime: string | null;
  modified_datetime: string | null;
  entity_name: string | null;
  business_name: string | null;
  classification: string | null;
  taxpayer_id_number: string | null;
  is_signed: number;
  signature_date: string | null;
}

export interface Integration {
  id: number;
  public_id: string;
  row_version: string;
  created_datetime: string | null;
  modified_datetime: string | null;
  name: string;
  status: string;
}

export interface UserRole {
  id: number;
  public_id: string;
  row_version: string;
  created_datetime: string | null;
  modified_datetime: string | null;
  user_id: number;
  role_id: number;
}

export interface UserModule {
  id: number;
  public_id: string;
  row_version: string;
  created_datetime: string | null;
  modified_datetime: string | null;
  user_id: number;
  module_id: number;
}

export interface UserProject {
  id: number;
  public_id: string;
  row_version: string;
  created_datetime: string | null;
  modified_datetime: string | null;
  user_id: number;
  project_id: number;
}

export interface RoleModule {
  id: number;
  public_id: string;
  row_version: string;
  created_datetime: string | null;
  modified_datetime: string | null;
  role_id: number;
  module_id: number;
  can_create: boolean;
  can_read: boolean;
  can_update: boolean;
  can_delete: boolean;
  can_submit: boolean;
  can_approve: boolean;
  can_complete: boolean;
}

export interface VendorAddress {
  id: number;
  public_id: string;
  row_version: string;
  created_datetime: string | null;
  modified_datetime: string | null;
  vendor_id: string;
  address_id: string;
  address_type_id: string;
}

export interface ProjectAddress {
  id: number;
  public_id: string;
  row_version: string;
  created_datetime: string | null;
  modified_datetime: string | null;
  project_id: number;
  address_id: number;
  address_type_id: number;
}

export interface Address {
  id: number;
  public_id: string;
  row_version: string;
  created_datetime: string | null;
  modified_datetime: string | null;
  street_one: string;
  street_two: string | null;
  city: string;
  state: string;
  zip: string;
  country: { name: string; abbreviation: string } | null;
}

export interface Contact {
  id: number;
  public_id: string;
  row_version: string;
  created_datetime: string | null;
  modified_datetime: string | null;
  email: string | null;
  office_phone: string | null;
  mobile_phone: string | null;
  fax: string | null;
  notes: string | null;
  user_id: number | null;
  company_id: number | null;
  customer_id: number | null;
  project_id: number | null;
  vendor_id: number | null;
}

/** Tier 3 — Complex entities */

export interface Bill {
  id: number;
  public_id: string;
  row_version: string;
  created_datetime: string | null;
  modified_datetime: string | null;
  vendor_id: number;
  payment_term_id: number | null;
  bill_date: string;
  due_date: string;
  bill_number: string;
  total_amount: string | null;
  memo: string | null;
  is_draft: boolean;
}

export interface BillLineItem {
  id: number;
  public_id: string;
  row_version: string;
  created_datetime: string | null;
  modified_datetime: string | null;
  bill_id: number;
  sub_cost_code_id: number | null;
  project_id: number | null;
  description: string | null;
  quantity: number | null;
  rate: string | null;
  amount: string | null;
  is_billable: boolean | null;
  is_billed: boolean | null;
  markup: string | null;
  price: string | null;
  is_draft: boolean;
}

export interface Expense {
  id: number;
  public_id: string;
  row_version: string;
  created_datetime: string | null;
  modified_datetime: string | null;
  vendor_id: number;
  expense_date: string;
  reference_number: string;
  total_amount: string | null;
  memo: string | null;
  is_draft: boolean;
  is_credit: boolean;
}

export interface ExpenseLineItem {
  id: number;
  public_id: string;
  row_version: string;
  created_datetime: string | null;
  modified_datetime: string | null;
  expense_id: number;
  sub_cost_code_id: number | null;
  project_id: number | null;
  description: string | null;
  quantity: number | null;
  rate: string | null;
  amount: string | null;
  is_billable: boolean | null;
  is_billed: boolean | null;
  markup: string | null;
  price: string | null;
  is_draft: boolean;
}

export interface BillCredit {
  id: number;
  public_id: string;
  row_version: string;
  created_datetime: string | null;
  modified_datetime: string | null;
  vendor_id: number;
  credit_date: string;
  credit_number: string;
  total_amount: string | null;
  memo: string | null;
  is_draft: boolean;
}

export interface BillCreditLineItem {
  id: number;
  public_id: string;
  row_version: string;
  created_datetime: string | null;
  modified_datetime: string | null;
  bill_credit_id: number;
  sub_cost_code_id: number | null;
  project_id: number | null;
  description: string | null;
  quantity: string | null;
  unit_price: string | null;
  amount: string | null;
  is_billable: boolean | null;
  is_billed: boolean | null;
  billable_amount: string | null;
  is_draft: boolean;
}

export interface Invoice {
  id: number;
  public_id: string;
  row_version: string;
  created_datetime: string | null;
  modified_datetime: string | null;
  project_id: number;
  payment_term_id: number | null;
  invoice_date: string;
  due_date: string;
  invoice_number: string;
  total_amount: string | null;
  memo: string | null;
  is_draft: boolean;
}

export interface InvoiceLineItem {
  id: number;
  public_id: string;
  row_version: string;
  created_datetime: string | null;
  modified_datetime: string | null;
  invoice_id: number;
  source_type: string;
  bill_line_item_id: number | null;
  expense_line_item_id: number | null;
  bill_credit_line_item_id: number | null;
  sub_cost_code_id: number | null;
  description: string | null;
  quantity: string | null;
  rate: string | null;
  amount: string | null;
  markup: string | null;
  price: string | null;
  is_draft: boolean;
}

export interface ContractLabor {
  id: number;
  public_id: string;
  row_version: string;
  created_datetime: string | null;
  modified_datetime: string | null;
  vendor_id: number;
  project_id: number | null;
  employee_name: string;
  work_date: string;
  time_in: string | null;
  time_out: string | null;
  break_time: string | null;
  regular_hours: string | null;
  overtime_hours: string | null;
  total_hours: string;
  hourly_rate: string | null;
  markup: string | null;
  total_amount: string | null;
  sub_cost_code_id: number | null;
  description: string | null;
  billing_period_start: string | null;
  status: string;
  bill_line_item_id: number | null;
  import_batch_id: string | null;
  source_file: string | null;
  source_row: number | null;
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
