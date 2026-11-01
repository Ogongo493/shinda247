import { createContext, useContext, useState, useEffect, type ReactNode } from "react";

interface AuthUser {
  id: number;
  phone: string;
  username: string;
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

  function login(newToken: string, newUser: AuthUser) {
    setToken(newToken);
    setUser(newUser);
    localStorage.setItem("shinda_token", newToken);
    localStorage.setItem("shinda_user", JSON.stringify(newUser));
  }

  function logout() {
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
