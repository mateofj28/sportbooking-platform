"use client";

import { Button, Badge } from "@heroui/react";
import { Bell } from "lucide-react";
import { useRouter } from "next/navigation";
import { useUnreadCount } from "@/hooks/use-notifications";

/**
 * Campana de notificaciones para el navbar del panel admin.
 * Muestra un badge con la cantidad de no leídas (polling vía useUnreadCount)
 * y al hacer clic navega al centro de notificaciones.
 */
export function NotificationBell() {
    const router = useRouter();
    const { data } = useUnreadCount();
    const count = data?.count ?? 0;

    return (
        <Badge
            content={count > 99 ? "99+" : count}
            color="danger"
            size="sm"
            isInvisible={count === 0}
            shape="circle"
        >
            <Button
                isIconOnly
                variant="light"
                size="sm"
                aria-label="Notificaciones"
                onPress={() => router.push("/dashboard/notifications")}
            >
                <Bell className="h-4 w-4 text-white/90" />
            </Button>
        </Badge>
    );
}
