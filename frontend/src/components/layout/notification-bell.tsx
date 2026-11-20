"use client";

import { Button, Badge } from "@heroui/react";
import { Bell } from "lucide-react";
import { useRouter } from "next/navigation";
import { useUnreadCount } from "@/hooks/use-notifications";

/**
 * Campana de notificaciones para el navbar del panel admin.
 * Muestra un punto azul cuando hay no leídas (polling vía useUnreadCount)
 * y al hacer clic navega al centro de notificaciones.
 */
export function NotificationBell() {
    const router = useRouter();
    const { data } = useUnreadCount();
    const count = data?.count ?? 0;

    return (
        <Badge
            content=""
            size="sm"
            isInvisible={count === 0}
            shape="circle"
            aria-label={count > 0 ? `${count} notificaciones sin leer` : undefined}
            classNames={{
                badge: "h-2.5 w-2.5 min-h-0 min-w-0 border-0 bg-[#5B3DF5] p-0 top-[15%] right-[15%]",
            }}
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
