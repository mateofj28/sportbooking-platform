import { create } from "zustand";
import type { User } from "@/types";

interface AuthState {
    user: User | null;
    accessToken: string | null;
    isAuthenticated: boolean;
    isHydrated: boolean;
    setAuth: (user: User, accessToken: string, refreshToken: string) => void;
    logout: () => void;
    updateUser: (user: Partial<User>) => void;
    hydrate: () => void;
}

export const useAuthStore = create<AuthState>((set, get) => ({
    user: null,
    accessToken: null,
    isAuthenticated: false,
    isHydrated: false,

    setAuth: (user, accessToken, refreshToken) => {
        if (typeof window !== "undefined") {
            localStorage.setItem("accessToken", accessToken);
            localStorage.setItem("refreshToken", refreshToken);
            localStorage.setItem("user", JSON.stringify(user));
        }
        set({ user, accessToken, isAuthenticated: true });
    },

    logout: () => {
        if (typeof window !== "undefined") {
            localStorage.removeItem("accessToken");
            localStorage.removeItem("refreshToken");
            localStorage.removeItem("user");
        }
        set({ user: null, accessToken: null, isAuthenticated: false });
    },

    updateUser: (userData) => {
        const current = get().user;
        if (current) {
            const updated = { ...current, ...userData };
            if (typeof window !== "undefined") {
                localStorage.setItem("user", JSON.stringify(updated));
            }
            set({ user: updated });
        }
    },

    hydrate: () => {
        if (typeof window !== "undefined") {
            const token = localStorage.getItem("accessToken");
            const userStr = localStorage.getItem("user");
            if (token && userStr) {
                try {
                    const user = JSON.parse(userStr);
                    set({ user, accessToken: token, isAuthenticated: true, isHydrated: true });
                } catch {
                    set({ isHydrated: true });
                }
            } else {
                set({ isHydrated: true });
            }
        }
    },
}));
