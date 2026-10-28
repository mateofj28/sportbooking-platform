import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import type { AppNotification } from "@/types";

interface NotificationsPage {
    data: AppNotification[];
    meta: { total: number; page: number; limit: number; totalPages: number };
}

/** Lista paginada de notificaciones del usuario (scope por rol resuelto en el backend). */
export function useNotifications(page = 1, limit = 20) {
    return useQuery({
        queryKey: ["notifications", page, limit],
        queryFn: () =>
            apiClient.get<NotificationsPage>(`/notifications?page=${page}&limit=${limit}`),
        refetchOnMount: "always",
        placeholderData: (prev) => prev,
    });
}

/** Contador de no leídas, con polling cada 30s para el badge de la campana. */
export function useUnreadCount() {
    return useQuery({
        queryKey: ["notifications", "unread"],
        queryFn: () => apiClient.get<{ count: number }>("/notifications/unread-count"),
        refetchInterval: 30_000,
        refetchOnWindowFocus: true,
    });
}

/** Marca una notificación como leída. */
export function useMarkNotificationRead() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (id: string) => apiClient.patch<{ ok: boolean }>(`/notifications/${id}/read`, {}),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["notifications"] });
        },
    });
}

/** Marca todas las notificaciones del scope como leídas. */
export function useMarkAllNotificationsRead() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: () => apiClient.patch<{ count: number }>(`/notifications/read-all`, {}),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["notifications"] });
        },
    });
}
