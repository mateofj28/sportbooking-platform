"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { ActiveAdvertisement } from "@/lib/ads";

export interface PromoSlide {
    /** Identificador estable (key de React). */
    id?: string;
    /** Qué dice la imagen (lectores de pantalla). */
    alt: string;
    /** Banner para computadora (proporción 1920×400). */
    image: string;
    /** Banner para celular (proporción 1080×540). Si falta, se usa el de computadora. */
    imageMobile?: string | null;
    /** https://... (se abre en pestaña nueva) o ruta interna "/facilities". */
    href?: string | null;
}

/** Anuncio de la base (RPC) -> slide del carrusel. Una sola conversión para toda la app. */
export function adToSlide(ad: ActiveAdvertisement): PromoSlide {
    return {
        id: ad.id,
        alt: ad.altText,
        image: ad.imageUrl,
        imageMobile: ad.imageMobileUrl,
        href: ad.linkUrl,
    };
}

/** Imagen del banner: versión de celular (< 640 px) si existe, y la de computadora. */
function SlideImage({ slide }: { slide: PromoSlide }) {
    // Recuadro con la proporción del banner: 1920×400 (24:5) o, en celular, 1080×540 (2:1)
    const box = slide.imageMobile ? "aspect-[2/1] sm:aspect-[24/5]" : "aspect-[24/5]";
    return (
        <picture className={`block w-full overflow-hidden rounded-2xl bg-content2 ${box}`}>
            {slide.imageMobile && <source media="(max-width: 639px)" srcSet={slide.imageMobile} />}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
                src={slide.image}
                alt={slide.alt}
                draggable={false}
                loading="lazy"
                decoding="async"
                className="h-full w-full object-cover"
            />
        </picture>
    );
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
    // true si el puntero se movió lo suficiente como para considerarse arrastre (no clic)
    const movedRef = useRef(false);

    const count = slides.length;
    const goTo = useCallback((i: number) => setIndex(((i % count) + count) % count), [count]);
    const next = useCallback(() => goTo(index + 1), [goTo, index]);
    const prev = useCallback(() => goTo(index - 1), [goTo, index]);

    // Si la lista se acorta (p. ej. cambió la provincia), volver a una posición válida
    useEffect(() => {
        if (count > 0 && index >= count) setIndex(0);
    }, [count, index]);

    // Auto-play, en pausa mientras el usuario interactúa
    useEffect(() => {
        if (!autoPlayMs || paused || count <= 1) return;
        const t = setInterval(() => setIndex((p) => (p + 1) % count), autoPlayMs);
        return () => clearInterval(t);
    }, [autoPlayMs, paused, count]);

    // --- Gestos (pointer events: cubren mouse + touch) ---
    const onPointerDown = (e: React.PointerEvent) => {
        movedRef.current = false;
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
        const dx = e.clientX - dragState.current.startX;
        if (Math.abs(dx) > 5) movedRef.current = true;
        setDragPx(dx);
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
                    {slides.map((ad, i) => {
                        const content = <SlideImage slide={ad} />;
                        const cardClass = "block rounded-2xl";
                        const isExternal = !!ad.href && ad.href.startsWith("https://");

                        return (
                            <div key={ad.id ?? i} className="w-full flex-shrink-0 px-0.5">
                                {ad.href ? (
                                    <a
                                        href={ad.href}
                                        draggable={false}
                                        {...(isExternal ? { target: "_blank", rel: "noopener noreferrer" } : {})}
                                        // Si el gesto fue un arrastre, no navegar
                                        onClick={(e) => { if (movedRef.current) e.preventDefault(); }}
                                        className={`${cardClass} focus:outline-none focus-visible:ring-2 focus-visible:ring-primary`}
                                    >
                                        {content}
                                    </a>
                                ) : (
                                    <div className={cardClass}>{content}</div>
                                )}
                            </div>
                        );
                    })}
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
