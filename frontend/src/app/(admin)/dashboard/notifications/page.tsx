"use client";

import { Card, CardBody } from "@heroui/react";
import { Bell } from "lucide-react";

export default function NotificationsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Notificaciones</h1>
        <p className="text-sm text-default-500 mt-1">Centro de notificaciones del sistema</p>
      </div>

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
    </div>
  );
}
