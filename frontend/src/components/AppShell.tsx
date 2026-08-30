import { useState, type ReactNode } from "react";
import {
  IconOverview,
  IconRun,
  IconHistory,
  IconCompare,
  IconSetup,
  IconSettings,
  IconMenu,
  IconClose,
} from "./Icons";

export type NavKey = "overview" | "run" | "history" | "compare" | "setup" | "settings";

const PRIMARY_NAV: { key: NavKey; label: string; icon: (p: { className?: string }) => ReactNode }[] = [
  { key: "overview", label: "Overview", icon: (p) => <IconOverview {...p} /> },
  { key: "run", label: "Run Diagnostic", icon: (p) => <IconRun {...p} /> },
  { key: "history", label: "Test History", icon: (p) => <IconHistory {...p} /> },
  { key: "compare", label: "Compare Tests", icon: (p) => <IconCompare {...p} /> },
];

const SECONDARY_NAV: { key: NavKey; label: string; icon: (p: { className?: string }) => ReactNode }[] = [
  { key: "setup", label: "Robot Setup", icon: (p) => <IconSetup {...p} /> },
  { key: "settings", label: "Settings", icon: (p) => <IconSettings {...p} /> },
];

function NavButton({
  item,
  active,
  onClick,
}: {
  item: { key: NavKey; label: string; icon: (p: { className?: string }) => ReactNode };
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button type="button" className={`nav-item${active ? " active" : ""}`} onClick={onClick} aria-current={active ? "page" : undefined}>
      {item.icon({ className: "nav-item-icon" })}
      {item.label}
    </button>
  );
}

export function AppShell({
  active,
  onNavigate,
  mobileTitle,
  children,
}: {
  active: NavKey;
  onNavigate: (key: NavKey) => void;
  mobileTitle: string;
  children: ReactNode;
}) {
  const [mobileOpen, setMobileOpen] = useState(false);

  function navigate(key: NavKey) {
    onNavigate(key);
    setMobileOpen(false);
  }

  return (
    <div className="app-shell">
      <div className="mobile-topbar">
        <button type="button" className="icon-btn" aria-label="Open menu" onClick={() => setMobileOpen(true)}>
          <IconMenu />
        </button>
        <span className="mobile-topbar-title">{mobileTitle}</span>
      </div>

      <div className={`mobile-nav-scrim${mobileOpen ? " open" : ""}`} onClick={() => setMobileOpen(false)} />

      <aside className={`sidebar${mobileOpen ? " open" : ""}`}>
        <div className="sidebar-brand">
          <span className="sidebar-brand-mark" aria-hidden="true" />
          <span className="sidebar-brand-text">VEX Diagnostics</span>
          <button
            type="button"
            className="icon-btn"
            aria-label="Close menu"
            style={{ marginLeft: "auto", display: mobileOpen ? "inline-flex" : "none" }}
            onClick={() => setMobileOpen(false)}
          >
            <IconClose />
          </button>
        </div>

        <nav className="sidebar-nav">
          {PRIMARY_NAV.map((item) => (
            <NavButton key={item.key} item={item} active={active === item.key} onClick={() => navigate(item.key)} />
          ))}
        </nav>

        <div className="sidebar-spacer" />

        <nav className="sidebar-nav">
          {SECONDARY_NAV.map((item) => (
            <NavButton key={item.key} item={item} active={active === item.key} onClick={() => navigate(item.key)} />
          ))}
        </nav>
      </aside>

      <main className="main-content">{children}</main>
    </div>
  );
}
