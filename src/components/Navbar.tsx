import { useNavigate } from "react-router-dom";
import { Logo } from "./Logo";
import { useAuth } from "../context/AuthContext";

export function Navbar({ title }: { title: string }) {
  const { name, logout } = useAuth();
  const navigate = useNavigate();

  function handleLogout() {
    logout();
    navigate("/login", { replace: true });
  }

  return (
    <nav className="flex items-center justify-between bg-white rounded-b-2xl shadow-sm px-4 sm:px-6 py-3">
      <div className="flex items-center gap-3">
        <Logo className="h-8 sm:h-9 shrink-0" />
        <span className="font-semibold text-brand-900">{title}</span>
      </div>
      <div className="flex items-center gap-2 sm:gap-4">
        <span className="text-sm text-gray-600 hidden sm:inline-block truncate max-w-[100px] sm:max-w-none">{name}</span>
        <button
          onClick={handleLogout}
          className="shrink-0 rounded-xl border border-gray-300 px-3 py-1.5 text-sm hover:bg-gray-50 transition"
        >
          Log out
        </button>
      </div>
    </nav>
  );
}
