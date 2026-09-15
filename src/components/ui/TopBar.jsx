// src/ui/TopBar.jsx
import React, { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Settings, LogOut, ChevronDown } from "lucide-react";
import { useAuth } from "../../auth/AuthProvider";
import ThemeToggle from "../../theme/ThemeToggle";

// Where the app title / brand should link back to for each role -- this is
// also what gives every page (including Settings) a reliable way back to a
// role's home screen, since not every page otherwise exposes one.
const HOME_BY_ROLE = {
  admin: "/admin?tab=home",
  district: "/district?tab=home",
  teacher: "/teacher?tab=home",
  student: "/student?tab=home",
};

function initialsFor(username) {
  if (!username) return "?";
  return username.slice(0, 2).toUpperCase();
}

function ProfileMenu({ auth, logout }) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef(null);

  useEffect(() => {
    function handleClickOutside(e) {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex items-center gap-1.5 rounded-full pl-1 pr-2 py-1 hover:bg-muted transition-colors"
      >
        <span className="flex items-center justify-center w-8 h-8 rounded-full bg-primary text-primary-foreground text-xs font-semibold">
          {initialsFor(auth.username)}
        </span>
        <ChevronDown size={14} className="text-muted-foreground" />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 mt-2 w-56 rounded-lg border border-border bg-card text-card-foreground shadow-lg py-1 z-50"
        >
          <div className="px-3 py-2 border-b border-border">
            <div className="text-sm font-medium truncate">{auth.username}</div>
            <div className="text-xs text-muted-foreground capitalize">{auth.role}</div>
          </div>

          {auth.role === "admin" && (
            <Link
              to="/admin/settings"
              onClick={() => setOpen(false)}
              className="flex items-center gap-2 px-3 py-2 text-sm hover:bg-muted"
            >
              <Settings size={14} />
              Settings
            </Link>
          )}

          <button
            type="button"
            onClick={() => {
              setOpen(false);
              logout();
            }}
            className="flex items-center gap-2 w-full text-left px-3 py-2 text-sm text-destructive hover:bg-muted"
          >
            <LogOut size={14} />
            Logout
          </button>
        </div>
      )}
    </div>
  );
}

export default function TopBar() {
  const { auth, logout } = useAuth();
  const home = HOME_BY_ROLE[auth?.role] || "/login";

  return (
    <div className="w-full flex items-center justify-between px-4 py-2 bg-card text-card-foreground border-b border-border">
      <Link to={home} className="font-semibold hover:opacity-80">
        Assessment
      </Link>
      <div className="flex items-center gap-3">
        <ThemeToggle />
        {auth ? (
          <ProfileMenu auth={auth} logout={logout} />
        ) : (
          <div className="text-sm text-muted-foreground">Not logged in</div>
        )}
      </div>
    </div>
  );
}
