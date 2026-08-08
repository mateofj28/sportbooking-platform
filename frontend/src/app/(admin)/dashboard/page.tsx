"use client";

import { Card, CardBody } from "@heroui/react";
import { useAuthStore } from "@/stores/auth-store";
import { useState, useEffect, useCallback } from "react";

const ADS = [
    {
        title: "🏆 Torneo de Fútbol 5",
        subtitle: "Inscripciones abiertas",
        description: "Organiza tu equipo y participa en el torneo de verano. Premios para los 3 primeros lugares.",
        bg: "from-blue-500 to-blue-700",
    },
    {
        title: "🎾 Clases de Tenis",
        subtitle: "Nuevos horarios disponibles",
        description: "Aprende con nuestros profesores certificados. Nivel principiante a avanzado.",
        bg: "from-emerald-500 to-emerald-700",
    },
    {
        title: "🏸 Descuento en Pádel",
        subtitle: "30% OFF en horarios matutinos",
        description: "Reserva antes de las 12pm y obtén descuento automático. Válido hasta fin de mes.",
        bg: "from-violet-500 to-violet-700",
    },
    {
        title: "🏀 Liga de Básquet",
        subtitle: "Temporada 2026",
        description: "Forma tu equipo de 5 jugadores y compite cada sábado. ¡Cupos limitados!",
        bg: "from-orange-500 to-orange-700",
    },
    {
        title: "⚡ SportBooking Pro",
        subtitle: "Próximamente",
        description: "Gestión avanzada, reportes exportables, multi-sede y mucho más. Sé el primero en probarlo.",
        bg: "from-pink-500 to-pink-700",
    },
];

export default function DashboardPage() {
    const { user } = useAuthStore();
    const [activeIndex, setActiveIndex] = useState(0);

    const nextSlide = useCallback(() => {
        setActiveIndex((prev) => (prev + 1) % ADS.length);
    }, []);

    // Auto-slide every 5 seconds
    useEffect(() => {
        const interval = setInterval(nextSlide, 5000);
        return () => clearInterval(interval);
    }, [nextSlide]);

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

          {/* Ad Carousel */}
          <div className="relative overflow-hidden rounded-2xl">
              <div
                  className="flex transition-transform duration-700 ease-in-out"
                  style={{ transform: `translateX(-${activeIndex * 100}%)` }}
              >
                  {ADS.map((ad, i) => (
                      <div key={i} className="w-full flex-shrink-0">
                          <Card className={`bg-gradient-to-r ${ad.bg} border-none shadow-lg`}>
                              <CardBody className="p-8 md:p-12">
                                  <p className="text-xs font-semibold text-white/70 uppercase tracking-wider">
                                      {ad.subtitle}
                                  </p>
                                  <h2 className="mt-2 text-2xl font-bold text-white md:text-3xl">
                                      {ad.title}
                                  </h2>
                                  <p className="mt-3 max-w-md text-sm text-white/80 leading-relaxed">
                                      {ad.description}
                                  </p>
                              </CardBody>
                          </Card>
              </div>
          ))}
              </div>

              {/* Dots */}
              <div className="flex justify-center gap-2 mt-4">
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
      </div>
  );
}
