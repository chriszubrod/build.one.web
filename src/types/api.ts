/** Lookup types — slim payloads from GET /api/v1/lookups */

export interface LookupVendor {
  public_id: string;
  name: string;
  abbreviation: string | null;
  is_contract_labor: boolean;
}

export interface LookupContractLaborVendor {
  id: number;
  public_id: string;
  name: string;
  abbreviation: string | null;
}

export interface LookupEmployee {
  id: number;
  public_id: string;
  firstname: string;
  lastname: string;
  /** Convenience pre-joined "Firstname Lastname" for picker labels. */
  label: string;
}

export interface LookupProject {
  /** Phase 7b — added so picker forms can hydrate from item.project_id (internal BIGINT). */
  id: number;
  public_id: string;
  name: string;
  abbreviation: string | null;
}

export interface LookupSubCostCode {
  /** Phase 7b — added so picker forms can hydrate from item.sub_cost_code_id. */
  id: number;
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
  contract_labor_vendors?: LookupContractLaborVendor[];
  employees?: LookupEmployee[];
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

/** Current-user profile — returned by GET /api/v1/auth/me */

export interface CurrentUserModule {
  public_id: string;
  name: string;
  route: string | null;
  can_create: boolean;
  can_read: boolean;
  can_update: boolean;
  can_delete: boolean;
  can_submit: boolean;
  can_approve: boolean;
  can_complete: boolean;
  can_view_team: boolean;
}

export interface CurrentUserOrganization {
  public_id: string;
  name: string;
}

export interface CurrentUserCompany {
  public_id: string;
  name: string;
  organization: CurrentUserOrganization | null;
}

export interface CurrentUser {
  auth: { public_id: string; username: string };
  user: {
    id: number;
    public_id: string;
    firstname: string | null;
    lastname: string | null;
  } | null;
  role: { public_id: string; name: string } | null;
  is_admin: boolean;
  is_system_admin?: boolean;
  modules: CurrentUserModule[];
  accessible_project_ids: number[];
  /** All companies the user can switch to. */
  companies?: CurrentUserCompany[];
  /** Distinct organizations across `companies`. */
  organizations?: CurrentUserOrganization[];
  /** The currently-active company (drives RBAC + tenant scoping). */
  active_company?: CurrentUserCompany | null;
}

/** Full entity types — returned by CRUD endpoints */

export interface Employee {
  id: number;
  public_id: string;
  row_version: string;
  created_datetime: string | null;
  modified_datetime: string | null;
  firstname: string;
  lastname: string;
  email: string | null;
  /** DECIMAL — transported as string to preserve precision. */
  hourly_rate: string | null;
  /** DECIMAL — e.g. "0.50" = 50%. */
  markup: string | null;
  is_active: boolean;
  is_deleted: boolean;
  notes: string | null;
}

/** EmployeeLabor — internal employee labor aggregation row. Flows to Invoice (no Bill). */
export interface EmployeeLabor {
  id: number;
  public_id: string;
  row_version: string;
  created_datetime: string | null;
  modified_datetime: string | null;
  employee_id: number;
  project_id: number | null;
  work_date: string | null;
  billing_period_start: string | null;
  billing_period_end: string | null;
  total_hours: string | null;
  hourly_rate: string | null;
  markup: string | null;
  total_amount: string | null;
  sub_cost_code_id: number | null;
  description: string | null;
  /** pending_review → ready → invoiced */
  status: string | null;
  source_time_entry_id: number | null;
  invoice_line_item_id: number | null;
  employee_name?: string | null;
  project_name?: string | null;
}

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
  notes: string | null;
  /** Default contract-labor rate. DECIMAL transported as string. NULL = unset. */
  hourly_rate: string | null;
  /** Markup as decimal (e.g. "0.50" = 50%). NULL = unset. */
  markup: string | null;
}

export type ComplianceDocumentType = "BUSINESS_LICENSE" | "CONTRACTORS_LICENSE" | "CERTIFICATE_OF_INSURANCE";
export type ComplianceVerificationStatus = "Received" | "Verified" | "Rejected";
export type ComplianceCoverageType = "GL" | "AUTO" | "UMBRELLA" | "WC";

export interface VendorComplianceSlot {
  status: string; // "valid"|"expiring"|"expired"|"incomplete"|"missing" for licenses/COI; "present"|"missing" for W9
  document_public_id?: string | null;
  document_number?: string | null;
  issuing_authority?: string | null;
  expiry_date?: string | null;
  days_until_expiry?: number | null;
  verification_status?: ComplianceVerificationStatus | null;
  policy_count?: number;                 // COI only
  attachment_public_id?: string | null;  // W9 only
}
export interface VendorComplianceRosterEntry {
  vendor_public_id: string;
  vendor_name: string;
  vendor_abbreviation: string | null;
  slots: Record<string, VendorComplianceSlot>;
}
export interface VendorComplianceSuggestion {
  vendor_public_id: string;
  vendor_name: string;
  vendor_type: string;
}
export interface VendorComplianceDashboard {
  roster: VendorComplianceRosterEntry[];
  suggestions: VendorComplianceSuggestion[];
}
export interface VendorComplianceDocument {
  id: number; public_id: string; row_version: string;
  created_datetime: string | null; modified_datetime: string | null;
  vendor_id: number; document_type: ComplianceDocumentType;
  issuing_authority: string | null; document_number: string | null; classification: string | null;
  issue_date: string | null; expiry_date: string | null; attachment_id: number | null;
  verification_status: ComplianceVerificationStatus; created_by_user_id: number | null;
}
export interface VendorInsurancePolicy {
  id: number; public_id: string; row_version: string;
  created_datetime: string | null; modified_datetime: string | null;
  vendor_compliance_document_id: number;
  coverage_type: ComplianceCoverageType;
  carrier: string | null; policy_number: string | null;
  each_occurrence: string | null; aggregate: string | null;  // money transported as string
  effective_date: string | null; expiry_date: string | null; created_by_user_id: number | null;
}

export interface VendorFolderDrive {
  drive_public_id: string;
  name: string;
}

export interface VendorFolderBrowseItem {
  item_id: string;
  name: string;
  item_type: "folder" | "file";
  child_count?: number;
}

export interface VendorFolderLinkedFolder {
  name?: string;
  web_url?: string;
  drive_id: string;
  item_id: string;
}

export interface VendorFolderFile {
  graph_item_id: string;
  name: string;
  folder_path: string;
  size?: number;
  compliance_hint: boolean;
}

/** Per-(Vendor × Project) rate override. NULL fields inherit from Vendor defaults. */
export interface VendorProjectRate {
  id: number;
  public_id: string;
  row_version: string;
  created_datetime: string | null;
  modified_datetime: string | null;
  vendor_id: number;
  project_id: number;
  hourly_rate: string | null;
  markup: string | null;
  notes: string | null;
  is_deleted: boolean;
  vendor_name?: string | null;
  vendor_public_id?: string | null;
  project_name?: string | null;
  project_public_id?: string | null;
}

/** Per-(Employee × Project) rate override. Mirror of VendorProjectRate. */
export interface EmployeeProjectRate {
  id: number;
  public_id: string;
  row_version: string;
  created_datetime: string | null;
  modified_datetime: string | null;
  employee_id: number;
  project_id: number;
  hourly_rate: string | null;
  markup: string | null;
  notes: string | null;
  is_deleted: boolean;
  employee_name?: string | null;
  employee_public_id?: string | null;
  project_name?: string | null;
  project_public_id?: string | null;
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
  notes: string | null;
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
  aliases: string | null;
}

export interface User {
  id: number;
  public_id: string;
  row_version: string;
  created_datetime: string | null;
  modified_datetime: string | null;
  firstname: string;
  lastname: string | null;
  /** Worker linkage — at most one is non-null. NULL = User is not a billable worker. */
  employee_id: number | null;
  vendor_id: number | null;
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

export interface UserOrganization {
  id: number;
  public_id: string;
  row_version: string;
  created_datetime: string | null;
  modified_datetime: string | null;
  user_id: number;
  organization_id: number;
}

export interface UserCompany {
  id: number;
  public_id: string;
  row_version: string;
  created_datetime: string | null;
  modified_datetime: string | null;
  user_id: number;
  company_id: number;
}

export interface OrganizationCompany {
  id: number;
  public_id: string;
  row_version: string;
  created_datetime: string | null;
  modified_datetime: string | null;
  organization_id: number;
  company_id: number;
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

/** Review — audit trail of state transitions on transactional documents */

export type ReviewParentType = "bill" | "expense" | "bill_credit" | "invoice" | "contract_labor";

export interface Review {
  id: number;
  public_id: string;
  row_version: string;
  created_datetime: string | null;
  modified_datetime: string | null;
  review_status_id: number;
  user_id: number;
  comments: string | null;
  bill_id: number | null;
  expense_id: number | null;
  bill_credit_id: number | null;
  invoice_id: number | null;
  // Denormalized JOINs (vw_Review)
  status_name: string;
  status_sort_order: number;
  status_is_final: boolean;
  status_is_declined: boolean;
  status_color: string | null;
  user_firstname: string | null;
  user_lastname: string | null;
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
  intake_source: string | null;         // "manual" | "agent" | "script"
  intake_source_detail: string | null;  // username / agent name / script name
  // Latest Review state — only on /get/bills list response (Wave 3 Phase D);
  // null when no Review row exists for the bill yet.
  review_status?: string | null;
  review_status_is_final?: boolean | null;
  review_status_is_declined?: boolean | null;
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
  // Additive: populated when an expense was created from a receipt email
  // (receipt-intake pipeline); null for manual / QBO-pulled expenses.
  source_email_message_id?: number | null;
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

export interface ContractLaborLineItem {
  id: number;
  public_id: string;
  row_version: string;
  created_datetime: string | null;
  modified_datetime: string | null;
  contract_labor_id: number;
  bill_line_item_id: number | null;
  line_date: string | null;
  project_id: number | null;
  sub_cost_code_id: number | null;
  description: string | null;
  hours: string | null;
  rate: string | null;
  markup: string | null;
  price: string | null;
  is_billable: boolean;
  is_overhead: boolean;
}

export interface ContractLaborDailySummary {
  total_imported_hours: number;
  entry_count: number;
  allocated_other_entries: number;
  allocated_this_entry: number;
  remaining_to_allocate: number;
}

export interface ContractLaborVendorConfig {
  [vendorName: string]: {
    address: string | null;
    city_state_zip: string | null;
    rate: string | null;
    markup: string | null;
  };
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
  job_name: string | null;
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
  bill_vendor_id: number | null;
  bill_date: string | null;
  due_date: string | null;
  bill_number: string | null;
  import_batch_id: string | null;
  source_file: string | null;
  source_row: number | null;
  /** Phase 5 lineage — non-null when the row was aggregated from a TimeEntry
   *  (rather than imported from Excel). React UI uses this to surface a
   *  "From TimeTracking" vs "From Excel" badge when the backend exposes it.
   *  Optional in the type so the badge gracefully hides if the API hasn't
   *  added the field to its response yet. */
  source_time_entry_id?: number | null;
  /** Public_id of the source TimeEntry — set by Phase 5b's LEFT JOIN in
   *  ReadContractLaborByPublicId. Lets the Edit page fetch the source
   *  TimeEntry's TimeLogs for the "Time Log Details" section. */
  source_time_entry_public_id?: string | null;
  /** Distinct ProjectIds across all child line items. Populated by the
   *  by-status list sproc so /labor/list search can match multi-project
   *  CLs where the parent project_id is NULL (Migration 009). Empty on
   *  single-fetch endpoints. */
  line_item_project_ids?: number[];
  /** Distinct SubCostCodeIds across all child line items — same reason. */
  line_item_sub_cost_code_ids?: number[];
}

/** Downstream lineage for a TimeEntry — what labor row was created and
 *  whether it's been billed/invoiced. Returned by GET
 *  /api/v1/time-entries/{public_id}/billed-lineage. */
export interface TimeEntryBilledLineageRow {
  target_table: "ContractLabor" | "EmployeeLabor";
  target_id: number;
  target_public_id: string;
  labor_status: string;
  work_date: string;
  worker_id: number;
  worker_name: string | null;
  total_amount: string | null;
  /** Non-null when the labor row has been Billed (vendor path) or Invoiced (employee path). */
  linked_target_table: "Bill" | "Invoice" | null;
  linked_target_id: number | null;
  linked_target_public_id: string | null;
  linked_target_number: string | null;
}

/** Email-message types — polled invoice inbox + agent classification */

export interface EmailAttachment {
  id: number;
  public_id: string;
  email_message_id: number;
  filename: string | null;
  content_type: string | null;
  size_bytes: number | null;
  blob_url: string | null;
  extraction_status: string | null;
  extraction_error: string | null;
  extracted_at: string | null;
  // Typed Di* fields the agent fills in via record_extracted_fields
  di_vendor_name: string | null;
  di_invoice_number: string | null;
  di_total_amount: string | null;
  di_invoice_date: string | null;
  di_due_date: string | null;
  bridged_attachment_id: number | null;
  bridged_attachment_public_id: string | null;
}

export interface LinkedBill {
  id: number;
  public_id: string;
  bill_number: string | null;
  total_amount: number | null;
  is_draft: boolean;
  created_datetime: string | null;
  vendor_name: string | null;
}

export interface EmailMessage {
  id: number;
  public_id: string;
  graph_message_id: string | null;
  internet_message_id: string | null;
  conversation_id: string | null;
  mailbox_address: string | null;
  from_address: string | null;
  from_name: string | null;
  to_recipients: string | null;
  cc_recipients: string | null;
  subject: string | null;
  body_preview: string | null;
  body_content: string | null;
  body_content_type: string | null;
  received_datetime: string | null;
  created_datetime: string | null;
  modified_datetime: string | null;
  has_attachments: boolean;
  web_link: string | null;
  processing_status: string;
  agent_session_id: number | null;
  agent_classification: string | null;
  agent_classification_reason: string | null;
  agent_decided_action: string | null;
  agent_classification_confidence: string | null;
  // Detail-only fields (not on list rows)
  attachments?: EmailAttachment[];
  linked_bill?: LinkedBill | null;
}

/** Time Tracking — entries from iOS clock-in/out + status workflow */

export type TimeEntryStatusValue =
  | "draft"
  | "submitted"
  | "approved"
  | "rejected"
  | "billed";

export interface TimeLog {
  id: number;
  public_id: string;
  row_version: string;
  created_datetime: string | null;
  modified_datetime: string | null;
  time_entry_id: number;
  clock_in: string | null;
  clock_out: string | null;
  log_type: string | null; // 'work' | 'break'
  duration: string | null; // decimal hours, server-computed
  latitude: string | null;
  longitude: string | null;
  project_id: number | null;
  note: string | null;
}

export interface TimeEntryStatus {
  id: number;
  public_id: string;
  row_version: string;
  created_datetime: string | null;
  time_entry_id: number;
  status: TimeEntryStatusValue;
  user_id: number | null;
  note: string | null;
}

export interface TimeEntry {
  id: number;
  public_id: string;
  row_version: string;
  created_datetime: string | null;
  modified_datetime: string | null;
  user_id: number | null;
  work_date: string | null;
  note: string | null;
  // Injected by the API on list + detail responses
  current_status?: TimeEntryStatusValue | null;
  // Distinct non-NULL ProjectIds across this entry's TimeLogs — populated
  // on the LIST response only (powers the React list-page Project column).
  // Empty list when all logs are break-type or unassigned.
  distinct_project_ids?: number[];
  // Present on detail response only
  time_logs?: TimeLog[];
  status_history?: TimeEntryStatus[];
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

/* ============================================================
 * Budget entity (Phase 3) — customer-facing contract value per
 * project, original schedule of values + change-order deltas, with a
 * variance engine (budget vs actual cost vs drawn). All DECIMAL fields
 * are transported as strings; the server computes every money figure
 * (the client never does currency arithmetic for stored values).
 * ============================================================ */

/** A row from GET /api/v1/get/budgets — Budget header + server rollups. */
export interface BudgetListRow {
  id?: number;
  public_id: string;
  row_version: string;
  created_datetime?: string;
  modified_datetime?: string | null;
  project_id: number | null;
  status: string; // draft | active | archived
  notes: string | null;
  project_name: string | null;
  project_public_id: string | null;
  // Rollups (server-computed, DECIMAL as string).
  contract_value: string;
  drawn_price: string;
  remaining_to_draw: string;
}

export interface Budget {
  id?: number;
  public_id: string;
  row_version: string;
  created_datetime?: string;
  modified_datetime?: string | null;
  project_id: number | null;
  status: string; // draft | active | archived
  notes: string | null;
  project_name: string | null;
  project_public_id: string | null;
}

/** Create response also carries the auto-created Rev 0. */
export interface BudgetCreateResult extends Budget {
  original_revision: BudgetRevision;
}

export interface BudgetRevision {
  id?: number;
  public_id: string;
  row_version: string;
  created_datetime?: string;
  modified_datetime?: string | null;
  budget_id: number;
  revision_number: number;
  type: string; // original | change_order
  status: string; // draft | approved
  title: string | null;
  description: string | null;
  approved_by_user_id: number | null;
  approved_datetime: string | null;
  effective_date: string | null;
  // Join-enriched (read sprocs).
  budget_public_id?: string;
  project_id?: number;
  budget_status?: string;
}

export interface BudgetLineItem {
  id?: number;
  public_id: string;
  row_version: string;
  created_datetime?: string;
  modified_datetime?: string | null;
  budget_revision_id: number;
  sub_cost_code_id: number | null;
  description: string | null;
  quantity: string | null;
  rate: string | null;
  amount: string | null;
  markup: string | null;
  price: string | null;
  // Join-enriched (read sprocs only).
  revision_status?: string;
  revision_type?: string;
  budget_id?: number;
  project_id?: number;
}

/** The money legs shared by variance rows, cost-code subtotals, and totals. */
export interface BudgetVarianceMoney {
  budget_amount: string;
  budget_price: string;
  bill_cost: string;
  expense_cost: string;
  bill_credit_cost: string;
  contract_labor_cost: string;
  employee_labor_cost: string;
  actual_cost: string;
  drawn_price: string;
  remaining_to_draw: string;
  cost_variance: string;
  unpriced_labor_hours: string;
}

export interface BudgetVarianceRow extends BudgetVarianceMoney {
  sub_cost_code_id: number | null;
  sub_cost_code_number: string | null;
  sub_cost_code_name: string | null;
  cost_code_id: number | null;
  cost_code_number: string | null;
  cost_code_name: string | null;
}

export interface BudgetVarianceCostCode extends BudgetVarianceMoney {
  cost_code_id: number | null;
  cost_code_number: string | null;
  cost_code_name: string | null;
  uncategorized: boolean;
}

export interface BudgetVariancePayload {
  budget: Budget;
  rows: BudgetVarianceRow[];
  cost_codes: BudgetVarianceCostCode[];
  totals: BudgetVarianceMoney;
}

/** Expense coding queue row — GET /api/v1/expense-coding/queue (U-005) */
export interface ExpenseCodingQueueRow {
  qbo_purchase_public_id: string | null;
  qbo_purchase_qbo_id: string | null;
  sync_token: string | null;
  realm_id: string | null;
  vendor_qbo_id: string | null;
  vendor_name: string | null;
  credit: boolean | null;
  total_amt: string | number | null;
  txn_date: string | null;
  doc_number: string | null;
  private_note: string | null;
  qbo_purchase_line_id: number;
  qbo_line_id: string | null;
  line_num: number | null;
  line_amount: string | number | null;
  line_description: string | null;
  coding_item_public_id: string | null;
  coding_status: string | null;
  suggested_project_id: number | null;
  suggested_sub_cost_code_id: number | null;
  suggested_description: string | null;
  suggestion_source: string | null;
  suggestion_reason: string | null;
  suggestion_confidence: number | null;
  confirmed_project_id: number | null;
  confirmed_sub_cost_code_id: number | null;
  confirmed_description: string | null;
  flag_reason: string | null;
  vendor_id: number | null;
  claimed_by_user_id: number | null;
  claimed_at: string | null;
}

/** Expense coding metrics — GET /api/v1/expense-coding/metrics (U-005) */
export interface ExpenseCodingMetrics {
  total_target_lines: number;
  pending_count: number;
  suggested_count: number;
  flagged_count: number;
  confirmed_count: number;
  enqueued_count: number;
  written_count: number;
  changed_in_qbo_count: number;
  error_count: number;
  accepted_count: number;
  overridden_count: number;
}

/** POST /api/v1/expense-coding/suggest response counts */
export interface ExpenseCodingSuggestResult {
  processed: number;
  suggested: number;
  flagged: number;
  remaining: number;
}
