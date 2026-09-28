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