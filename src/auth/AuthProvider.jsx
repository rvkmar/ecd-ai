// src/auth/AuthProvider.jsx
import React, { createContext, useContext, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { jwtDecode } from "jwt-decode";
import { apiFetch, apiErrorMessage } from "../api/apiClient";

const AuthContext = createContext(null);

export function useAuth() {
  return useContext(AuthContext);
}

const STORAGE_KEY = "ecd_auth_v1";
// Previously read process.env.REACT_APP_AUTH_URL — a Create React App
// convention that doesn't apply here. This is a Vite app: process.env isn't
// shimmed in the browser bundle, so that reference either evaluated to
// undefined (silently falling back to the hardcoded default below) or threw
// at import time depending on the build, and even the .env value it was
// meant to read (REACT_APP_AUTH_URL=/api/login) pointed at a route that no
// longer exists (the live route is /api/users/login). Fixed to use Vite's
// own import.meta.env with the VITE_ prefix.
const LOGIN_URL = import.meta.env.VITE_AUTH_URL || "/api/users/login";
const REFRESH_URL = "/api/users/refresh";
const LOGOUT_URL = "/api/users/logout";

function persistAuth(next) {
  if (!next) {
    sessionStorage.removeItem(STORAGE_KEY);
    return;
  }
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify(next));
}

export function AuthProvider({ children }) {
  const navigate = useNavigate();
  const [auth, setAuth] = useState(() => {
    try {
      const raw = sessionStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  });
  const authRef = useRef(auth);
  authRef.current = auth;
  const refreshingRef = useRef(null);

  const clearLocalSession = () => {
    setAuth(null);
    persistAuth(null);
    try {
      history.replaceState({}, "logged-out", "/login");
    } catch {}
    navigate("/login", { replace: true });
  };

  const applySession = (data) => {
    const next = {
      username: data.username,
      role: data.role,
      token: data.token,
      refreshToken: data.refreshToken,
    };
    setAuth(next);
    persistAuth(next);
    return next;
  };

  const refreshSession = async () => {
    const current = authRef.current;
    if (!current?.refreshToken) {
      clearLocalSession();
      throw new Error("No refresh token");
    }
    if (refreshingRef.current) return refreshingRef.current;

    refreshingRef.current = (async () => {
      try {
        const data = await apiFetch(REFRESH_URL, {
          method: "POST",
          body: JSON.stringify({ refreshToken: current.refreshToken }),
        });
        return applySession(data);
      } catch (err) {
        clearLocalSession();
        throw err;
      } finally {
        refreshingRef.current = null;
      }
    })();

    return refreshingRef.current;
  };

  // Refresh shortly before access expiry; fall back to logout if refresh fails.
  useEffect(() => {
    if (!auth?.token) return;

    try {
      const { exp } = jwtDecode(auth.token);
      const now = Date.now() / 1000;
      if (!exp) return undefined;
      const msUntilRefresh = Math.max((exp - now) * 1000 - 30_000, 0);
      if (exp <= now) {
        refreshSession().catch(() => {});
        return undefined;
      }
      const timer = setTimeout(() => {
        refreshSession().catch(() => {});
      }, msUntilRefresh);
      return () => clearTimeout(timer);
    } catch {
      clearLocalSession();
      return undefined;
    }
  }, [auth?.token, auth?.refreshToken]);

  const login = async ({ username, password, role }) => {
    if (!username || !password || !role) {
      throw new Error("username, password and role required");
    }

    try {
      // Pre-auth on purpose: there is no token yet. apiFetch already omits
      // Authorization when `auth` is absent (see apiClient.test.js), so
      // login does not need a raw fetch() or a guard allowlist.
      const data = await apiFetch(LOGIN_URL, {
        method: "POST",
        body: JSON.stringify({ username, password, role }),
      });

      const token = data.token;
      if (!data.refreshToken) {
        throw new Error("Invalid token");
      }

      try {
        const decoded = jwtDecode(token);
        const now = Date.now() / 1000;
        if (decoded.exp && decoded.exp < now) {
          throw new Error("Token expired");
        }
      } catch (e) {
        throw new Error("Invalid token");
      }

      applySession(data);
    } catch (err) {
      throw new Error(apiErrorMessage(err, err?.message || "Network/Server error"));
    }
  };

  const logout = () => {
    const current = authRef.current;
    // Best-effort server revoke; local clear always runs.
    if (current?.refreshToken || current?.token) {
      apiFetch(
        LOGOUT_URL,
        {
          method: "POST",
          body: JSON.stringify({ refreshToken: current.refreshToken }),
        },
        current
      ).catch(() => {});
    }
    clearLocalSession();
  };

  // Force logout on back/navigation or cross-tab clear
  useEffect(() => {
    const handlePop = () => {
      if (authRef.current) logout();
    };
    const handlePageShow = (e) => {
      if (authRef.current && e.persisted) logout();
    };
    const handleStorage = (e) => {
      if (e.key === STORAGE_KEY && !sessionStorage.getItem(STORAGE_KEY)) {
        if (authRef.current) logout();
      }
    };

    window.addEventListener("popstate", handlePop);
    window.addEventListener("pageshow", handlePageShow);
    window.addEventListener("storage", handleStorage);

    return () => {
      window.removeEventListener("popstate", handlePop);
      window.removeEventListener("pageshow", handlePageShow);
      window.removeEventListener("storage", handleStorage);
    };
  }, []);

  const value = {
    auth,
    login,
    logout,
    refreshSession,
    isAuthenticated: !!auth,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
