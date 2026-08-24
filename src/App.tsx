import { Suspense, useEffect } from "react";
import { lazyRoute, clearChunkReloadFlag } from "./lib/lazyRoute";
import { Routes, Route, Navigate } from "react-router-dom";
import { useAuth } from "./context/AuthContext";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { LoadingState } from "./components/LoadingState";
import { NetworkStatus } from "./components/NetworkStatus";
import { ErrorBoundary } from "./components/ErrorBoundary";

const LoginPage = lazyRoute(() => import("./pages/LoginPage").then(module => ({ default: module.LoginPage })));
const StudentMenuPage = lazyRoute(() => import("./pages/student/StudentMenuPage").then(module => ({ default: module.StudentMenuPage })));
const CheckoutPage = lazyRoute(() => import("./pages/student/CheckoutPage").then(module => ({ default: module.CheckoutPage })));
const OrderTokenPage = lazyRoute(() => import("./pages/student/OrderTokenPage").then(module => ({ default: module.OrderTokenPage })));
const OrderHistoryPage = lazyRoute(() => import("./pages/student/OrderHistoryPage").then(module => ({ default: module.OrderHistoryPage })));
const AdminMenuPage = lazyRoute(() => import("./pages/admin/AdminMenuPage").then(module => ({ default: module.AdminMenuPage })));
const AdminStudentsPage = lazyRoute(() => import("./pages/admin/AdminStudentsPage").then(module => ({ default: module.AdminStudentsPage })));
const AdminOrderBoardPage = lazyRoute(() => import("./pages/admin/AdminOrderBoardPage").then(module => ({ default: module.AdminOrderBoardPage })));
const AdminDashboardPage = lazyRoute(() => import("./pages/admin/AdminDashboardPage").then(module => ({ default: module.AdminDashboardPage })));
const AdminLogsPage = lazyRoute(() => import("./pages/admin/AdminLogsPage").then(module => ({ default: module.AdminLogsPage })));
const AdminPaymentsPage = lazyRoute(() => import("./pages/admin/AdminPaymentsPage").then(module => ({ default: module.AdminPaymentsPage })));
const SuperAdminDashboardPage = lazyRoute(() => import("./pages/admin/SuperAdminDashboardPage").then(module => ({ default: module.SuperAdminDashboardPage })));
const AdminUsersPage = lazyRoute(() => import("./pages/admin/AdminUsersPage").then(module => ({ default: module.AdminUsersPage })));
const AdminAuditLogPage = lazyRoute(() => import("./pages/admin/AdminAuditLogPage").then(module => ({ default: module.AdminAuditLogPage })));
const AdminCohortsPage = lazyRoute(() => import("./pages/admin/AdminCohortsPage").then(module => ({ default: module.AdminCohortsPage })));

// Walk-up guest flow — public, no ProtectedRoute. Reached by scanning the printed QR at the counter.
const GuestMenuPage = lazyRoute(() => import("./pages/guest/GuestMenuPage").then(module => ({ default: module.GuestMenuPage })));
const GuestCheckoutPage = lazyRoute(() => import("./pages/guest/GuestCheckoutPage").then(module => ({ default: module.GuestCheckoutPage })));
const GuestOrderStatusPage = lazyRoute(() => import("./pages/guest/GuestOrderStatusPage").then(module => ({ default: module.GuestOrderStatusPage })));
const GuestOrdersPage = lazyRoute(() => import("./pages/guest/GuestOrdersPage").then(module => ({ default: module.GuestOrdersPage })));

function RoleRedirect() {
  const { token, role } = useAuth();
  if (!token) return <Navigate to="/login" replace />;
  return <Navigate to={role === "SUPERADMIN" ? "/admin" : role === "ADMIN" ? "/admin" : "/student"} replace />;
}

export default function App() {
  // Reaching here means the shell and its first chunks loaded, so any earlier
  // stale-deploy reload is spent business. Clearing it restores the one-shot
  // allowance for the next deploy, which would otherwise be used up for the
  // lifetime of the tab. See lib/lazyRoute.ts.
  useEffect(() => {
    clearChunkReloadFlag();
  }, []);

  return (
    <>
      <NetworkStatus />
      <ErrorBoundary>
        <Suspense fallback={<LoadingState />}>
        <Routes>
          <Route path="/" element={<RoleRedirect />} />
          <Route path="/login" element={<LoginPage />} />

          {/* Public counter routes — deliberately outside every ProtectedRoute. */}
          <Route path="/g" element={<GuestMenuPage />} />
          <Route path="/g/checkout" element={<GuestCheckoutPage />} />
          <Route path="/g/orders" element={<GuestOrdersPage />} />
          <Route path="/g/order/:ids" element={<GuestOrderStatusPage />} />
          <Route path="/guest" element={<Navigate to="/g" replace />} />
          <Route path="/guest/*" element={<Navigate to="/g" replace />} />

          <Route element={<ProtectedRoute role="STUDENT" />}>
            <Route path="/student" element={<StudentMenuPage />} />
            <Route path="/student/checkout" element={<CheckoutPage />} />
            <Route path="/student/order/:id" element={<OrderTokenPage />} />
            <Route path="/student/orders" element={<OrderHistoryPage />} />
          </Route>

          <Route element={<ProtectedRoute role="ADMIN" />}>
            <Route path="/admin" element={<AdminDashboardPage />} />
            <Route path="/admin/inventory" element={<AdminMenuPage />} />
            <Route path="/admin/board" element={<AdminOrderBoardPage />} />
            <Route path="/admin/logs" element={<AdminLogsPage />} />
            <Route path="/admin/payments" element={<AdminPaymentsPage />} />
          </Route>

          <Route element={<ProtectedRoute role="SUPERADMIN" allowSuperAdmin={false} />}>
            <Route path="/superadmin" element={<Navigate to="/admin" replace />} />
            <Route path="/admin/students" element={<AdminStudentsPage />} />
            <Route path="/admin/users" element={<AdminUsersPage />} />
            <Route path="/admin/cohorts" element={<AdminCohortsPage />} />
            <Route path="/admin/system" element={<SuperAdminDashboardPage />} />
            <Route path="/admin/audit-log" element={<AdminAuditLogPage />} />
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
      </ErrorBoundary>
    </>
  );
}
