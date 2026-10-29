import { useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";

export type Role = "super_admin" | "user";

export interface AuthUser {
  id: string;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  role: Role;
}

const AUTH_USER_KEY = ["/api/auth/user"];

export async function login(email: string, password: string): Promise<void> {
  const res = await apiRequest("POST", "/api/auth/login", { email, password });
  queryClient.setQueryData(AUTH_USER_KEY, await res.json());
}

export async function logout(): Promise<void> {
  await apiRequest("POST", "/api/auth/logout");
  // Full reload so no cached data from this session survives.
  window.location.href = "/";
}

export function useAuth() {
  const { data, isLoading } = useQuery<{ user: AuthUser | null }>({ queryKey: AUTH_USER_KEY });
  return { user: data?.user ?? null, isLoading };
}
