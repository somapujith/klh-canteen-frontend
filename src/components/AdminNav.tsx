import { NavLink } from "react-router-dom";
import type { ReactNode } from "react";
import { Logo } from "./Logo";
import { useAuth } from "../context/AuthContext";

/**
 * Tab icons.
 *
 * The row is icon-only, so the icon carries the whole meaning — there is no
 * text beside it to recover from. Each is a distinct silhouette rather than a
 * variation on one shape, because at 20px a viewer discriminates by outline,
 * not by detail. `label` is still required on every tab: it becomes the
 * accessible name and the hover tooltip, which is the only thing standing
 * between an icon-only nav and an unusable one.
 */
const icons: Record<string, ReactNode> = {
  Dashboard: (
    <path strokeLinecap="round" strokeLinejoin="round" d="M4 5a1 1 0 011-1h5v7H4V5zm0 9h6v6H5a1 1 0 01-1-1v-5zm10-10h5a1 1 0 011 1v4h-6V4zm0 7h6v8a1 1 0 01-1 1h-5v-9z" />
  ),
  Inventory: (
    <path strokeLinecap="round" strokeLinejoin="round" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
  ),
  Students: (
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 14l9-5-9-5-9 5 9 5zm0 0v7m-5-4.5V19a5 5 0 0010 0v-2.5" />
  ),
  Logs: (
    <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 10h16M4 14h10M4 18h10" />
  ),
  Payments: (
    <path strokeLinecap="round" strokeLinejoin="round" d="M3 10h18M3 10V7a1 1 0 011-1h16a1 1 0 011 1v3M3 10v7a1 1 0 001 1h16a1 1 0 001-1v-7M7 15h3" />
  ),
  ORDERS: (
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm14 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z" />
  ),
  Users: (
    <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-1a4 4 0 00-4-4h-1m-3 5H2v-1a5 5 0 015-5h4a5 5 0 015 5v1zm-2-13a3 3 0 11-6 0 3 3 0 016 0zm7 1a2.5 2.5 0 11-5 0 2.5 2.5 0 015 0z" />
  ),
  Cohorts: (
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v4m0 0L8 9m4-2l4 2M4 9v6l4 2m-4-8l4 2m0 6v-6m0 6l4 2 4-2m-4-4v4m8-8v6l-4 2m4-8l-4 2" />
  ),
  System: (
    <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065zM15 12a3 3 0 11-6 0 3 3 0 016 0z" />
  ),
  "Audit Log": (
    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
  ),
};

const adminTabs = [
  { to: "/admin", label: "Dashboard" },
  { to: "/admin/inventory", label: "Inventory" },
  { to: "/admin/students", label: "Students" },
  { to: "/admin/logs", label: "Logs" },
  { to: "/admin/payments", label: "Payments" },
  { to: "/admin/board", label: "ORDERS" },
];

const superAdminTabs = [
  ...adminTabs,
  { to: "/admin/users", label: "Users" },
  { to: "/admin/cohorts", label: "Cohorts" },
  { to: "/admin/system", label: "System" },
  { to: "/admin/audit-log", label: "Audit Log" },
];

function TabIcon({ label, className }: { label: string; className: string }) {
  return (
    <svg className={className} aria-hidden="true" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
      {icons[label]}
    </svg>
  );
}

export function AdminNav() {
  const { logout, role } = useAuth();
  const tabs = role === "SUPERADMIN" ? superAdminTabs : adminTabs;

  return (
    <div className="nav-shell">
      <nav className="w-full max-w-6xl nav-notch shadow-sm">
        <div className="flex items-center justify-between px-4 sm:px-6 py-3">
          <div className="flex items-center gap-2 sm:gap-3">
            <Logo className="h-8 sm:h-9 shrink-0 hover-scale" />
            <span className="font-semibold text-gray-800 tracking-tight truncate">KLH Admin</span>
          </div>
          <button
            onClick={logout}
            className="shrink-0 rounded-xl border border-gray-200 px-3 py-1.5 text-sm hover:bg-surface-muted transition-colors font-medium text-gray-600 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
          >
            Log out
          </button>
        </div>
        <div className="flex gap-1.5 px-4 sm:px-6 pb-3 pt-1 overflow-x-auto whitespace-nowrap items-center [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
          {tabs.map((tab) => {
            const isScan = tab.label === "ORDERS";
            return (
              <NavLink
                key={tab.to}
                to={tab.to}
                end={tab.to === "/admin"}
                // The label is gone from the surface, so it has to survive
                // somewhere: aria-label names the control for a screen reader,
                // title gives a sighted user the hover tooltip.
                aria-label={tab.label}
                title={tab.label}
                className={({ isActive }) =>
                  `grid place-items-center shrink-0 transition-all hover-scale ${
                    isScan
                      ? `h-10 w-12 rounded-xl text-white flat-shadow ${
                          isActive ? "bg-brand-700 ring-2 ring-offset-2 ring-brand-500" : "bg-brand-600 hover:bg-brand-500"
                        }`
                      : `h-9 w-9 rounded-full border border-transparent ${
                          isActive
                            ? "bg-gray-800 text-white shadow-md"
                            : "bg-gray-100/80 text-gray-600 hover:bg-gray-200 hover:text-gray-900 hover:border-gray-300"
                        }`
                  }`
                }
              >
                <TabIcon label={tab.label} className={isScan ? "h-5 w-5" : "h-[1.15rem] w-[1.15rem]"} />
              </NavLink>
            );
          })}
          {/* Spacer to ensure right padding is respected during horizontal scroll */}
          <div className="w-2 shrink-0 sm:w-4" aria-hidden="true" />
        </div>
      </nav>
    </div>
  );
}
