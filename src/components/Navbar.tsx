import { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Logo } from "./Logo";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";

export function Navbar({ title }: { title: string }) {
  const { name, logout } = useAuth();
  const navigate = useNavigate();
  const { showToast } = useToast();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  function handleLogout() {
    logout();
    navigate("/login", { replace: true });
  }

  function handleResetPassword() {
    setMenuOpen(false);
    showToast("Password reset link sent to your email! (mock)", "success");
  }

  return (
    <nav className="flex items-center justify-between glass-panel rounded-b-2xl shadow-sm px-4 sm:px-6 py-3 relative z-40 sticky top-0">
      <div className="flex items-center gap-3">
        <Logo className="h-8 sm:h-9 shrink-0 hover-scale" />
        <span className="font-semibold text-gray-800 tracking-tight">{title}</span>
      </div>
      
      <div className="relative" ref={menuRef}>
        <button
          onClick={() => setMenuOpen(!menuOpen)}
          className="flex items-center gap-2 px-2 sm:px-3 py-1.5 rounded-full hover:bg-surface-muted transition-colors border border-transparent hover:border-gray-200 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
        >
          <div className="w-8 h-8 rounded-full bg-brand-50 text-brand-700 flex items-center justify-center font-bold text-sm shrink-0 uppercase shadow-sm">
            {name?.charAt(0) || "U"}
          </div>
          <span className="text-sm font-medium text-gray-700 hidden sm:inline-block max-w-[120px] truncate">
            {name}
          </span>
          <svg className={`w-4 h-4 text-gray-400 transition-transform duration-300 ${menuOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
          </svg>
        </button>

        {menuOpen && (
          <div className="absolute right-0 mt-3 w-56 bg-white rounded-2xl flat-shadow border border-gray-100 py-2 overflow-hidden fade-in">
            <div className="px-4 py-3 border-b border-gray-50 sm:hidden bg-gray-50/50">
              <p className="text-sm font-medium text-gray-900 truncate">{name}</p>
            </div>
            

            
            <button
              onClick={handleResetPassword}
              className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 hover:bg-brand-50 hover:text-brand-700 transition-colors text-left"
            >
              <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
              </svg>
              Reset Password
            </button>
            
            <div className="h-px bg-gray-100 my-1 mx-2"></div>
            
            <button
              onClick={handleLogout}
              className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-red-600 hover:bg-red-50 transition-colors text-left font-medium"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
              Log out
            </button>
          </div>
        )}
      </div>
    </nav>
  );
}
