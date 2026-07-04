"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { apiClient } from "@/lib/api-client";
import { useAuthStore } from "@/stores/auth-store";
import type { AuthResponse, User, LoginCredentials, RegisterData } from "@/types";

export function useAuth() {
    const router = useRouter();
    const { setAuth, logout: storeLogout, user, isAuthenticated } = useAuthStore();

    const loginMutation = useMutation({
        mutationFn: (credentials: LoginCredentials) =>
            apiClient.post<AuthResponse>("/auth/login", credentials),
        onSuccess: (data) => {
            setAuth(data.user, data.accessToken, data.refreshToken);
            if (data.user.role === "ADMIN") {
                router.push("/dashboard");
            } else {
                router.push("/facilities");
            }
        },
    });

    const registerMutation = useMutation({
        mutationFn: (data: RegisterData) =>
            apiClient.post<AuthResponse>("/auth/register", data),
        onSuccess: (data) => {
            setAuth(data.user, data.accessToken, data.refreshToken);
            router.push("/facilities");
        },
    });

    const profileQuery = useQuery({
        queryKey: ["profile"],
        queryFn: () => apiClient.get<User>("/auth/me"),
        enabled: isAuthenticated,
    });

    const logout = () => {
        storeLogout();
        router.push("/login");
    };

    return {
        user,
        isAuthenticated,
        login: loginMutation,
        register: registerMutation,
        profile: profileQuery,
        logout,
    };
}
