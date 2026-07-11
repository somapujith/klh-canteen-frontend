import { Outlet } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export function ProtectedRoute({ role, allowSuperAdmin = true }: { role: string; allowSuperAdmin?: boolean }) {
  const { token, role: userRole } = useAuth();

  if (!token) {
    window.location.href = "/login";
    return null;
  }
  
  if (userRole === "SUPERADMIN" && allowSuperAdmin) {
    return <Outlet />;
  }

  if (userRole !== role) {
    window.location.href = "/login";
    return null;
  }

  return <Outlet />;
}
