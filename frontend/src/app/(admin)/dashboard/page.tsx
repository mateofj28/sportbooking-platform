"use client";

import { Card, CardBody } from "@heroui/react";
import { LayoutDashboard, ArrowRight } from "lucide-react";
import Link from "next/link";
import { useAuthStore } from "@/stores/auth-store";

const quickLinks = [
    { href: "/dashboard/statistics", label: "Ver estadísticas", description: "Métricas, gráficas e indicadores" },
    { href: "/dashboard/bookings", label: "Gestionar reservas", description: "Confirmar, cancelar, crear" },
    { href: "/dashboard/facilities", label: "Instalaciones", description: "CRUD de canchas y campos" },
    { href: "/dashboard/schedules", label: "Configurar horarios", description: "Apertura y cierre por día" },
    { href: "/dashboard/pricing", label: "Configurar precios", description: "Tarifas por franja horaria" },
    { href: "/dashboard/users", label: "Ver usuarios", description: "Gestión de clientes" },
];

export default function DashboardPage() {
    const { user } = useAuthStore();

    return (
        <div className="space-y-8 animate-fade-in">
          <div>
              <h1 className="text-2xl font-bold text-foreground">
                  Hola, {user?.firstName} 👋
              </h1>
              <p className="text-sm text-default-500 mt-1">
                  Bienvenido al panel de administración de SportBooking
              </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {quickLinks.map((link) => (
                  <Link key={link.href} href={link.href}>
                      <Card isPressable className="h-full hover:border-primary/30 border border-divider transition-all">
                          <CardBody className="flex-row items-center justify-between p-4">
                              <div>
                            <p className="font-semibold text-sm">{link.label}</p>
                            <p className="text-xs text-default-500 mt-0.5">{link.description}</p>
                        </div>
                        <ArrowRight className="h-4 w-4 text-default-400" />
                    </CardBody>
                </Card>
            </Link>
        ))}
          </div>
      </div>
  );
}
