import { Suspense, lazy } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import { useAuth } from "./context/AuthContext";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { LoadingState } from "./components/LoadingState";
import { NetworkStatus } from "./components/NetworkStatus";

const LoginPage = lazy(() => import("./pages/LoginPage").then(module => ({ default: module.LoginPage })));
const StudentMenuPage = lazy(() => import("./pages/student/StudentMenuPage").then(module => ({ default: module.StudentMenuPage })));
const CheckoutPage = lazy(() => import("./pages/student/CheckoutPage").then(module => ({ default: module.CheckoutPage })));
const OrderQrPage = lazy(() => import("./pages/student/OrderQrPage").then(module => ({ default: module.OrderQrPage })));
const OrderHistoryPage = lazy(() => import("./pages/student/OrderHistoryPage").then(module => ({ default: module.OrderHistoryPage })));
const AdminMenuPage = lazy(() => import("./pages/admin/AdminMenuPage").then(module => ({ default: module.AdminMenuPage })));
const AdminStudentsPage = lazy(() => import("./pages/admin/AdminStudentsPage").then(module => ({ default: module.AdminStudentsPage })));
const AdminScanPage = lazy(() => import("./pages/admin/AdminScanPage").then(module => ({ default: module.AdminScanPage })));
const AdminDashboardPage = lazy(() => import("./pages/admin/AdminDashboardPage").then(module => ({ default: module.AdminDashboardPage })));
const AdminLogsPage = lazy(() => import("./pages/admin/AdminLogsPage").then(module => ({ default: module.AdminLogsPage })));
const AdminPaymentsPage = lazy(() => import("./pages/admin/AdminPaymentsPage").then(module => ({ default: module.AdminPaymentsPage })));

function RoleRedirect() {
  const { token, role } = useAuth();
  if (!token) return <Navigate to="/login" replace />;
  return <Navigate to={role === "ADMIN" ? "/admin" : "/student"} replace />;
}

export default function App() {
  return (
    <>
      <NetworkStatus />
      <Suspense fallback={<LoadingState />}>
        <Routes>
          <Route path="/" element={<RoleRedirect />} />
          <Route path="/login" element={<LoginPage />} />

          <Route element={<ProtectedRoute role="STUDENT" />}>
            <Route path="/student" element={<StudentMenuPage />} />
            <Route path="/student/checkout" element={<CheckoutPage />} />
            <Route path="/student/order/:id" element={<OrderQrPage />} />
            <Route path="/student/orders" element={<OrderHistoryPage />} />
          </Route>

          <Route element={<ProtectedRoute role="ADMIN" />}>
            <Route path="/admin" element={<AdminDashboardPage />} />
            <Route path="/admin/inventory" element={<AdminMenuPage />} />
            <Route path="/admin/students" element={<AdminStudentsPage />} />
            <Route path="/admin/scan" element={<AdminScanPage />} />
            <Route path="/admin/logs" element={<AdminLogsPage />} />
            <Route path="/admin/payments" element={<AdminPaymentsPage />} />
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </>
  );
}
