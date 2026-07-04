"use client";

import { Button, Link, Input, Card, CardBody, Avatar } from "@heroui/react";
import { Navbar } from "@/components/layout/navbar";
import { Footer } from "@/components/layout/footer";
import {
    Search,
    MapPin,
    Calendar,
    Clock,
    CheckCircle2,
    Star,
    ArrowRight,
    Trophy,
    Users,
    Zap,
    Shield,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

export default function HomePage() {
    const router = useRouter();
    const [searchQuery, setSearchQuery] = useState("");

    const handleSearch = () => {
        router.push(`/facilities${searchQuery ? `?search=${searchQuery}` : ""}`);
    };

    return (
        <div className="flex min-h-screen flex-col bg-background">
            <Navbar />

            <main className="flex-1">
                {/* ===== HERO ===== */}
                <section className="relative overflow-hidden">
                    {/* Gradient background */}
                    <div className="absolute inset-0 -z-10 bg-gradient-to-br from-primary-50 via-background to-secondary-50" />
                    <div className="absolute top-0 right-0 -z-10 h-[500px] w-[500px] rounded-full bg-primary/5 blur-[100px]" />
                    <div className="absolute bottom-0 left-0 -z-10 h-[400px] w-[400px] rounded-full bg-secondary/5 blur-[100px]" />

                    <div className="mx-auto max-w-7xl px-6 py-16 md:py-24 lg:py-28">
                        <div className="grid items-center gap-12 lg:grid-cols-2">
                            {/* Left - Copy */}
                            <div className="animate-fade-in">
                                <span className="inline-flex items-center gap-2 rounded-full bg-primary/10 px-4 py-1.5 text-xs font-semibold text-primary uppercase tracking-wider">
                                    <Zap className="h-3 w-3" />
                                    La app de reservas deportivas
                                </span>

                                <h1 className="mt-6 text-4xl font-extrabold leading-[1.1] tracking-tight text-foreground md:text-5xl lg:text-6xl">
                                    Tu cancha favorita,{" "}
                                    <span className="bg-gradient-to-r from-primary via-primary to-secondary bg-clip-text text-transparent">
                                        cuando quieras
                                    </span>
                                </h1>

                                <p className="mt-5 max-w-lg text-base text-default-500 leading-relaxed md:text-lg">
                                    Busca, compara y reserva instalaciones deportivas en segundos.
                                    Sin llamadas, sin esperas. Más de 500 canchas disponibles.
                                </p>

                                {/* Search bar in hero */}
                                <div className="mt-8 flex max-w-md items-center gap-2">
                                    <Input
                                        placeholder="¿Qué deporte buscas?"
                                        size="lg"
                                        radius="full"
                                        variant="bordered"
                                        value={searchQuery}
                                        onValueChange={setSearchQuery}
                                        onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                                        startContent={<Search className="h-4 w-4 text-default-400" />}
                                        classNames={{
                                            inputWrapper: "bg-white shadow-sm border-default-200",
                                        }}
                                    />
                                    <Button
                                        color="primary"
                                        size="lg"
                                        radius="full"
                                        isIconOnly
                                        className="shadow-lg shadow-primary/30"
                                        onPress={handleSearch}
                                    >
                                        <ArrowRight className="h-5 w-5" />
                                    </Button>
                                </div>

                                {/* Trust badges */}
                                <div className="mt-8 flex items-center gap-6">
                                    <div className="flex -space-x-2">
                                        {[1, 2, 3, 4, 5].map((i) => (
                                            <Avatar
                                                key={i}
                                                size="sm"
                                                className="border-2 border-background"
                                                name={`U${i}`}
                                                color="primary"
                                            />
                                        ))}
                                    </div>
                                    <div>
                                        <div className="flex items-center gap-1">
                                            {[1, 2, 3, 4, 5].map((i) => (
                                                <Star key={i} className="h-3.5 w-3.5 fill-warning text-warning" />
                                            ))}
                                        </div>
                                        <p className="text-xs text-default-500">+2,000 usuarios activos</p>
                                    </div>
                                </div>
                            </div>

                            {/* Right - Visual */}
                            <div className="relative hidden lg:block animate-slide-up">
                                <div className="relative rounded-2xl bg-white p-6 shadow-2xl shadow-primary/10 border border-default-100">
                                    {/* Fake app preview */}
                                    <div className="space-y-4">
                                        <div className="flex items-center justify-between">
                                            <h3 className="text-sm font-bold">Disponible hoy</h3>
                                            <span className="text-xs text-primary font-medium">Ver todo →</span>
                                        </div>
                                        {[
                                            { name: "Cancha de Fútbol 5", sport: "Fútbol", time: "18:00 - 19:00", price: "$25" },
                                            { name: "Pista de Pádel 1", sport: "Pádel", time: "19:00 - 20:00", price: "$35" },
                                            { name: "Cancha de Tenis A", sport: "Tenis", time: "20:00 - 21:00", price: "$30" },
                                        ].map((item, i) => (
                                            <div
                                                key={i}
                                                className="flex items-center justify-between rounded-xl bg-default-50 p-3 transition-colors hover:bg-primary-50"
                                            >
                                                <div className="flex items-center gap-3">
                                                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                                                        <Trophy className="h-4 w-4 text-primary" />
                                                    </div>
                                                    <div>
                                                        <p className="text-sm font-medium">{item.name}</p>
                                                        <p className="text-xs text-default-400">{item.sport} • {item.time}</p>
                                                    </div>
                                                </div>
                                                <div className="text-right">
                                                    <p className="text-sm font-bold text-success">{item.price}</p>
                                                    <p className="text-[10px] text-default-400">por hora</p>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                                {/* Floating badges */}
                                <div className="absolute -top-4 -right-4 rounded-xl bg-success/90 px-3 py-2 text-white shadow-lg animate-pulse-soft">
                                    <p className="text-xs font-bold">✓ Reserva confirmada</p>
                                </div>
                                <div className="absolute -bottom-3 -left-3 rounded-xl bg-white px-3 py-2 shadow-lg border border-default-100">
                                    <p className="text-xs font-medium text-foreground flex items-center gap-1">
                                        <Clock className="h-3 w-3 text-primary" />
                                        Confirmación inmediata
                                    </p>
                                </div>
                            </div>
                        </div>
                    </div>
                </section>

                {/* ===== HOW IT WORKS ===== */}
                <section className="border-t border-divider bg-white px-6 py-20">
                    <div className="mx-auto max-w-5xl">
                        <div className="text-center mb-14">
                            <h2 className="text-3xl font-bold">
                                Reserva en <span className="text-primary">3 simples pasos</span>
                            </h2>
                            <p className="mt-3 text-default-500">
                                Sin complicaciones, sin llamadas
                            </p>
                        </div>

                        <div className="grid gap-8 md:grid-cols-3">
                            <StepCard
                                step={1}
                                icon={<Search className="h-6 w-6" />}
                                title="Busca"
                                description="Filtra por deporte, ubicación, fecha y horario disponible"
                            />
                            <StepCard
                                step={2}
                                icon={<Calendar className="h-6 w-6" />}
                                title="Elige tu horario"
                                description="Selecciona el día y la hora que más te convenga"
                            />
                            <StepCard
                                step={3}
                                icon={<CheckCircle2 className="h-6 w-6" />}
                                title="¡Listo!"
                                description="Confirma tu reserva y recibe la notificación al instante"
                            />
                        </div>
                    </div>
                </section>

                {/* ===== STATS ===== */}
                <section className="px-6 py-16 bg-gradient-to-r from-primary to-primary-700">
                    <div className="mx-auto max-w-5xl">
                        <div className="grid gap-8 text-center text-white sm:grid-cols-2 lg:grid-cols-4">
                            <div className="animate-scale-in">
                                <p className="text-4xl font-extrabold">500+</p>
                                <p className="mt-1 text-sm text-white/70">Canchas disponibles</p>
                            </div>
                            <div className="animate-scale-in" style={{ animationDelay: "100ms" }}>
                                <p className="text-4xl font-extrabold">6</p>
                                <p className="mt-1 text-sm text-white/70">Deportes</p>
                            </div>
                            <div className="animate-scale-in" style={{ animationDelay: "200ms" }}>
                                <p className="text-4xl font-extrabold">2,000+</p>
                                <p className="mt-1 text-sm text-white/70">Usuarios activos</p>
                            </div>
                            <div className="animate-scale-in" style={{ animationDelay: "300ms" }}>
                                <p className="text-4xl font-extrabold">98%</p>
                                <p className="mt-1 text-sm text-white/70">Satisfacción</p>
                            </div>
                        </div>
                    </div>
                </section>

                {/* ===== FEATURES ===== */}
                <section className="px-6 py-20 bg-default-50">
                    <div className="mx-auto max-w-6xl">
                        <div className="text-center mb-14">
                            <h2 className="text-3xl font-bold">
                                Todo lo que necesitas para jugar
                            </h2>
                            <p className="mt-3 text-default-500 max-w-xl mx-auto">
                                Una plataforma completa para deportistas y administradores de complejos deportivos
                            </p>
                        </div>

                        <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
                            <FeatureCard
                                icon={<Trophy className="h-5 w-5 text-primary" />}
                                title="Múltiples deportes"
                                description="Fútbol, tenis, pádel, básquet, vóley y más. Todo en un solo lugar."
                            />
                            <FeatureCard
                                icon={<Clock className="h-5 w-5 text-success" />}
                                title="Disponibilidad en tiempo real"
                                description="Consulta horarios actualizados y reserva al instante sin sorpresas."
                            />
                            <FeatureCard
                                icon={<MapPin className="h-5 w-5 text-secondary" />}
                                title="Múltiples sedes"
                                description="Encuentra la cancha más cercana y compara precios entre complejos."
                            />
                            <FeatureCard
                                icon={<Shield className="h-5 w-5 text-warning" />}
                                title="Reserva segura"
                                description="Tu reserva queda confirmada al instante. Cancelación flexible."
                            />
                            <FeatureCard
                                icon={<Users className="h-5 w-5 text-danger" />}
                                title="Gestión de equipos"
                                description="Organiza partidos, invita amigos y gestiona tus reservas grupales."
                            />
                            <FeatureCard
                                icon={<Zap className="h-5 w-5 text-primary" />}
                                title="Panel administrativo"
                                description="Si tienes un complejo, gestiona reservas, precios y horarios fácilmente."
                            />
                        </div>
                    </div>
                </section>

                {/* ===== CTA FOR OWNERS ===== */}
                <section className="px-6 py-20 bg-white">
                    <div className="mx-auto max-w-4xl">
                        <Card className="bg-gradient-to-br from-foreground to-default-800 text-white overflow-hidden">
                            <CardBody className="relative p-10 md:p-14">
                                <div className="absolute top-0 right-0 h-64 w-64 rounded-full bg-white/5 blur-2xl" />
                                <div className="relative z-10 max-w-lg">
                                    <h2 className="text-2xl font-bold md:text-3xl">
                                        ¿Tienes un complejo deportivo?
                                    </h2>
                                    <p className="mt-4 text-default-300 leading-relaxed">
                                        Digitaliza tu negocio. Recibe reservas online 24/7, reduce cancelaciones
                                        y aumenta la ocupación de tus canchas con nuestro panel de gestión.
                                    </p>
                                    <div className="mt-8 flex flex-wrap gap-3">
                                        <Button
                                            as={Link}
                                            href="/register"
                                            color="primary"
                                            size="lg"
                                            radius="full"
                                            className="font-semibold"
                                        >
                                            Registra tu complejo
                                        </Button>
                                        <Button
                                            as={Link}
                                            href="/facilities"
                                            variant="bordered"
                                            size="lg"
                                            radius="full"
                                            className="font-semibold border-white/30 text-white hover:bg-white/10"
                                        >
                                            Ver demo
                                        </Button>
                                    </div>
                                </div>
                            </CardBody>
                        </Card>
                    </div>
                </section>
            </main>

            <Footer />
        </div>
    );
}

function StepCard({
    step,
    icon,
    title,
    description,
}: {
    step: number;
    icon: React.ReactNode;
    title: string;
    description: string;
}) {
    return (
        <div className="relative flex flex-col items-center text-center animate-slide-up" style={{ animationDelay: `${(step - 1) * 100}ms` }}>
            <div className="relative mb-5">
                <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                    {icon}
                </div>
                <div className="absolute -top-2 -right-2 flex h-6 w-6 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-white">
                    {step}
                </div>
            </div>
            <h3 className="text-lg font-bold">{title}</h3>
            <p className="mt-2 text-sm text-default-500 leading-relaxed">{description}</p>
        </div>
    );
}

function FeatureCard({
    icon,
    title,
    description,
}: {
    icon: React.ReactNode;
    title: string;
    description: string;
}) {
    return (
        <div className="group rounded-2xl border border-divider bg-background p-6 transition-all duration-300 hover:shadow-lg hover:border-primary/20 hover:-translate-y-0.5">
            <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-xl bg-default-100 group-hover:bg-primary/10 transition-colors duration-300">
                {icon}
            </div>
            <h3 className="text-sm font-bold">{title}</h3>
            <p className="mt-2 text-xs text-default-500 leading-relaxed">{description}</p>
        </div>
    );
}
