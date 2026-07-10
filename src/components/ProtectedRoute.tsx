import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export function ProtectedRoute({ role }: { role: "STUDENT" | "ADMIN" }) {
  const { token, role: userRole } = useAuth();

  if (!token) return <Navigate to="/login" replace />;
  if (userRole !== role) return <Navigate to="/login" replace />;

  return <Outlet />;
}
