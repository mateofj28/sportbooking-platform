"use client";

import { Card, CardBody } from "@heroui/react";
import { useAuthStore } from "@/stores/auth-store";
import { useState, useEffect, useCallback } from "react";

const ADS = [
    {
        title: "🏆 Torneo de Fútbol 5",
        subtitle: "Inscripciones abiertas",
        description: "Organiza tu equipo y participa en el torneo de verano.",
        bg: "from-blue-500 to-blue-700",
    },
    {
        title: "🎾 Clases de Tenis",
        subtitle: "Nuevos horarios",
        description: "Aprende con profesores certificados. Todos los niveles.",
        bg: "from-emerald-500 to-emerald-700",
    },
    {
        title: "🏸 30% OFF Pádel",
        subtitle: "Horarios matutinos",
        description: "Reserva antes de las 12pm y obtén descuento automático.",
        bg: "from-violet-500 to-violet-700",
    },
    {
        title: "🏀 Liga de Básquet",
        subtitle: "Temporada 2026",
        description: "Forma tu equipo de 5 y compite cada sábado.",
        bg: "from-orange-500 to-orange-700",
    },
    {
        title: "⚡ SportBooking Pro",
        subtitle: "Próximamente",
        description: "Gestión avanzada, reportes y multi-sede.",
        bg: "from-pink-500 to-pink-700",
    },
];

export default function DashboardPage() {
    const { user } = useAuthStore();
    const [activeIndex, setActiveIndex] = useState(0);

    const nextSlide = useCallback(() => {
        setActiveIndex((prev) => (prev + 1) % ADS.length);
    }, []);

    useEffect(() => {
      const interval = setInterval(nextSlide, 4000);
      return () => clearInterval(interval);
  }, [nextSlide]);

    const getCardIndex = (offset: number) => {
        return (activeIndex + offset + ADS.length) % ADS.length;
    };

    return (
        <div className="space-y-8 animate-fade-in">
            <div>
                <h1 className="text-2xl font-bold">
                    Hola, {user?.firstName} 👋
                </h1>
                <p className="text-sm text-default-500 mt-1">
                    Bienvenido al panel de administración de SportBooking
                </p>
            </div>

          {/* Carousel - 3 visible, center highlighted */}
          <div className="relative flex items-center justify-center gap-3 overflow-hidden py-2">
              {/* Left card (partial) */}
              <div className="w-[20%] flex-shrink-0 opacity-50 scale-90 transition-all duration-500">
                  <AdCard ad={ADS[getCardIndex(-1)]} compact />
              </div>

              {/* Center card (main) */}
              <div className="w-[56%] flex-shrink-0 scale-100 transition-all duration-500 z-10">
                  <AdCard ad={ADS[activeIndex]} />
              </div>

              {/* Right card (partial) */}
              <div className="w-[20%] flex-shrink-0 opacity-50 scale-90 transition-all duration-500">
                  <AdCard ad={ADS[getCardIndex(1)]} compact />
              </div>
          </div>

          {/* Dots */}
          <div className="flex justify-center gap-2">
              {ADS.map((_, i) => (
                  <button
                      key={i}
                      onClick={() => setActiveIndex(i)}
                className={`h-2 rounded-full transition-all duration-300 ${i === activeIndex
                        ? "w-6 bg-primary"
                        : "w-2 bg-default-300 hover:bg-default-400"
                    }`}
                aria-label={`Slide ${i + 1}`}
            />
        ))}
      </div>
      </div>
  );
}

function AdCard({ ad, compact = false }: { ad: typeof ADS[0]; compact?: boolean }) {
    return (
        <Card className={`bg-gradient-to-r ${ad.bg} border-none shadow-lg overflow-hidden`}>
            <CardBody className={compact ? "p-4" : "p-6"}>
                <p className={`font-semibold text-white/70 uppercase tracking-wider ${compact ? "text-[9px]" : "text-xs"}`}>
                    {ad.subtitle}
                </p>
                <h3 className={`font-bold text-white mt-1 ${compact ? "text-sm" : "text-lg"}`}>
                    {ad.title}
                </h3>
                {!compact && (
                    <p className="mt-2 text-sm text-white/80 leading-relaxed">
                        {ad.description}
                    </p>
                )}
            </CardBody>
        </Card>
    );
}
