import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import type { ReactNode } from "react";
import { AuthProvider, useAuth } from "./context/AuthContext";
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
    return <div className="app-loading">Loading SITARA…</div>;
  }
  return user ? element : <Navigate to="/login" replace />;
}

function AdminRoute({ element }: { element: ReactNode }): ReactNode {
  const { user, loading } = useAuth();
  if (loading) {
    return <div className="app-loading">Loading SITARA…</div>;
  }
  if (!user) return <Navigate to="/login" replace />;
  const admin = user.roles.some((r) => r === "SUPER_ADMIN" || r === "STATE_ADMIN");
  return admin ? element : <Navigate to="/dashboard" replace />;
}

function OfficerRoute({ element }: { element: ReactNode }): ReactNode {
  const { user, loading } = useAuth();
  if (loading) {
    return <div className="app-loading">Loading SITARA…</div>;
  }
  if (!user) return <Navigate to="/login" replace />;
  const officer = user.roles.some(
    (r) =>
      r === "DEPARTMENT_USER" ||
      r === "APPROVING_AUTHORITY" ||
      r === "STATE_ADMIN" ||
      r === "SUPER_ADMIN"
  );
  return officer ? element : <Navigate to="/dashboard" replace />;
}

function InspectionsRoute({ element }: { element: ReactNode }): ReactNode {
  const { user, loading } = useAuth();
  if (loading) {
    return <div className="app-loading">Loading SITARA…</div>;
  }
  if (!user) return <Navigate to="/login" replace />;
  const allowed = user.roles.some(
    (r) =>
      r === "DEPARTMENT_USER" ||
      r === "APPROVING_AUTHORITY" ||
      r === "STATE_ADMIN" ||
      r === "SUPER_ADMIN" ||
      r === "INSPECTOR"
  );
  return allowed ? element : <Navigate to="/dashboard" replace />;
}

export function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route
            path="/dashboard"
            element={<ProtectedRoute element={<DashboardPage />} />}
          />
          <Route
            path="/rules"
            element={<AdminRoute element={<RulesPage />} />}
          />
          <Route
            path="/checklists/new"
            element={<ProtectedRoute element={<CreateChecklistPage />} />}
          />
          <Route
            path="/checklists/:id"
            element={<ProtectedRoute element={<ChecklistDetailPage />} />}
          />
          <Route
            path="/checklists"
            element={<ProtectedRoute element={<ChecklistsPage />} />}
          />
          <Route
            path="/notifications"
            element={<ProtectedRoute element={<NotificationsPage />} />}
          />
          <Route
            path="/applications/new"
            element={<ProtectedRoute element={<ApplicationsPage />} />}
          />
          <Route
            path="/applications/:id"
            element={<ProtectedRoute element={<ApplicationDetailPage />} />}
          />
          <Route
            path="/applications"
            element={<ProtectedRoute element={<ApplicationsPage />} />}
          />
          <Route
            path="/department/applications/:id"
            element={<OfficerRoute element={<DepartmentApplicationPage />} />}
          />
          <Route
            path="/department"
            element={<OfficerRoute element={<DepartmentInboxPage />} />}
          />
          <Route
            path="/inspections/:id"
            element={<InspectionsRoute element={<InspectionDetailPage />} />}
          />
          <Route
            path="/inspections"
            element={<InspectionsRoute element={<InspectionsPage />} />}
          />
          <Route
            path="/renewals"
            element={<ProtectedRoute element={<RenewalsPage />} />}
          />
          <Route
            path="/compliance"
            element={<ProtectedRoute element={<CompliancePage />} />}
          />
          <Route
            path="/schemes"
            element={<ProtectedRoute element={<SchemesPage />} />}
          />
          <Route
            path="/claims"
            element={<ProtectedRoute element={<ClaimsPage />} />}
          />
          <Route
            path="/analytics"
            element={<ProtectedRoute element={<AnalyticsPage />} />}
          />
          <Route
            path="/grievances"
            element={<ProtectedRoute element={<GrievancesPage />} />}
          />
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