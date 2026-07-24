/**
 * The app's route tree as data. Exported so it has exactly one definition —
 * App renders it, and tests assert against it via createRoutesFromElements /
 * matchRoutes. Deliberately imports no shell/provider components so consumers
 * need no mocks.
 */
import { lazy, Suspense } from "react";
import { Route, Navigate } from "react-router-dom";
import ProtectedRoute from "./auth/ProtectedRoute";
import LoginPage from "./auth/LoginPage";
import AppLayout from "./layout/AppLayout";
import LandingRedirect from "./layout/LandingRedirect";

import ProfileView from "./pages/profile/ProfileView";
import UserDetailScreen from "./pages/profile/UserDetailScreen";
import TextFieldEditScreen from "./pages/profile/TextFieldEditScreen";
import SecurityScreen from "./pages/profile/SecurityScreen";
import AppearanceScreen from "./pages/profile/AppearanceScreen";

import LaborList from "./pages/labor/LaborList";
import LaborReviewScreen from "./pages/labor/LaborReviewScreen";
import ProjectList from "./pages/project/ProjectList";
import ProjectDetailScreen from "./pages/project/ProjectDetailScreen";
import PastDayScreen from "./pages/time-entry/PastDayScreen";
import EditEntryScreen from "./pages/time-entry/EditEntryScreen";
import CreateLogScreen from "./pages/time-entry/CreateLogScreen";
import TimeEntryListRoute from "./pages/time-entry/TimeEntryListRoute";
import TimeEntryView from "./pages/time-entry/TimeEntryView";
import TimeEntryCreate from "./pages/time-entry/TimeEntryCreate";

// Admin-only docs surface is code-split: it pulls in react-markdown + the
// vendored iOS snapshot, which no other shipped route needs. Keeping it out of
// the main bundle spares field workers (the majority, who can't open it) the weight.
const DocsPage = lazy(() => import("./pages/docs/DocsPage"));

// Budget surface (Phase 3) — renders inside the responsive AppLayout,
// office/PM audience (gated on the Budgets module).
import BudgetList from "./pages/budgets/BudgetList";
import BudgetCreate from "./pages/budgets/BudgetCreate";
import BudgetView from "./pages/budgets/BudgetView";
import BudgetEdit from "./pages/budgets/BudgetEdit";

// Bill surface (Phase 3) — renders inside the responsive AppLayout,
// office/AP audience (gated on the Bills module), like Budget in U-066.
import BillList from "./pages/bills/BillList";
import BillCreate from "./pages/bills/BillCreate";
import BillView from "./pages/bills/BillView";
import BillEdit from "./pages/bills/BillEdit";

// Expense surface (Phase 3) — renders inside the responsive AppLayout,
// office/AP audience (gated on the Expenses module), like Bill in U-066.
import ExpenseList from "./pages/expenses/ExpenseList";
import ExpenseCreate from "./pages/expenses/ExpenseCreate";
import ExpenseView from "./pages/expenses/ExpenseView";
import ExpenseEdit from "./pages/expenses/ExpenseEdit";

// Bill Credit surface (Phase 3) — renders inside the responsive AppLayout,
// office/AP audience (gated on the Bill Credits module), like Expense in U-124.
import BillCreditList from "./pages/bill-credits/BillCreditList";
import BillCreditCreate from "./pages/bill-credits/BillCreditCreate";
import BillCreditView from "./pages/bill-credits/BillCreditView";
import BillCreditEdit from "./pages/bill-credits/BillCreditEdit";

// Invoice surface (Phase 3) — browse-only: renders inside the responsive AppLayout,
// office/AR audience (gated on the Invoices module). Invoices are QBO-first (created
// in QBO, pulled local); Create/Edit deliberately unrouted + tsconfig-parked (U-128).
import InvoiceList from "./pages/invoices/InvoiceList";
import InvoiceView from "./pages/invoices/InvoiceView";

// Contract Labor management surface — browse + edit only (U-134).
// Bills / Import / Create deliberately unrouted + tsconfig-parked: generate-bills
// cannibalizes already-billed records on re-run (api bill_service edit path, no server guard).
import ContractLaborList from "./pages/contract-labor/ContractLaborList";
import ContractLaborView from "./pages/contract-labor/ContractLaborView";
import ContractLaborEdit from "./pages/contract-labor/ContractLaborEdit";

// Employee Labor management surface — browse + edit only (U-136).
// Create deliberately unrouted + tsconfig-parked: manual-row billing footgun; EL rows are
// auto-aggregated from TimeEntry submit.
import EmployeeLaborList from "./pages/employee-labor/EmployeeLaborList";
import EmployeeLaborView from "./pages/employee-labor/EmployeeLaborView";
import EmployeeLaborEdit from "./pages/employee-labor/EmployeeLaborEdit";

import ExpenseCodingCockpit from "./pages/expense-coding/ExpenseCodingCockpit";
import VendorComplianceDashboard from "./pages/vendor-compliance/VendorComplianceDashboard";
import RequiredCoverageEditor from "./pages/vendor-compliance/RequiredCoverageEditor";
import VendorList from "./pages/vendors/VendorList";
import VendorView from "./pages/vendors/VendorView";
import VendorEdit from "./pages/vendors/VendorEdit";
import VendorCreate from "./pages/vendors/VendorCreate";
// Vendor Type surface — vendor reference data (drives the vendor-compliance
// required-coverage config), office audience, gated on the Vendors module (U-130).
import VendorTypeList from "./pages/vendor-types/VendorTypeList";
import VendorTypeView from "./pages/vendor-types/VendorTypeView";
import VendorTypeEdit from "./pages/vendor-types/VendorTypeEdit";
import VendorTypeCreate from "./pages/vendor-types/VendorTypeCreate";
import CostCodeList from "./pages/cost-codes/CostCodeList";
import CostCodeView from "./pages/cost-codes/CostCodeView";
import CostCodeEdit from "./pages/cost-codes/CostCodeEdit";
import CostCodeCreate from "./pages/cost-codes/CostCodeCreate";
import CustomerList from "./pages/customers/CustomerList";
import CustomerView from "./pages/customers/CustomerView";
import CustomerEdit from "./pages/customers/CustomerEdit";
import CustomerCreate from "./pages/customers/CustomerCreate";

// Parked for v0.1.0 — Option B trim (excluded via tsconfig.app.json,
// not bundled by Vite since unreachable from this route tree). Restore
// pages by re-adding their imports + routes here when ready.

const docsFallback = (
  <div className="ios-page">
    <div className="page-loading" style={{ padding: "var(--space-xl) 0" }}>
      Loading…
    </div>
  </div>
);

export const appRouteTree = (
  <>
    <Route path="/login" element={<LoginPage />} />

    <Route element={<ProtectedRoute />}>
      <Route element={<AppLayout />}>
        <Route path="/" element={<LandingRedirect />} />

        <Route path="/time-entry/list" element={<TimeEntryListRoute />} />
        <Route path="/time-entry/past/:date" element={<PastDayScreen />} />
        <Route path="/time-entry/create" element={<TimeEntryCreate />} />
        <Route path="/time-entry/log/new" element={<CreateLogScreen />} />
        <Route path="/time-entry/:entryPublicId/log/:logPublicId" element={<EditEntryScreen />} />
        <Route path="/time-entry/:id" element={<TimeEntryView />} />

        <Route path="/labor/list" element={<LaborList />} />
        <Route path="/labor/:public_id" element={<LaborReviewScreen />} />

        <Route path="/project/list" element={<ProjectList />} />
        <Route path="/project/:publicId" element={<ProjectDetailScreen />} />

        <Route path="/expense-coding" element={<ExpenseCodingCockpit />} />
        <Route path="/vendor-compliance" element={<VendorComplianceDashboard />} />
        <Route
          path="/vendor-compliance/required-coverages"
          element={<RequiredCoverageEditor />}
        />

        <Route path="/budget/list" element={<BudgetList />} />
        <Route path="/budget/create" element={<BudgetCreate />} />
        <Route path="/budget/:publicId" element={<BudgetView />} />
        <Route path="/budget/:publicId/edit" element={<BudgetEdit />} />
        <Route path="/budget/*" element={<Navigate to="/budget/list" replace />} />

        <Route path="/bill/list" element={<BillList />} />
        <Route path="/bill/create" element={<BillCreate />} />
        <Route path="/bill/:publicId" element={<BillView />} />
        <Route path="/bill/:publicId/edit" element={<BillEdit />} />
        <Route path="/bill/*" element={<Navigate to="/bill/list" replace />} />

        <Route path="/expense/list" element={<ExpenseList />} />
        <Route path="/expense/create" element={<ExpenseCreate />} />
        <Route path="/expense/:publicId" element={<ExpenseView />} />
        <Route path="/expense/:publicId/edit" element={<ExpenseEdit />} />
        <Route path="/expense/*" element={<Navigate to="/expense/list" replace />} />

        <Route path="/bill-credit/list" element={<BillCreditList />} />
        <Route path="/bill-credit/create" element={<BillCreditCreate />} />
        <Route path="/bill-credit/:publicId" element={<BillCreditView />} />
        <Route path="/bill-credit/:publicId/edit" element={<BillCreditEdit />} />
        <Route path="/bill-credit/*" element={<Navigate to="/bill-credit/list" replace />} />

        <Route path="/invoice/list" element={<InvoiceList />} />
        <Route path="/invoice/:publicId" element={<InvoiceView />} />
        <Route path="/invoice/*" element={<Navigate to="/invoice/list" replace />} />

        <Route path="/contract-labor/list" element={<ContractLaborList />} />
        {/* Parked-surface literals declared ahead of :publicId so stale links/
            bookmarks (e.g. the retired LaborList "Generate Bills" button)
            degrade to the list instead of a broken :publicId View. */}
        <Route path="/contract-labor/bills" element={<Navigate to="/contract-labor/list" replace />} />
        <Route path="/contract-labor/import" element={<Navigate to="/contract-labor/list" replace />} />
        <Route path="/contract-labor/create" element={<Navigate to="/contract-labor/list" replace />} />
        <Route path="/contract-labor/:publicId" element={<ContractLaborView />} />
        <Route path="/contract-labor/:publicId/edit" element={<ContractLaborEdit />} />
        <Route path="/contract-labor/*" element={<Navigate to="/contract-labor/list" replace />} />

        <Route path="/employee-labor/list" element={<EmployeeLaborList />} />
        {/* Parked-surface literals declared ahead of :publicId so stale links/bookmarks
            degrade to the list instead of a broken :publicId View. */}
        <Route path="/employee-labor/create" element={<Navigate to="/employee-labor/list" replace />} />
        <Route path="/employee-labor/:publicId" element={<EmployeeLaborView />} />
        <Route path="/employee-labor/:publicId/edit" element={<EmployeeLaborEdit />} />
        <Route path="/employee-labor/*" element={<Navigate to="/employee-labor/list" replace />} />

        <Route path="/vendor/list" element={<VendorList />} />
        <Route path="/vendor/create" element={<VendorCreate />} />
        <Route path="/vendor/:publicId" element={<VendorView />} />
        <Route path="/vendor/:publicId/edit" element={<VendorEdit />} />

        <Route path="/vendor-type/list" element={<VendorTypeList />} />
        <Route path="/vendor-type/create" element={<VendorTypeCreate />} />
        <Route path="/vendor-type/:publicId" element={<VendorTypeView />} />
        <Route path="/vendor-type/:publicId/edit" element={<VendorTypeEdit />} />
        <Route path="/vendor-type/*" element={<Navigate to="/vendor-type/list" replace />} />

        <Route path="/cost-code/list" element={<CostCodeList />} />
        <Route path="/cost-code/create" element={<CostCodeCreate />} />
        <Route path="/cost-code/:publicId" element={<CostCodeView />} />
        <Route path="/cost-code/:publicId/edit" element={<CostCodeEdit />} />
        <Route path="/cost-code/*" element={<Navigate to="/cost-code/list" replace />} />

        <Route path="/customer/list" element={<CustomerList />} />
        <Route path="/customer/create" element={<CustomerCreate />} />
        <Route path="/customer/:publicId" element={<CustomerView />} />
        <Route path="/customer/:publicId/edit" element={<CustomerEdit />} />

        <Route path="/profile" element={<ProfileView />} />
        <Route path="/profile/details" element={<UserDetailScreen />} />
        <Route path="/profile/details/:fieldKey" element={<TextFieldEditScreen />} />
        <Route path="/profile/security" element={<SecurityScreen />} />
        <Route path="/profile/appearance" element={<AppearanceScreen />} />

        <Route path="/user/:id" element={<Navigate to="/profile" replace />} />
        <Route path="/user/:id/edit" element={<Navigate to="/profile" replace />} />

        {/* Admin-only documentation surface (lazy-loaded). Page-level
            guard in DocsPage redirects non-admins; nav entry is
            requiresAdmin. */}
        <Route
          path="/docs"
          element={
            <Suspense fallback={docsFallback}>
              <DocsPage />
            </Suspense>
          }
        />
        <Route
          path="/docs/:section"
          element={
            <Suspense fallback={docsFallback}>
              <DocsPage />
            </Suspense>
          }
        />

        <Route path="*" element={<LandingRedirect />} />
      </Route>
    </Route>
  </>
);
