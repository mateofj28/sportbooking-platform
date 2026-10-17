"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

export interface PromoSlide {
    title: string;
    subtitle: string;
    description: string;
    /** clases de gradiente tailwind, ej: "from-blue-500 to-blue-700" */
    bg: string;
}

interface PromoCarouselProps {
    slides: PromoSlide[];
    /** ms entre auto-avances. 0 desactiva el auto-play. */
    autoPlayMs?: number;
}

/**
 * Carrusel de publicidad con:
 * - auto-play (se pausa al interactuar o al pasar el mouse)
 * - swipe táctil (móvil/tablet) y arrastre con mouse (web) vía Pointer Events
 * - flechas (desktop) y dots
 * Accesible y responsive.
 */
export function PromoCarousel({ slides, autoPlayMs = 4000 }: PromoCarouselProps) {
    const [index, setIndex] = useState(0);
    const [dragPx, setDragPx] = useState(0); // desplazamiento mientras se arrastra
    const containerRef = useRef<HTMLDivElement>(null);
    const dragState = useRef<{ startX: number; dragging: boolean; width: number }>({
        startX: 0,
        dragging: false,
        width: 0,
    });
    const [paused, setPaused] = useState(false);

    const count = slides.length;
    const goTo = useCallback((i: number) => setIndex(((i % count) + count) % count), [count]);
    const next = useCallback(() => goTo(index + 1), [goTo, index]);
    const prev = useCallback(() => goTo(index - 1), [goTo, index]);

    // Auto-play, en pausa mientras el usuario interactúa
    useEffect(() => {
        if (!autoPlayMs || paused || count <= 1) return;
        const t = setInterval(() => setIndex((p) => (p + 1) % count), autoPlayMs);
        return () => clearInterval(t);
    }, [autoPlayMs, paused, count]);

    // --- Gestos (pointer events: cubren mouse + touch) ---
    const onPointerDown = (e: React.PointerEvent) => {
        dragState.current = {
            startX: e.clientX,
            dragging: true,
            width: containerRef.current?.offsetWidth || 1,
        };
        setPaused(true);
        (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    };

    const onPointerMove = (e: React.PointerEvent) => {
        if (!dragState.current.dragging) return;
        setDragPx(e.clientX - dragState.current.startX);
    };

    const endDrag = () => {
        if (!dragState.current.dragging) return;
        const { width } = dragState.current;
        const threshold = width * 0.2; // 20% del ancho para cambiar de slide
        if (dragPx <= -threshold) next();
        else if (dragPx >= threshold) prev();
        dragState.current.dragging = false;
        setDragPx(0);
        // Reanudar auto-play un rato después
        setTimeout(() => setPaused(false), 600);
    };

    if (count === 0) return null;

    // Porcentaje de desplazamiento del track + ajuste por arrastre
    const dragPercent = dragState.current.width
        ? (dragPx / dragState.current.width) * 100
        : 0;
    const translate = -index * 100 + dragPercent;

    return (
        <div
            className="relative"
            onMouseEnter={() => setPaused(true)}
            onMouseLeave={() => setPaused(false)}
        >
            <div
                ref={containerRef}
                className="overflow-hidden rounded-2xl touch-pan-y select-none"
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={endDrag}
                onPointerCancel={endDrag}
                onPointerLeave={endDrag}
                style={{ cursor: dragState.current.dragging ? "grabbing" : "grab" }}
            >
                <div
                    className="flex"
                    style={{
                        transform: `translateX(${translate}%)`,
                        transition: dragState.current.dragging ? "none" : "transform 400ms ease",
                    }}
                >
                    {slides.map((ad, i) => (
                        <div key={i} className="w-full flex-shrink-0 px-0.5">
                            <div className={`rounded-2xl bg-gradient-to-r ${ad.bg} border-none shadow-lg`}>
                                <div className="p-6">
                                    <p className="text-xs font-semibold uppercase tracking-wider text-white/70">{ad.subtitle}</p>
                                    <h3 className="mt-1 text-lg font-bold text-white">{ad.title}</h3>
                                    <p className="mt-2 text-sm text-white/80">{ad.description}</p>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {/* Flechas: solo desktop/tablet (ocultas en móvil, donde se usa swipe) */}
            {count > 1 && (
                <>
                    <button
                        type="button"
                        onClick={prev}
                        aria-label="Anterior"
                        className="absolute left-2 top-1/2 hidden -translate-y-1/2 items-center justify-center rounded-full bg-white/80 p-1.5 text-default-700 shadow-md transition hover:bg-white sm:flex"
                    >
                        <ChevronLeft className="h-5 w-5" />
                    </button>
                    <button
                        type="button"
                        onClick={next}
                        aria-label="Siguiente"
                        className="absolute right-2 top-1/2 hidden -translate-y-1/2 items-center justify-center rounded-full bg-white/80 p-1.5 text-default-700 shadow-md transition hover:bg-white sm:flex"
                    >
                        <ChevronRight className="h-5 w-5" />
                    </button>
                </>
            )}

            {/* Dots */}
            {count > 1 && (
                <div className="mt-3 flex justify-center gap-2">
                    {slides.map((_, i) => (
                        <button
                            key={i}
                            type="button"
                            onClick={() => goTo(i)}
                            className={`h-2 rounded-full transition-all ${i === index ? "w-6 bg-primary" : "w-2 bg-default-300 hover:bg-default-400"}`}
                            aria-label={`Promoción ${i + 1}`}
                        />
                    ))}
                </div>
            )}
        </div>
    );
}
