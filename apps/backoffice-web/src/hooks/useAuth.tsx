import {
  createContext,
  useContext,
  useCallback,
  useMemo,
  type ReactNode,
} from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { LoginResponse, RefreshResponse } from "@erp/shared-interfaces";
import { getAccessToken, setAccessToken } from "../lib/access-token";
import {
  persistSession,
  persistRefreshResponse,
  clearSession,
  getRefreshToken,
  hasRefreshToken,
} from "../lib/auth-storage";
import { erpApi, requireErpData } from "../lib/erp-api";

interface AuthState {
  isReady: boolean;
  isAuthenticated: boolean;
  login: (email: string, password: string, organizationId: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();

  const { isLoading: bootstrapping, data: bootstrapped } = useQuery({
    queryKey: ["auth", "bootstrap"],
    queryFn: async (): Promise<boolean> => {
      if (getAccessToken()) return true;
      const rt = getRefreshToken();
      if (!rt) return false;
      const { data, error } = await erpApi.POST<RefreshResponse>("/auth/refresh", {
        body: { refreshToken: rt },
      });
      if (error || !data) {
        clearSession();
        return false;
      }
      persistRefreshResponse(data);
      return true;
    },
    staleTime: Infinity,
    retry: false,
  });

  const loginMutation = useMutation({
    mutationFn: async (vars: {
      email: string;
      password: string;
      organizationId: string;
    }) => {
      return requireErpData(
        await erpApi.POST<LoginResponse>("/auth/login", {
          body: {
            email: vars.email,
            password: vars.password,
            organizationId: vars.organizationId,
          },
        }),
      );
    },
    onSuccess: (data) => {
      persistSession(data);
      queryClient.setQueryData(["auth", "bootstrap"], true);
    },
  });

  const login = useCallback(
    async (email: string, password: string, organizationId: string) => {
      await loginMutation.mutateAsync({ email, password, organizationId });
    },
    [loginMutation],
  );

  const logout = useCallback(async () => {
    await erpApi.POST("/auth/logout", {});
    clearSession();
    queryClient.setQueryData(["auth", "bootstrap"], false);
    queryClient.clear();
  }, [queryClient]);

  const value = useMemo<AuthState>(
    () => ({
      isReady: !bootstrapping,
      isAuthenticated: bootstrapped === true,
      login,
      logout,
    }),
    [bootstrapping, bootstrapped, login, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
