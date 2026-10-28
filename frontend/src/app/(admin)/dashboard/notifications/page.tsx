"use client";

import { Card, CardBody, Button, Spinner, Chip } from "@heroui/react";
import {
  Bell, Calendar, DollarSign, XCircle, Repeat, UserPlus, TrendingUp, Building2, CheckCheck,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  useNotifications,
  useMarkNotificationRead,
  useMarkAllNotificationsRead,
} from "@/hooks/use-notifications";
import type { AppNotification, NotificationType } from "@/types";

/** Ícono y color por tipo de notificación. */
const TYPE_META: Record<NotificationType, { icon: React.ReactNode; bg: string }> = {
  BOOKING_CREATED: { icon: <Calendar className="h-5 w-5 text-primary" />, bg: "bg-primary/10" },
  BOOKING_PAID: { icon: <DollarSign className="h-5 w-5 text-success" />, bg: "bg-success/10" },
  BOOKING_CANCELLED: { icon: <XCircle className="h-5 w-5 text-danger" />, bg: "bg-danger/10" },
  BOOKING_AUTO_CANCELLED: { icon: <XCircle className="h-5 w-5 text-danger" />, bg: "bg-danger/10" },
  RECURRING_CREATED: { icon: <Repeat className="h-5 w-5 text-secondary" />, bg: "bg-secondary/10" },
  NEW_CLIENT: { icon: <UserPlus className="h-5 w-5 text-primary" />, bg: "bg-primary/10" },
  COMMISSION_EARNED: { icon: <TrendingUp className="h-5 w-5 text-emerald-500" />, bg: "bg-emerald-500/10" },
  VENUE_OR_FACILITY_CREATED: { icon: <Building2 className="h-5 w-5 text-warning" />, bg: "bg-warning/10" },
  USER_REGISTERED: { icon: <UserPlus className="h-5 w-5 text-secondary" />, bg: "bg-secondary/10" },
};

/** "hace X" en español a partir de una fecha ISO. */
function timeAgo(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const sec = Math.floor(diffMs / 1000);
  if (sec < 60) return "hace un momento";
  const min = Math.floor(sec / 60);
  if (min < 60) return `hace ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `hace ${h} h`;
  const d = Math.floor(h / 24);
  if (d < 7) return `hace ${d} día${d !== 1 ? "s" : ""}`;
  // Más de una semana: fecha corta en hora AR
  return new Date(iso).toLocaleDateString("es-AR", {
    day: "numeric", month: "short", timeZone: "America/Argentina/Buenos_Aires",
  });
}

export default function NotificationsPage() {
  const router = useRouter();
  const [page, setPage] = useState(1);
  const { data, isLoading } = useNotifications(page, 15);
  const markRead = useMarkNotificationRead();
  const markAllRead = useMarkAllNotificationsRead();

  const items = data?.data ?? [];
  const total = data?.meta.total ?? 0;
  const totalPages = data?.meta.totalPages ?? 1;
  const hasUnread = items.some((n) => !n.read);

  const handleClick = (n: AppNotification) => {
    if (!n.read) markRead.mutate(n.id);
    if (n.bookingId) router.push(`/bookings/${n.bookingId}`);
  };

  return (
    <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold">Notificaciones</h1>
            <p className="text-sm text-default-500 mt-1">Centro de notificaciones del sistema</p>
          </div>
          {hasUnread && (
            <Button
              variant="flat"
              size="sm"
              startContent={<CheckCheck className="h-4 w-4" />}
              isLoading={markAllRead.isPending}
              onPress={() => markAllRead.mutate()}
            >
              Marcar todas como leídas
            </Button>
          )}
        </div>

        {isLoading && items.length === 0 ? (
          <div className="flex justify-center py-16"><Spinner size="lg" /></div>
        ) : items.length === 0 ? (
            <Card>
              <CardBody className="flex flex-col items-center justify-center py-16">
                <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10 mb-4">
                  <Bell className="h-8 w-8 text-primary" />
                </div>
                <h2 className="text-lg font-semibold">Sin notificaciones</h2>
                <p className="mt-2 text-sm text-default-500 text-center max-w-sm">
                  Aquí verás las notificaciones del sistema como nuevas reservas, cancelaciones y alertas importantes.
                </p>
              </CardBody>
            </Card>
        ) : (
          <>
            <div className="space-y-2">
              {items.map((n) => {
                const meta = TYPE_META[n.type];
                return (
                  <Card
                    key={n.id}
                    isPressable
                    onPress={() => handleClick(n)}
                    className={`w-full border ${n.read ? "border-divider" : "border-primary/30 bg-primary/5"}`}
                  >
                    <CardBody className="flex-row items-start gap-3 p-4">
                      <div className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl ${meta?.bg ?? "bg-default-100"}`}>
                        {meta?.icon ?? <Bell className="h-5 w-5 text-default-500" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="font-semibold text-sm">{n.title}</p>
                          {!n.read && (
                            <Chip size="sm" color="primary" variant="flat" className="h-5">Nueva</Chip>
                          )}
                        </div>
                        <p className="mt-0.5 text-sm text-default-600">{n.body}</p>
                        <p className="mt-1 text-xs text-default-400">{timeAgo(n.createdAt)}</p>
                      </div>
                    </CardBody>
                  </Card>
                );
              })}
            </div>

            {totalPages > 1 && (
              <div className="flex items-center justify-between">
                <span className="text-xs text-default-400">{total} notificaciones</span>
                <div className="flex gap-2">
                  <Button size="sm" variant="flat" isDisabled={page <= 1} onPress={() => setPage((p) => Math.max(1, p - 1))}>
                    Anterior
                  </Button>
                  <Button size="sm" variant="flat" isDisabled={page >= totalPages} onPress={() => setPage((p) => Math.min(totalPages, p + 1))}>
                    Siguiente
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    );
}
