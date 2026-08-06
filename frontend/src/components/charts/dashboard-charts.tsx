"use client";

import { Card, CardBody, CardHeader, Divider } from "@heroui/react";
import {
    PieChart, Pie, Cell, ResponsiveContainer, Tooltip,
    BarChart, Bar, XAxis, YAxis, CartesianGrid,
    AreaChart, Area,
} from "recharts";
import { useTheme } from "@/hooks/use-theme";
import type { Booking } from "@/types";

const COLORS = {
    PENDING: "#F59E0B",
    CONFIRMED: "#10B981",
    CANCELLED: "#EF4444",
    COMPLETED: "#6B7280",
};

const DAY_NAMES = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];

interface DashboardChartsProps {
    bookings: Booking[];
}

function useChartColors() {
    const { isDark } = useTheme();
    return {
        text: isDark ? "#A1A1AA" : "#71717A",
        grid: isDark ? "#27272A" : "#E4E4E7",
        tooltipBg: isDark ? "#18181B" : "#FFFFFF",
        tooltipBorder: isDark ? "#3F3F46" : "#E4E4E7",
        pieBg: isDark ? "#18181B" : "#FFFFFF",
    };
}

export function BookingStatusDonut({ bookings }: DashboardChartsProps) {
    const colors = useChartColors();
    const data = [
        { name: "Pendientes", value: bookings.filter((b) => b.status === "PENDING").length, color: COLORS.PENDING },
        { name: "Confirmadas", value: bookings.filter((b) => b.status === "CONFIRMED").length, color: COLORS.CONFIRMED },
        { name: "Canceladas", value: bookings.filter((b) => b.status === "CANCELLED").length, color: COLORS.CANCELLED },
        { name: "Completadas", value: bookings.filter((b) => b.status === "COMPLETED").length, color: COLORS.COMPLETED },
    ].filter((d) => d.value > 0);

    if (data.length === 0) {
        return (
            <Card>
                <CardHeader className="pb-2">
                    <div>
                        <h2 className="text-base font-semibold">Estado de reservas</h2>
                        <p className="text-xs text-default-400">Distribución actual</p>
                    </div>
                </CardHeader>
                <Divider />
                <CardBody className="flex items-center justify-center py-8">
                    <p className="text-sm text-default-400">Sin datos disponibles</p>
                </CardBody>
            </Card>
        );
    }

    return (
        <Card>
            <CardHeader className="pb-2">
                <div>
                    <h2 className="text-base font-semibold">Estado de reservas</h2>
                    <p className="text-xs text-default-400">Distribución actual</p>
                </div>
            </CardHeader>
            <Divider />
            <CardBody>
                <div className="flex items-center gap-4">
                    <ResponsiveContainer width={160} height={160}>
                        <PieChart>
                            <Pie
                                data={data}
                                cx="50%"
                                cy="50%"
                                innerRadius={45}
                                outerRadius={70}
                                dataKey="value"
                                strokeWidth={2}
                              stroke={colors.pieBg}
                          >
                              {data.map((entry, index) => (
                                  <Cell key={`cell-${index}`} fill={entry.color} />
                              ))}
                          </Pie>
                          <Tooltip
                              contentStyle={{
                                  borderRadius: "8px",
                                  fontSize: "12px",
                                  backgroundColor: colors.tooltipBg,
                                  border: `1px solid ${colors.tooltipBorder}`,
                                  color: colors.text,
                              }}
                          />
                      </PieChart>
                  </ResponsiveContainer>
                  <div className="flex-1 space-y-2">
                      {data.map((item) => (
                          <div key={item.name} className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                  <div className="h-3 w-3 rounded-full" style={{ backgroundColor: item.color }} />
                                  <span className="text-xs text-default-600">{item.name}</span>
                              </div>
                              <span className="text-xs font-semibold">{item.value}</span>
                          </div>
                      ))}
                  </div>
              </div>
          </CardBody>
      </Card>
  );
}

export function BookingsByDayBar({ bookings }: DashboardChartsProps) {
    const colors = useChartColors();
    const dayCounts = [0, 0, 0, 0, 0, 0, 0];
    bookings.forEach((b) => {
        if (b.status !== "CANCELLED") {
          const day = (new Date(b.startDatetime).getDay() + 6) % 7;
          dayCounts[day]++;
      }
  });

    const data = DAY_NAMES.map((name, i) => ({ name, reservas: dayCounts[i] }));

    return (
        <Card>
            <CardHeader className="pb-2">
                <div>
                    <h2 className="text-base font-semibold">Reservas por día</h2>
                    <p className="text-xs text-default-400">Demanda semanal</p>
                </div>
            </CardHeader>
            <Divider />
            <CardBody>
                <ResponsiveContainer width="100%" height={200}>
                    <BarChart data={data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke={colors.grid} />
                      <XAxis dataKey="name" tick={{ fontSize: 11, fill: colors.text }} stroke={colors.grid} />
                      <YAxis tick={{ fontSize: 11, fill: colors.text }} stroke={colors.grid} allowDecimals={false} />
                      <Tooltip
                          contentStyle={{
                              borderRadius: "8px",
                              fontSize: "12px",
                              backgroundColor: colors.tooltipBg,
                              border: `1px solid ${colors.tooltipBorder}`,
                              color: colors.text,
                          }}
                      />
                      <Bar dataKey="reservas" fill="#60A5FA" radius={[4, 4, 0, 0]} />
                  </BarChart>
              </ResponsiveContainer>
          </CardBody>
      </Card>
  );
}

export function RevenueAreaChart({ bookings }: DashboardChartsProps) {
    const colors = useChartColors();
    const today = new Date();
    const last7 = Array.from({ length: 7 }, (_, i) => {
        const d = new Date(today);
        d.setDate(today.getDate() - (6 - i));
        return d;
    });

    const data = last7.map((date) => {
        const dayStr = date.toLocaleDateString("es-AR", { day: "2-digit", month: "short" });
        const dayRevenue = bookings
            .filter((b) => {
                const bDate = new Date(b.startDatetime);
                return bDate.toDateString() === date.toDateString() && b.status !== "CANCELLED";
            })
            .reduce((sum, b) => sum + Number(b.totalPrice), 0);
        return { name: dayStr, ingresos: dayRevenue };
    });

    return (
        <Card>
            <CardHeader className="pb-2">
                <div>
                    <h2 className="text-base font-semibold">Ingresos últimos 7 días</h2>
                    <p className="text-xs text-default-400">Tendencia de facturación</p>
                </div>
            </CardHeader>
            <Divider />
            <CardBody>
                <ResponsiveContainer width="100%" height={200}>
                    <AreaChart data={data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke={colors.grid} />
                      <XAxis dataKey="name" tick={{ fontSize: 11, fill: colors.text }} stroke={colors.grid} />
                      <YAxis tick={{ fontSize: 11, fill: colors.text }} stroke={colors.grid} />
                      <Tooltip
                          contentStyle={{
                              borderRadius: "8px",
                              fontSize: "12px",
                              backgroundColor: colors.tooltipBg,
                              border: `1px solid ${colors.tooltipBorder}`,
                              color: colors.text,
                          }}
                          formatter={(value: any) => [`$${value}`, "Ingresos"]}
                      />
                      <defs>
                          <linearGradient id="colorIngresos" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor="#10B981" stopOpacity={0.3} />
                              <stop offset="95%" stopColor="#10B981" stopOpacity={0} />
                          </linearGradient>
                      </defs>
                      <Area
                          type="monotone"
                          dataKey="ingresos"
                          stroke="#10B981"
                          strokeWidth={2}
                          fill="url(#colorIngresos)"
                      />
                  </AreaChart>
              </ResponsiveContainer>
          </CardBody>
      </Card>
  );
}

export function SportRevenueBar({ bookings }: DashboardChartsProps) {
    const colors = useChartColors();
    const sportRevenue: Record<string, number> = {};
    bookings.forEach((b) => {
        if (b.status !== "CANCELLED") {
            const sport = b.facility?.sport?.name || "Otro";
            sportRevenue[sport] = (sportRevenue[sport] || 0) + Number(b.totalPrice);
        }
    });

    const data = Object.entries(sportRevenue)
        .map(([name, ingresos]) => ({ name, ingresos }))
        .sort((a, b) => b.ingresos - a.ingresos);

    if (data.length === 0) return null;

    return (
        <Card>
            <CardHeader className="pb-2">
                <div>
                    <h2 className="text-base font-semibold">Ingresos por deporte</h2>
                    <p className="text-xs text-default-400">Cuáles generan más</p>
                </div>
            </CardHeader>
            <Divider />
            <CardBody>
                <ResponsiveContainer width="100%" height={180}>
                    <BarChart data={data} layout="vertical" margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke={colors.grid} />
                      <XAxis type="number" tick={{ fontSize: 11, fill: colors.text }} stroke={colors.grid} />
                      <YAxis dataKey="name" type="category" tick={{ fontSize: 11, fill: colors.text }} stroke={colors.grid} width={80} />
                      <Tooltip
                          contentStyle={{
                              borderRadius: "8px",
                              fontSize: "12px",
                              backgroundColor: colors.tooltipBg,
                              border: `1px solid ${colors.tooltipBorder}`,
                              color: colors.text,
                          }}
                          formatter={(value: any) => [`$${value}`, "Ingresos"]}
                      />
                      <Bar dataKey="ingresos" fill="#A78BFA" radius={[0, 4, 4, 0]} />
                  </BarChart>
              </ResponsiveContainer>
          </CardBody>
      </Card>
  );
}
