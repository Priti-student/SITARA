import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { fetchMe, login, register, type User } from "../api/auth";
import { getAccessToken, setAccessToken } from "../api/client";

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (input: {
    fullName: string;
    email: string;
    password: string;
    phone?: string;
  }) => Promise<void>;
  signOut: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  // On refresh with a stored token, rehydrate the session.
  useEffect(() => {
    if (!getAccessToken()) {
      setLoading(false);
      return;
    }
    fetchMe()
      .then((d) => setUser(d.user))
      .catch(() => {
        setAccessToken(null);
        setUser(null);
      })
      .finally(() => setLoading(false));
  }, []);

  async function signIn(email: string, password: string): Promise<void> {
    const res = await login({ email, password });
    setAccessToken(res.accessToken);
    localStorage.setItem("sitara.refreshToken", res.refreshToken);
    setUser(res.user);
  }

  async function signUp(input: {
    fullName: string;
    email: string;
    password: string;
    phone?: string;
  }): Promise<void> {
    const res = await register(input);
    setAccessToken(res.accessToken);
    localStorage.setItem("sitara.refreshToken", res.refreshToken);
    setUser(res.user);
  }

  function signOut(): void {
    setAccessToken(null);
    localStorage.removeItem("sitara.refreshToken");
    setUser(null);
  }

  const value: AuthContextValue = { user, loading, signIn, signUp, signOut };
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}

export function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return "Something went wrong";
}