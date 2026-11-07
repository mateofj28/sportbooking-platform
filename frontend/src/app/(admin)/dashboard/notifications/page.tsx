"use client";

import { Button, Spinner, Chip } from "@heroui/react";
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

/** Ícono, color de acento y etiqueta por tipo */
const TYPE_META: Record<NotificationType, {
  icon: React.ReactNode;
  iconBg: string;
  accent: string;   // color del borde izquierdo
  label: string;
}> = {
  BOOKING_CREATED: { icon: <Calendar className="h-4 w-4 text-primary" />, iconBg: "bg-primary/10", accent: "border-l-primary", label: "Nueva reserva" },
  BOOKING_PAID: { icon: <DollarSign className="h-4 w-4 text-success" />, iconBg: "bg-success/10", accent: "border-l-success", label: "Reserva pagada" },
  BOOKING_CANCELLED: { icon: <XCircle className="h-4 w-4 text-danger" />, iconBg: "bg-danger/10", accent: "border-l-danger", label: "Cancelada" },
  BOOKING_AUTO_CANCELLED: { icon: <XCircle className="h-4 w-4 text-danger" />, iconBg: "bg-danger/10", accent: "border-l-danger", label: "Cancelada automáticamente" },
  RECURRING_CREATED: { icon: <Repeat className="h-4 w-4 text-secondary" />, iconBg: "bg-secondary/10", accent: "border-l-secondary", label: "Turno fijo" },
  NEW_CLIENT: { icon: <UserPlus className="h-4 w-4 text-primary" />, iconBg: "bg-primary/10", accent: "border-l-primary", label: "Nuevo cliente" },
  COMMISSION_EARNED: { icon: <TrendingUp className="h-4 w-4 text-emerald-500" />, iconBg: "bg-emerald-500/10", accent: "border-l-emerald-500", label: "Comisión" },
  VENUE_OR_FACILITY_CREATED: { icon: <Building2 className="h-4 w-4 text-warning" />, iconBg: "bg-warning/10", accent: "border-l-warning", label: "Nueva instalación" },
  USER_REGISTERED: { icon: <UserPlus className="h-4 w-4 text-secondary" />, iconBg: "bg-secondary/10", accent: "border-l-secondary", label: "Nuevo usuario" },
};

/** "hace X" en español */
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
  return new Date(iso).toLocaleDateString("es-AR", {
    day: "numeric", month: "short", timeZone: "America/Argentina/Buenos_Aires",
  });
}

export default function NotificationsPage() {
  const router = useRouter();
  const [page, setPage] = useState(1);
  const { data, isLoading } = useNotifications(page, 20);
  const markRead = useMarkNotificationRead();
  const markAllRead = useMarkAllNotificationsRead();

  const items = data?.data ?? [];
  const total = data?.meta.total ?? 0;
  const totalPages = data?.meta.totalPages ?? 1;
  const unreadCount = items.filter((n) => !n.read).length;

  const handleClick = (n: AppNotification) => {
    if (!n.read) markRead.mutate(n.id);
    if (n.bookingId) router.push(`/bookings/${n.bookingId}`);
  };

  return (
    <div className="space-y-5 max-w-3xl">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Notificaciones</h1>
          <p className="text-sm text-default-500 mt-0.5">
            {total > 0
              ? `${total} notificación${total !== 1 ? "es" : ""}${unreadCount > 0 ? ` · ${unreadCount} sin leer` : ""}`
              : "Centro de notificaciones del sistema"}
          </p>
        </div>
        {unreadCount > 0 && (
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

      {/* Lista */}
      {isLoading && items.length === 0 ? (
        <div className="flex justify-center py-16"><Spinner size="lg" /></div>
      ) : items.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-default-100 mb-4">
              <Bell className="h-7 w-7 text-default-400" />
            </div>
            <p className="font-semibold text-default-600">Sin notificaciones</p>
            <p className="mt-1 text-sm text-default-400 max-w-xs">
              Aquí verás nuevas reservas, cancelaciones y alertas del sistema.
            </p>
          </div>
        ) : (
          <>
              <div className="rounded-xl border border-divider bg-content1 divide-y divide-divider overflow-hidden">
                {items.map((n) => {
                  const meta = TYPE_META[n.type];
                  return (
                <button
                  key={n.id}
                  type="button"
                  onClick={() => handleClick(n)}
                  className={`
                    w-full flex items-start gap-4 px-5 py-3.5 text-left
                    border-l-4 ${meta?.accent ?? "border-l-default-200"}
                    transition-colors
                    ${n.read
                      ? "bg-transparent hover:bg-default-50"
                      : "bg-primary/[0.03] hover:bg-primary/[0.06]"
                    }
                  `}
                >
                  {/* Ícono */}
                  <div className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg mt-0.5 ${meta?.iconBg ?? "bg-default-100"}`}>
                    {meta?.icon ?? <Bell className="h-4 w-4 text-default-500" />}
                  </div>

                  {/* Contenido */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`text-sm font-semibold ${n.read ? "text-foreground" : "text-foreground"}`}>
                        {n.title}
                      </span>
                      <span className="text-xs text-default-400">{meta?.label}</span>
                      {!n.read && (
                        <span className="inline-flex h-1.5 w-1.5 rounded-full bg-primary flex-shrink-0" />
                      )}
                    </div>
                    <p className="mt-0.5 text-sm text-default-500 truncate">{n.body}</p>
                    <p className="mt-1 text-xs text-default-400">{timeAgo(n.createdAt)}</p>
                  </div>
                </button>
              );
            })}
              </div>

              {/* Paginación */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between">
              <span className="text-xs text-default-400">Página {page} de {totalPages}</span>
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
