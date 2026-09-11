"use client";

import { useMemo, useState, useEffect, useCallback } from "react";
import { Card, CardBody, Chip, Button, Spinner, Input } from "@heroui/react";
import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import { useAuthStore } from "@/stores/auth-store";
import { useBookings } from "@/hooks/use-bookings";
import { Navbar } from "@/components/layout/navbar";
import { Footer } from "@/components/layout/footer";
import { useRouter } from "next/navigation";
import { Search, Calendar, Clock, MapPin, ArrowRight, RotateCcw } from "lucide-react";
import type { Booking, Sport } from "@/types";

/** ⚽ 🎾 etc. según el nombre del deporte */
function sportEmoji(name?: string): string {
    const key = (name || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    const map: Record<string, string> = {
        futbol: "⚽", futsal: "⚽", tenis: "🎾", padel: "🎾", padle: "🎾",
        basquetbol: "🏀", baloncesto: "🏀", voleibol: "🏐", volleyball: "🏐",
        yoga: "🧘", natacion: "🏊", boxeo: "🥊",
    };
    return map[key] || "🏆";
}

function formatDate(dateStr: string): string {
    return new Date(dateStr).toLocaleDateString("es-AR", { weekday: "long", day: "numeric", month: "long" });
}

function formatTime12h(dateStr: string): string {
    const d = new Date(dateStr);
    let h = d.getHours();
    const m = d.getMinutes();
    const ampm = h < 12 ? "a. m." : "p. m.";
    h = h % 12; if (h === 0) h = 12;
    return `${h}:${String(m).padStart(2, "0")} ${ampm}`;
}

function formatPrice(value: number): string {
    return Math.round(Number(value)).toLocaleString("en-US");
}

// Promociones (mismas que el dashboard admin, solo para clientes)
const ADS = [
    { title: "🏆 Torneo de Fútbol 5", subtitle: "Inscripciones abiertas", description: "Organiza tu equipo y participa en el torneo de verano.", bg: "from-blue-500 to-blue-700" },
    { title: "🎾 Clases de Tenis", subtitle: "Nuevos horarios", description: "Aprende con profesores certificados. Todos los niveles.", bg: "from-emerald-500 to-emerald-700" },
    { title: "🏸 30% OFF Pádel", subtitle: "Horarios matutinos", description: "Reserva antes de las 12pm y obtén descuento automático.", bg: "from-violet-500 to-violet-700" },
    { title: "🏀 Liga de Básquet", subtitle: "Temporada 2026", description: "Forma tu equipo de 5 y compite cada sábado.", bg: "from-orange-500 to-orange-700" },
];

export default function ClientHomePage() {
    const router = useRouter();
    const { user, isAuthenticated, isHydrated } = useAuthStore();
    const [searchQuery, setSearchQuery] = useState("");

    useEffect(() => {
        if (isHydrated && !isAuthenticated) router.replace("/login");
    }, [isHydrated, isAuthenticated, router]);

    const { data: bookingsResponse, isLoading } = useBookings();
    const bookings = useMemo(() => (Array.isArray(bookingsResponse?.data) ? bookingsResponse.data : []), [bookingsResponse]);

    const { data: sports } = useQuery({
        queryKey: ["sports"],
        queryFn: () => apiClient.get<Sport[]>("/sports"),
    });

    // Próximas reservas confirmadas (futuras), ordenadas por fecha
    const upcoming = useMemo(() => {
        const now = new Date();
        return bookings
            .filter((b) => b.status === "CONFIRMED" && new Date(b.startDatetime) >= now)
            .sort((a, b) => new Date(a.startDatetime).getTime() - new Date(b.startDatetime).getTime())
            .slice(0, 3);
    }, [bookings]);

    // Canchas usadas antes (para "reservar de nuevo"), únicas por instalación
    const recentFacilities = useMemo(() => {
        const seen = new Set<string>();
        const result: Booking["facility"][] = [];
        for (const b of [...bookings].sort((a, b) => new Date(b.startDatetime).getTime() - new Date(a.startDatetime).getTime())) {
            if (b.facility && !seen.has(b.facility.id)) {
                seen.add(b.facility.id);
                result.push(b.facility);
            }
            if (result.length >= 4) break;
        }
        return result;
    }, [bookings]);

    // Carrusel
    const [activeAd, setActiveAd] = useState(0);
    const nextAd = useCallback(() => setActiveAd((p) => (p + 1) % ADS.length), []);
    useEffect(() => {
        const interval = setInterval(nextAd, 4000);
        return () => clearInterval(interval);
    }, [nextAd]);

    const handleSearch = () => {
        router.push(`/facilities${searchQuery ? `?search=${encodeURIComponent(searchQuery)}` : ""}`);
    };

    if (!isHydrated) return <div className="flex min-h-screen items-center justify-center"><Spinner size="lg" /></div>;
    if (!isAuthenticated) return null;

    return (
        <div className="flex min-h-screen flex-col">
            <Navbar />
            <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-8 space-y-10">
                {/* 1. Saludo + búsqueda rápida */}
                <section>
                    <h1 className="text-2xl font-bold">Hola, {user?.firstName} 👋</h1>
                    <p className="text-sm text-default-500 mt-1">¿Listo para tu próximo partido?</p>
                    <div className="mt-4 flex max-w-xl items-center gap-2">
                        <Input
                            placeholder="Buscar una cancha..."
                            variant="bordered"
                            value={searchQuery}
                            onValueChange={setSearchQuery}
                            onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                            startContent={<Search className="h-4 w-4 text-default-400" />}
                        />
                        <Button color="primary" onPress={handleSearch} endContent={<ArrowRight className="h-4 w-4" />}>
                            Reservar
                        </Button>
                    </div>
                </section>

                {/* Promociones (justo después del buscador) */}
                <section>
                    <div className="relative overflow-hidden rounded-2xl">
                        <Card className={`bg-gradient-to-r ${ADS[activeAd].bg} border-none shadow-lg`}>
                            <CardBody className="p-6">
                                <p className="text-xs font-semibold uppercase tracking-wider text-white/70">{ADS[activeAd].subtitle}</p>
                                <h3 className="mt-1 text-lg font-bold text-white">{ADS[activeAd].title}</h3>
                                <p className="mt-2 text-sm text-white/80">{ADS[activeAd].description}</p>
                            </CardBody>
                        </Card>
                    </div>
                    <div className="mt-3 flex justify-center gap-2">
                        {ADS.map((_, i) => (
                            <button
                                key={i}
                                onClick={() => setActiveAd(i)}
                                className={`h-2 rounded-full transition-all ${i === activeAd ? "w-6 bg-primary" : "w-2 bg-default-300 hover:bg-default-400"}`}
                                aria-label={`Promoción ${i + 1}`}
                            />
                        ))}
                    </div>
                </section>

                {/* 2. Próximas reservas */}
                <section>
                    <div className="flex items-center justify-between mb-4">
                        <h2 className="text-lg font-bold">Tus próximas reservas</h2>
                        <Button as="a" href="/bookings" size="sm" variant="light" color="primary">Ver todas →</Button>
                    </div>
                    {isLoading ? (
                        <div className="flex justify-center py-8"><Spinner /></div>
                    ) : upcoming.length > 0 ? (
                        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                            {upcoming.map((b) => (
                                <Card key={b.id} className="border border-divider">
                                    <CardBody className="gap-2 p-4">
                                        <div className="flex items-center justify-between">
                                            <h3 className="font-semibold text-sm truncate">{b.facility.name}</h3>
                                            <Chip size="sm" color="success" variant="flat">Confirmada</Chip>
                                        </div>
                                        <p className="text-xs text-default-400 flex items-center gap-1">
                                            <MapPin className="h-3 w-3" /> {b.facility.venue?.name}
                                        </p>
                                        <p className="text-xs text-default-500 flex items-center gap-1">
                                            <Calendar className="h-3 w-3" /> {formatDate(b.startDatetime)}
                                        </p>
                                        <p className="text-xs text-default-500 flex items-center gap-1">
                                            <Clock className="h-3 w-3" /> {formatTime12h(b.startDatetime)} - {formatTime12h(b.endDatetime)}
                                        </p>
                                        <p className="text-sm font-bold text-success mt-1">${formatPrice(b.totalPrice)} ARS</p>
                                    </CardBody>
                                </Card>
                            ))}
                        </div>
                    ) : (
                        <Card className="border border-divider">
                            <CardBody className="flex flex-col items-center py-10">
                                <Calendar className="h-10 w-10 text-default-200" />
                                <p className="mt-3 text-sm text-default-500">No tienes reservas próximas</p>
                                <Button as="a" href="/facilities" size="sm" color="primary" variant="flat" className="mt-3">
                                    Explorar instalaciones
                                </Button>
                            </CardBody>
                        </Card>
                    )}
                </section>

                {/* 3. Reservar de nuevo */}
                {recentFacilities.length > 0 && (
                    <section>
                        <h2 className="text-lg font-bold mb-4">Reservar de nuevo</h2>
                        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                            {recentFacilities.map((f) => (
                                <Card
                                    key={f.id}
                                    isPressable
                                    onPress={() => router.push(`/facilities/${f.id}`)}
                                    className="border border-divider hover:border-primary transition-colors"
                                >
                                    <CardBody className="flex-row items-center gap-3 p-4">
                                        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-lg">
                                            {sportEmoji(f.sport?.name)}
                                        </div>
                                        <div className="min-w-0 flex-1">
                                            <p className="text-sm font-semibold truncate">{f.name}</p>
                                            <p className="text-xs text-default-400 truncate">{f.venue?.name}</p>
                                        </div>
                                        <RotateCcw className="h-4 w-4 text-default-400 flex-shrink-0" />
                                    </CardBody>
                                </Card>
                            ))}
                        </div>
                    </section>
                )}

                {/* 4. Explora por deporte */}
                {sports && sports.length > 0 && (
                    <section>
                        <h2 className="text-lg font-bold mb-4">Explora por deporte</h2>
                        <div className="flex flex-wrap gap-3">
                            {sports.map((s) => (
                                <button
                                    key={s.id}
                                    type="button"
                                    onClick={() => router.push(`/facilities?sportId=${s.id}`)}
                                    className="flex items-center gap-2 rounded-full border border-divider px-4 py-2 text-sm font-medium hover:border-primary hover:text-primary transition-colors"
                                >
                                    <span className="text-base">{sportEmoji(s.name)}</span>
                                    {s.name}
                                </button>
                            ))}
                        </div>
                    </section>
                )}

            </main>
            <Footer />
        </div>
    );
}
