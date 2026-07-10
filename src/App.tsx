import { Routes, Route, Navigate } from "react-router-dom";
import { useAuth } from "./context/AuthContext";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { LoginPage } from "./pages/LoginPage";
import { StudentMenuPage } from "./pages/student/StudentMenuPage";
import { CheckoutPage } from "./pages/student/CheckoutPage";
import { OrderQrPage } from "./pages/student/OrderQrPage";
import { OrderHistoryPage } from "./pages/student/OrderHistoryPage";
import { AdminMenuPage } from "./pages/admin/AdminMenuPage";
import { AdminStudentsPage } from "./pages/admin/AdminStudentsPage";
import { AdminScanPage } from "./pages/admin/AdminScanPage";
import { AdminDashboardPage } from "./pages/admin/AdminDashboardPage";
import { AdminLogsPage } from "./pages/admin/AdminLogsPage";
import { AdminPaymentsPage } from "./pages/admin/AdminPaymentsPage";

function RoleRedirect() {
  const { token, role } = useAuth();
  if (!token) return <Navigate to="/login" replace />;
  return <Navigate to={role === "ADMIN" ? "/admin" : "/student"} replace />;
}

export default function App() {
  return (
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
  );
}
