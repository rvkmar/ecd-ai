import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthProvider";
import toast from "react-hot-toast";
import { Eye, EyeOff } from 'lucide-react';

const ROLES = ["admin", "district", "teacher", "student"];

export default function LoginPage() {
  const navigate = useNavigate();
  const { login, auth } = useAuth();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [role, setRole] = useState(""); // Default role set to "teacher" = useState("teacher");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!username || !password) {
      toast.error("Enter username and password");
      return;
    }
    setLoading(true);
    try {
      await login({ username, password, role });
      toast.success(`Logged in as ${role}`);
      navigate(`/${role}?tab=home`, { replace: true });
    } catch (err) {
      toast.error(err.message || "Login failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex items-center justify-center min-h-screen bg-background">
      <form
        onSubmit={handleSubmit}
        className="bg-card text-card-foreground border border-border p-8 rounded shadow-md w-96"
      >
        <h1 className="text-2xl font-bold mb-6 text-center text-foreground">Sign in</h1>

        <input
          placeholder="Username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          className="w-full border border-input bg-background text-foreground placeholder:text-muted-foreground p-2 rounded mb-3 focus:outline-none focus:ring-2 focus:ring-ring"
        />

        <div className="relative w-full mb-3">
          <input
            placeholder="Password"
            type={showPassword ? 'text' : 'password'}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full border border-input bg-background text-foreground placeholder:text-muted-foreground p-2 pr-10 rounded focus:outline-none focus:ring-2 focus:ring-ring"
          />
          <button
            type="button" // Prevents the button from accidentally submitting a form
            onClick={() => setShowPassword(!showPassword)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground focus:outline-none"
            aria-label={showPassword ? 'Hide password' : 'Show password'}
          >
            {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
          </button>
        </div>

        {/* <label htmlFor="role-select" className="block text-sm font-medium mb-1">
          Role
        </label> */}
        
        <select
          id="role-select"
          value={role}
          onChange={(e) => setRole(e.target.value)}
          className="w-full border border-input bg-background text-foreground p-2 rounded mb-4 focus:outline-none focus:ring-2 focus:ring-ring"
        >

          <option value="" disabled>
            -- Select a Role --
          </option>

          {ROLES.map((r) => (
            <option key={r} value={r} className="bg-background text-foreground">
              {r.charAt(0).toUpperCase() + r.slice(1)}
            </option>
          ))}
        </select>

        <button
          type="submit"
          disabled={loading}
          className="w-full px-4 py-2 bg-primary text-primary-foreground rounded hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? "Signing in…" : "Sign In"}
        </button>
      </form>
    </div>
  );
}
