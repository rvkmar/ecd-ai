// src/auth/__tests__/AuthProvider.test.jsx

import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { AuthProvider, useAuth } from "../AuthProvider.jsx";

const STORAGE_KEY = "ecd_auth_v1";

// AuthProvider never verifies a JWT's signature client-side (only decodes
// it, to read `exp`) — that's the server's job. So a syntactically valid,
// unsigned-for-real token is enough to exercise the client flow.
function base64url(obj) {
  const json = JSON.stringify(obj);
  const b64 = btoa(unescape(encodeURIComponent(json)));
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function fakeJwt(payload) {
  return `${base64url({ alg: "HS256", typ: "JWT" })}.${base64url(payload)}.fakesignature`;
}

function TestConsumer() {
  const { auth, login, logout, isAuthenticated } = useAuth();
  return (
    <div>
      <div data-testid="auth-state">
        {isAuthenticated ? `logged-in:${auth.username}:${auth.role}` : "logged-out"}
      </div>
      <button
        onClick={() => {
          login({ username: "teach1", password: "pw", role: "teacher" }).catch(() => {});
        }}
      >
        Login
      </button>
      <button onClick={logout}>Logout</button>
    </div>
  );
}

function renderWithProvider() {
  return render(
    <MemoryRouter initialEntries={["/"]}>
      <AuthProvider>
        <TestConsumer />
      </AuthProvider>
    </MemoryRouter>
  );
}

describe("AuthProvider", () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it("starts logged out with nothing in sessionStorage", () => {
    renderWithProvider();
    expect(screen.getByTestId("auth-state")).toHaveTextContent("logged-out");
    expect(sessionStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it("logs in successfully and persists the session to sessionStorage", async () => {
    const exp = Math.floor(Date.now() / 1000) + 3600;
    const token = fakeJwt({ username: "teach1", role: "teacher", exp });
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () =>
        JSON.stringify({
          token,
          refreshToken: "refresh-teach1",
          username: "teach1",
          role: "teacher",
        }),
    });

    renderWithProvider();
    await userEvent.click(screen.getByText("Login"));

    await waitFor(() => {
      expect(screen.getByTestId("auth-state")).toHaveTextContent("logged-in:teach1:teacher");
    });

    const stored = JSON.parse(sessionStorage.getItem(STORAGE_KEY));
    expect(stored.username).toBe("teach1");
    expect(stored.role).toBe("teacher");
    expect(stored.token).toBe(token);
    expect(stored.refreshToken).toBe("refresh-teach1");
  });

  it("surfaces the server's error message on a failed login", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      text: async () => JSON.stringify({ error: "Invalid username or password" }),
    });

    let caughtError = null;
    function ThrowingConsumer() {
      const { login } = useAuth();
      return (
        <button
          onClick={async () => {
            try {
              await login({ username: "teach1", password: "wrong", role: "teacher" });
            } catch (e) {
              caughtError = e.message;
            }
          }}
        >
          Login
        </button>
      );
    }

    render(
      <MemoryRouter>
        <AuthProvider>
          <ThrowingConsumer />
        </AuthProvider>
      </MemoryRouter>
    );

    await userEvent.click(screen.getByText("Login"));
    await waitFor(() => expect(caughtError).toBe("Invalid username or password"));
    expect(sessionStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it("rejects an already-expired token instead of logging in", async () => {
    const expiredToken = fakeJwt({
      username: "teach1",
      role: "teacher",
      exp: Math.floor(Date.now() / 1000) - 60,
    });
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () =>
        JSON.stringify({
          token: expiredToken,
          refreshToken: "refresh-expired",
          username: "teach1",
          role: "teacher",
        }),
    });

    let caughtError = null;
    function ThrowingConsumer() {
      const { login } = useAuth();
      return (
        <button
          onClick={async () => {
            try {
              await login({ username: "teach1", password: "pw", role: "teacher" });
            } catch (e) {
              caughtError = e.message;
            }
          }}
        >
          Login
        </button>
      );
    }

    render(
      <MemoryRouter>
        <AuthProvider>
          <ThrowingConsumer />
        </AuthProvider>
      </MemoryRouter>
    );

    await userEvent.click(screen.getByText("Login"));
    await waitFor(() => expect(caughtError).not.toBeNull());
    expect(sessionStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it("logs out and clears sessionStorage", async () => {
    const exp = Math.floor(Date.now() / 1000) + 3600;
    const token = fakeJwt({ username: "teach1", role: "teacher", exp });
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () =>
        JSON.stringify({
          token,
          refreshToken: "refresh-teach1",
          username: "teach1",
          role: "teacher",
        }),
    });

    renderWithProvider();
    await userEvent.click(screen.getByText("Login"));
    await waitFor(() => expect(screen.getByTestId("auth-state")).toHaveTextContent("logged-in"));

    await userEvent.click(screen.getByText("Logout"));

    await waitFor(() => {
      expect(screen.getByTestId("auth-state")).toHaveTextContent("logged-out");
    });
    expect(sessionStorage.getItem(STORAGE_KEY)).toBeNull();
  });
});
