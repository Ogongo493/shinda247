import { createContext, useContext, useState, useEffect, type ReactNode } from "react";

interface AuthUser {
  id: number;
  phone: string;
  username: string;
  email?: string | null;
  isAdmin: boolean;
}

interface AuthContextValue {
  user: AuthUser | null;
  token: string | null;
  login: (token: string, user: AuthUser) => void;
  logout: () => void;
  isLoading: boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let active = true;
    async function restoreSession() {
      const storedToken = localStorage.getItem("shinda_token");
      if (!storedToken) { if (active) setIsLoading(false); return; }
      try {
        const response = await fetch("/api/auth/me", { headers: { Authorization: `Bearer ${storedToken}` } });
        if (!response.ok) throw new Error("Session expired");
        const currentUser = await response.json();
        if (active) {
          setToken(storedToken);
          setUser(currentUser);
          localStorage.setItem("shinda_user", JSON.stringify(currentUser));
        }
      } catch {
        localStorage.removeItem("shinda_token");
        localStorage.removeItem("shinda_user");
        if (active) { setToken(null); setUser(null); }
      } finally { if (active) setIsLoading(false); }
    }
    void restoreSession();
    return () => { active = false; };
  }, []);

  // Enforce immediate browser logout after 15 minutes without admin activity.
  // The API independently checks the same timeout on every protected request.
  useEffect(() => {
    if (!user?.isAdmin || !token) return;
    let timer: number;
    const expire = () => {
      void fetch("/api/auth/logout", {
        method: "POST",
        headers: { Authorization: "Bearer " + token },
      }).catch(() => undefined);
      setToken(null);
      setUser(null);
      localStorage.removeItem("shinda_token");
      localStorage.removeItem("shinda_user");
    };
    const resetTimer = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(expire, 15 * 60 * 1000);
    };
    const events: Array<keyof WindowEventMap> = ["pointerdown", "keydown", "touchstart", "wheel"];
    events.forEach(event => window.addEventListener(event, resetTimer, { passive: true }));
    resetTimer();
    return () => {
      window.clearTimeout(timer);
      events.forEach(event => window.removeEventListener(event, resetTimer));
    };
  }, [user?.isAdmin, token]);

  function login(newToken: string, newUser: AuthUser) {
    setToken(newToken);
    setUser(newUser);
    localStorage.setItem("shinda_token", newToken);
    localStorage.setItem("shinda_user", JSON.stringify(newUser));
  }

  function logout() {
    if (token) {
      void fetch("/api/auth/logout", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      }).catch(() => undefined);
    }
    setToken(null);
    setUser(null);
    localStorage.removeItem("shinda_token");
    localStorage.removeItem("shinda_user");
  }

  return (
    <AuthContext.Provider value={{ user, token, login, logout, isLoading }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
