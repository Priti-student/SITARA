import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import type { ReactNode } from "react";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { AppShell } from "./components/AppShell";
import { ROUTE_ROLES, hasAnyRole, type Role } from "./rbac";
import { HomePage } from "./pages/HomePage";
import { LoginPage } from "./pages/LoginPage";
import { RegisterPage } from "./pages/RegisterPage";
import { DashboardPage } from "./pages/DashboardPage";
import { RulesPage } from "./pages/RulesPage";
import { CreateChecklistPage } from "./pages/CreateChecklistPage";
import { ChecklistsPage } from "./pages/ChecklistsPage";
import { ChecklistDetailPage } from "./pages/ChecklistDetailPage";
import { NotificationsPage } from "./pages/NotificationsPage";
import { ApplicationsPage } from "./pages/ApplicationsPage";
import { ApplicationDetailPage } from "./pages/ApplicationDetailPage";
import { DepartmentInboxPage } from "./pages/DepartmentInboxPage";
import { DepartmentApplicationPage } from "./pages/DepartmentApplicationPage";
import { InspectionsPage } from "./pages/InspectionsPage";
import { InspectionDetailPage } from "./pages/InspectionDetailPage";
import { RenewalsPage } from "./pages/RenewalsPage";
import { CompliancePage } from "./pages/CompliancePage";
import { SchemesPage } from "./pages/SchemesPage";
import { ClaimsPage } from "./pages/ClaimsPage";
import { AnalyticsPage } from "./pages/AnalyticsPage";
import { GrievancesPage } from "./pages/GrievancesPage";

function ProtectedRoute({ element }: { element: ReactNode }): ReactNode {
  const { user, loading } = useAuth();
  if (loading) {
    return <div className="app-loading">Loading NITI…</div>;
  }
  return user ? element : <Navigate to="/login" replace />;
}

/** Requires at least one of the given roles — the single role guard. */
function RoleRoute({ element, roles }: { element: ReactNode; roles: readonly Role[] }): ReactNode {
  const { user, loading } = useAuth();
  if (loading) {
    return <div className="app-loading">Loading NITI…</div>;
  }
  if (!user) return <Navigate to="/login" replace />;
  return hasAnyRole(user.roles, [...roles]) ? element : <Navigate to="/dashboard" replace />;
}

export function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />

          {/* Authenticated area — AppShell renders the role-aware topbar + sidebar. */}
          <Route element={<ProtectedRoute element={<AppShell />} />}>
            <Route path="/dashboard" element={<DashboardPage />} />
            <Route
              path="/rules"
              element={<RoleRoute element={<RulesPage />} roles={ROUTE_ROLES.rules} />}
            />
            <Route
              path="/checklists/new"
              element={<RoleRoute element={<CreateChecklistPage />} roles={ROUTE_ROLES.applicant} />}
            />
            <Route
              path="/checklists/:id"
              element={<RoleRoute element={<ChecklistDetailPage />} roles={ROUTE_ROLES.applicant} />}
            />
            <Route
              path="/checklists"
              element={<RoleRoute element={<ChecklistsPage />} roles={ROUTE_ROLES.applicant} />}
            />
            <Route path="/notifications" element={<NotificationsPage />} />
            <Route
              path="/applications/new"
              element={<RoleRoute element={<ApplicationsPage />} roles={ROUTE_ROLES.applicant} />}
            />
            <Route
              path="/applications/:id"
              element={<RoleRoute element={<ApplicationDetailPage />} roles={ROUTE_ROLES.applicant} />}
            />
            <Route
              path="/applications"
              element={<RoleRoute element={<ApplicationsPage />} roles={ROUTE_ROLES.applicant} />}
            />
            <Route
              path="/department/applications/:id"
              element={<RoleRoute element={<DepartmentApplicationPage />} roles={ROUTE_ROLES.officer} />}
            />
            <Route
              path="/department"
              element={<RoleRoute element={<DepartmentInboxPage />} roles={ROUTE_ROLES.officer} />}
            />
            <Route
              path="/inspections/:id"
              element={<RoleRoute element={<InspectionDetailPage />} roles={ROUTE_ROLES.inspections} />}
            />
            <Route
              path="/inspections"
              element={<RoleRoute element={<InspectionsPage />} roles={ROUTE_ROLES.inspections} />}
            />
            <Route path="/renewals" element={<RenewalsPage />} />
            <Route path="/compliance" element={<CompliancePage />} />
            <Route
              path="/schemes"
              element={<RoleRoute element={<SchemesPage />} roles={ROUTE_ROLES.applicant} />}
            />
            <Route path="/claims" element={<ClaimsPage />} />
            <Route path="/analytics" element={<AnalyticsPage />} />
            <Route path="/grievances" element={<GrievancesPage />} />
          </Route>

          <Route
            path="*"
            element={
              <div className="app-loading">
                <h1>404</h1>
                <p>This page does not exist.</p>
              </div>
            }
          />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
