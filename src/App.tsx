import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "./auth/AuthContext";
import { ToastProvider } from "./components/Toast";
import ProtectedRoute from "./auth/ProtectedRoute";
import LoginPage from "./auth/LoginPage";
import SignupPage from "./auth/SignupPage";
import AppLayout from "./layout/AppLayout";
import Dashboard from "./pages/Dashboard";

// Vendor
import VendorList from "./pages/vendors/VendorList";
import VendorView from "./pages/vendors/VendorView";
import VendorEdit from "./pages/vendors/VendorEdit";
import VendorCreate from "./pages/vendors/VendorCreate";

// Vendor Type
import VendorTypeList from "./pages/vendor-types/VendorTypeList";
import VendorTypeView from "./pages/vendor-types/VendorTypeView";
import VendorTypeEdit from "./pages/vendor-types/VendorTypeEdit";
import VendorTypeCreate from "./pages/vendor-types/VendorTypeCreate";

// Role
import RoleList from "./pages/roles/RoleList";
import RoleView from "./pages/roles/RoleView";
import RoleEdit from "./pages/roles/RoleEdit";
import RoleCreate from "./pages/roles/RoleCreate";

// Module
import ModuleList from "./pages/modules/ModuleList";
import ModuleView from "./pages/modules/ModuleView";
import ModuleEdit from "./pages/modules/ModuleEdit";
import ModuleCreate from "./pages/modules/ModuleCreate";

// Address
import AddressList from "./pages/addresses/AddressList";
import AddressView from "./pages/addresses/AddressView";
import AddressEdit from "./pages/addresses/AddressEdit";
import AddressCreate from "./pages/addresses/AddressCreate";

// Address Type
import AddressTypeList from "./pages/address-types/AddressTypeList";
import AddressTypeView from "./pages/address-types/AddressTypeView";
import AddressTypeEdit from "./pages/address-types/AddressTypeEdit";
import AddressTypeCreate from "./pages/address-types/AddressTypeCreate";

// Payment Term
import PaymentTermList from "./pages/payment-terms/PaymentTermList";
import PaymentTermView from "./pages/payment-terms/PaymentTermView";
import PaymentTermEdit from "./pages/payment-terms/PaymentTermEdit";
import PaymentTermCreate from "./pages/payment-terms/PaymentTermCreate";

// Customer
import CustomerList from "./pages/customers/CustomerList";
import CustomerView from "./pages/customers/CustomerView";
import CustomerEdit from "./pages/customers/CustomerEdit";
import CustomerCreate from "./pages/customers/CustomerCreate";

// Company
import CompanyList from "./pages/companies/CompanyList";
import CompanyView from "./pages/companies/CompanyView";
import CompanyEdit from "./pages/companies/CompanyEdit";
import CompanyCreate from "./pages/companies/CompanyCreate";

// Organization
import OrganizationList from "./pages/organizations/OrganizationList";
import OrganizationView from "./pages/organizations/OrganizationView";
import OrganizationEdit from "./pages/organizations/OrganizationEdit";
import OrganizationCreate from "./pages/organizations/OrganizationCreate";

// Project
import ProjectList from "./pages/projects/ProjectList";
import ProjectView from "./pages/projects/ProjectView";
import ProjectEdit from "./pages/projects/ProjectEdit";
import ProjectCreate from "./pages/projects/ProjectCreate";

// Cost Code
import CostCodeList from "./pages/cost-codes/CostCodeList";
import CostCodeView from "./pages/cost-codes/CostCodeView";
import CostCodeEdit from "./pages/cost-codes/CostCodeEdit";
import CostCodeCreate from "./pages/cost-codes/CostCodeCreate";

// Sub Cost Code
import SubCostCodeList from "./pages/sub-cost-codes/SubCostCodeList";
import SubCostCodeView from "./pages/sub-cost-codes/SubCostCodeView";
import SubCostCodeEdit from "./pages/sub-cost-codes/SubCostCodeEdit";
import SubCostCodeCreate from "./pages/sub-cost-codes/SubCostCodeCreate";

// User
import UserList from "./pages/users/UserList";
import UserView from "./pages/users/UserView";
import UserEdit from "./pages/users/UserEdit";
import UserCreate from "./pages/users/UserCreate";

// Review Status
import ReviewStatusList from "./pages/review-statuses/ReviewStatusList";
import ReviewStatusView from "./pages/review-statuses/ReviewStatusView";
import ReviewStatusEdit from "./pages/review-statuses/ReviewStatusEdit";
import ReviewStatusCreate from "./pages/review-statuses/ReviewStatusCreate";

// Classification Override
import ClassificationOverrideList from "./pages/classification-overrides/ClassificationOverrideList";
import ClassificationOverrideView from "./pages/classification-overrides/ClassificationOverrideView";
import ClassificationOverrideEdit from "./pages/classification-overrides/ClassificationOverrideEdit";
import ClassificationOverrideCreate from "./pages/classification-overrides/ClassificationOverrideCreate";

// Taxpayer
import TaxpayerList from "./pages/taxpayers/TaxpayerList";
import TaxpayerView from "./pages/taxpayers/TaxpayerView";
import TaxpayerEdit from "./pages/taxpayers/TaxpayerEdit";
import TaxpayerCreate from "./pages/taxpayers/TaxpayerCreate";

// Integration
import IntegrationList from "./pages/integrations/IntegrationList";
import IntegrationView from "./pages/integrations/IntegrationView";
import IntegrationEdit from "./pages/integrations/IntegrationEdit";
import IntegrationCreate from "./pages/integrations/IntegrationCreate";

// User Role
import UserRoleList from "./pages/user-roles/UserRoleList";
import UserRoleView from "./pages/user-roles/UserRoleView";
import UserRoleEdit from "./pages/user-roles/UserRoleEdit";
import UserRoleCreate from "./pages/user-roles/UserRoleCreate";

// User Module
import UserModuleList from "./pages/user-modules/UserModuleList";
import UserModuleView from "./pages/user-modules/UserModuleView";
import UserModuleEdit from "./pages/user-modules/UserModuleEdit";
import UserModuleCreate from "./pages/user-modules/UserModuleCreate";

// User Project
import UserProjectList from "./pages/user-projects/UserProjectList";
import UserProjectView from "./pages/user-projects/UserProjectView";
import UserProjectEdit from "./pages/user-projects/UserProjectEdit";
import UserProjectCreate from "./pages/user-projects/UserProjectCreate";

// Role Module
import RoleModuleList from "./pages/role-modules/RoleModuleList";
import RoleModuleView from "./pages/role-modules/RoleModuleView";
import RoleModuleEdit from "./pages/role-modules/RoleModuleEdit";
import RoleModuleCreate from "./pages/role-modules/RoleModuleCreate";

// Vendor Address
import VendorAddressList from "./pages/vendor-addresses/VendorAddressList";
import VendorAddressView from "./pages/vendor-addresses/VendorAddressView";
import VendorAddressEdit from "./pages/vendor-addresses/VendorAddressEdit";
import VendorAddressCreate from "./pages/vendor-addresses/VendorAddressCreate";

// Project Address
import ProjectAddressList from "./pages/project-addresses/ProjectAddressList";
import ProjectAddressView from "./pages/project-addresses/ProjectAddressView";
import ProjectAddressEdit from "./pages/project-addresses/ProjectAddressEdit";
import ProjectAddressCreate from "./pages/project-addresses/ProjectAddressCreate";

// Bill
import BillList from "./pages/bills/BillList";
import BillView from "./pages/bills/BillView";
import BillEdit from "./pages/bills/BillEdit";
import BillCreate from "./pages/bills/BillCreate";

// Expense
import ExpenseList from "./pages/expenses/ExpenseList";
import ExpenseView from "./pages/expenses/ExpenseView";
import ExpenseEdit from "./pages/expenses/ExpenseEdit";
import ExpenseCreate from "./pages/expenses/ExpenseCreate";

// Bill Credit
import BillCreditList from "./pages/bill-credits/BillCreditList";
import BillCreditView from "./pages/bill-credits/BillCreditView";
import BillCreditEdit from "./pages/bill-credits/BillCreditEdit";
import BillCreditCreate from "./pages/bill-credits/BillCreditCreate";

// Invoice
import InvoiceList from "./pages/invoices/InvoiceList";
import InvoiceView from "./pages/invoices/InvoiceView";
import InvoiceEdit from "./pages/invoices/InvoiceEdit";
import InvoiceCreate from "./pages/invoices/InvoiceCreate";

// Contract Labor
import ContractLaborList from "./pages/contract-labor/ContractLaborList";
import ContractLaborView from "./pages/contract-labor/ContractLaborView";
import ContractLaborEdit from "./pages/contract-labor/ContractLaborEdit";
import ContractLaborCreate from "./pages/contract-labor/ContractLaborCreate";

// Legal
import EulaPage from "./pages/legal/EulaPage";
import PrivacyPage from "./pages/legal/PrivacyPage";

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <ToastProvider>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/signup" element={<SignupPage />} />

          <Route element={<ProtectedRoute />}>
            <Route element={<AppLayout />}>
              <Route path="/" element={<Dashboard />} />

              {/* Vendor */}
              <Route path="/vendor/list" element={<VendorList />} />
              <Route path="/vendor/create" element={<VendorCreate />} />
              <Route path="/vendor/:id" element={<VendorView />} />
              <Route path="/vendor/:id/edit" element={<VendorEdit />} />

              {/* Vendor Type */}
              <Route path="/vendor-type/list" element={<VendorTypeList />} />
              <Route path="/vendor-type/create" element={<VendorTypeCreate />} />
              <Route path="/vendor-type/:id" element={<VendorTypeView />} />
              <Route path="/vendor-type/:id/edit" element={<VendorTypeEdit />} />

              {/* Role */}
              <Route path="/role/list" element={<RoleList />} />
              <Route path="/role/create" element={<RoleCreate />} />
              <Route path="/role/:id" element={<RoleView />} />
              <Route path="/role/:id/edit" element={<RoleEdit />} />

              {/* Module */}
              <Route path="/module/list" element={<ModuleList />} />
              <Route path="/module/create" element={<ModuleCreate />} />
              <Route path="/module/:id" element={<ModuleView />} />
              <Route path="/module/:id/edit" element={<ModuleEdit />} />

              {/* Address */}
              <Route path="/address/list" element={<AddressList />} />
              <Route path="/address/create" element={<AddressCreate />} />
              <Route path="/address/:id" element={<AddressView />} />
              <Route path="/address/:id/edit" element={<AddressEdit />} />

              {/* Address Type */}
              <Route path="/address-type/list" element={<AddressTypeList />} />
              <Route path="/address-type/create" element={<AddressTypeCreate />} />
              <Route path="/address-type/:id" element={<AddressTypeView />} />
              <Route path="/address-type/:id/edit" element={<AddressTypeEdit />} />

              {/* Payment Term */}
              <Route path="/payment-term/list" element={<PaymentTermList />} />
              <Route path="/payment-term/create" element={<PaymentTermCreate />} />
              <Route path="/payment-term/:id" element={<PaymentTermView />} />
              <Route path="/payment-term/:id/edit" element={<PaymentTermEdit />} />

              {/* Customer */}
              <Route path="/customer/list" element={<CustomerList />} />
              <Route path="/customer/create" element={<CustomerCreate />} />
              <Route path="/customer/:id" element={<CustomerView />} />
              <Route path="/customer/:id/edit" element={<CustomerEdit />} />

              {/* Company */}
              <Route path="/company/list" element={<CompanyList />} />
              <Route path="/company/create" element={<CompanyCreate />} />
              <Route path="/company/:id" element={<CompanyView />} />
              <Route path="/company/:id/edit" element={<CompanyEdit />} />

              {/* Organization */}
              <Route path="/organization/list" element={<OrganizationList />} />
              <Route path="/organization/create" element={<OrganizationCreate />} />
              <Route path="/organization/:id" element={<OrganizationView />} />
              <Route path="/organization/:id/edit" element={<OrganizationEdit />} />

              {/* Project */}
              <Route path="/project/list" element={<ProjectList />} />
              <Route path="/project/create" element={<ProjectCreate />} />
              <Route path="/project/:id" element={<ProjectView />} />
              <Route path="/project/:id/edit" element={<ProjectEdit />} />

              {/* Cost Code */}
              <Route path="/cost-code/list" element={<CostCodeList />} />
              <Route path="/cost-code/create" element={<CostCodeCreate />} />
              <Route path="/cost-code/:id" element={<CostCodeView />} />
              <Route path="/cost-code/:id/edit" element={<CostCodeEdit />} />

              {/* Sub Cost Code */}
              <Route path="/sub-cost-code/list" element={<SubCostCodeList />} />
              <Route path="/sub-cost-code/create" element={<SubCostCodeCreate />} />
              <Route path="/sub-cost-code/:id" element={<SubCostCodeView />} />
              <Route path="/sub-cost-code/:id/edit" element={<SubCostCodeEdit />} />

              {/* User */}
              <Route path="/user/list" element={<UserList />} />
              <Route path="/user/create" element={<UserCreate />} />
              <Route path="/user/:id" element={<UserView />} />
              <Route path="/user/:id/edit" element={<UserEdit />} />

              {/* Review Status */}
              <Route path="/review-status/list" element={<ReviewStatusList />} />
              <Route path="/review-status/create" element={<ReviewStatusCreate />} />
              <Route path="/review-status/:id" element={<ReviewStatusView />} />
              <Route path="/review-status/:id/edit" element={<ReviewStatusEdit />} />

              {/* Classification Override */}
              <Route path="/classification-override/list" element={<ClassificationOverrideList />} />
              <Route path="/classification-override/create" element={<ClassificationOverrideCreate />} />
              <Route path="/classification-override/:id" element={<ClassificationOverrideView />} />
              <Route path="/classification-override/:id/edit" element={<ClassificationOverrideEdit />} />

              {/* Taxpayer */}
              <Route path="/taxpayer/list" element={<TaxpayerList />} />
              <Route path="/taxpayer/create" element={<TaxpayerCreate />} />
              <Route path="/taxpayer/:id" element={<TaxpayerView />} />
              <Route path="/taxpayer/:id/edit" element={<TaxpayerEdit />} />

              {/* Integration */}
              <Route path="/integration/list" element={<IntegrationList />} />
              <Route path="/integration/create" element={<IntegrationCreate />} />
              <Route path="/integration/:id" element={<IntegrationView />} />
              <Route path="/integration/:id/edit" element={<IntegrationEdit />} />

              {/* User Role */}
              <Route path="/user-role/list" element={<UserRoleList />} />
              <Route path="/user-role/create" element={<UserRoleCreate />} />
              <Route path="/user-role/:id" element={<UserRoleView />} />
              <Route path="/user-role/:id/edit" element={<UserRoleEdit />} />

              {/* User Module */}
              <Route path="/user-module/list" element={<UserModuleList />} />
              <Route path="/user-module/create" element={<UserModuleCreate />} />
              <Route path="/user-module/:id" element={<UserModuleView />} />
              <Route path="/user-module/:id/edit" element={<UserModuleEdit />} />

              {/* User Project */}
              <Route path="/user-project/list" element={<UserProjectList />} />
              <Route path="/user-project/create" element={<UserProjectCreate />} />
              <Route path="/user-project/:id" element={<UserProjectView />} />
              <Route path="/user-project/:id/edit" element={<UserProjectEdit />} />

              {/* Role Module */}
              <Route path="/role-module/list" element={<RoleModuleList />} />
              <Route path="/role-module/create" element={<RoleModuleCreate />} />
              <Route path="/role-module/:id" element={<RoleModuleView />} />
              <Route path="/role-module/:id/edit" element={<RoleModuleEdit />} />

              {/* Vendor Address */}
              <Route path="/vendor-address/list" element={<VendorAddressList />} />
              <Route path="/vendor-address/create" element={<VendorAddressCreate />} />
              <Route path="/vendor-address/:id" element={<VendorAddressView />} />
              <Route path="/vendor-address/:id/edit" element={<VendorAddressEdit />} />

              {/* Project Address */}
              <Route path="/project-address/list" element={<ProjectAddressList />} />
              <Route path="/project-address/create" element={<ProjectAddressCreate />} />
              <Route path="/project-address/:id" element={<ProjectAddressView />} />
              <Route path="/project-address/:id/edit" element={<ProjectAddressEdit />} />

              {/* Bill */}
              <Route path="/bill/list" element={<BillList />} />
              <Route path="/bill/create" element={<BillCreate />} />
              <Route path="/bill/:id" element={<BillView />} />
              <Route path="/bill/:id/edit" element={<BillEdit />} />

              {/* Expense */}
              <Route path="/expense/list" element={<ExpenseList />} />
              <Route path="/expense/create" element={<ExpenseCreate />} />
              <Route path="/expense/:id" element={<ExpenseView />} />
              <Route path="/expense/:id/edit" element={<ExpenseEdit />} />

              {/* Bill Credit */}
              <Route path="/bill-credit/list" element={<BillCreditList />} />
              <Route path="/bill-credit/create" element={<BillCreditCreate />} />
              <Route path="/bill-credit/:id" element={<BillCreditView />} />
              <Route path="/bill-credit/:id/edit" element={<BillCreditEdit />} />

              {/* Invoice */}
              <Route path="/invoice/list" element={<InvoiceList />} />
              <Route path="/invoice/create" element={<InvoiceCreate />} />
              <Route path="/invoice/:id" element={<InvoiceView />} />
              <Route path="/invoice/:id/edit" element={<InvoiceEdit />} />

              {/* Contract Labor */}
              <Route path="/contract-labor/list" element={<ContractLaborList />} />
              <Route path="/contract-labor/create" element={<ContractLaborCreate />} />
              <Route path="/contract-labor/:id" element={<ContractLaborView />} />
              <Route path="/contract-labor/:id/edit" element={<ContractLaborEdit />} />

              {/* Legal */}
              <Route path="/legal/eula" element={<EulaPage />} />
              <Route path="/legal/privacy" element={<PrivacyPage />} />
            </Route>
          </Route>
        </Routes>
        </ToastProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}
