"use client";

import { useState } from "react";
import { Trophy } from "lucide-react";

interface MediaImageProps {
    /** URL de la foto real (Supabase Storage). Si falta o falla al cargar, se muestra el fondo por defecto. */
    src?: string | null;
    alt: string;
    /** Clases del contenedor (alto, bordes, etc.). */
    className?: string;
    /** Clases de la imagen real (por ejemplo, el zoom al hacer hover). */
    imgClassName?: string;
}

/**
 * Imagen con fondo por defecto.
 * Sin fotos de stock ni URLs externas: el fallback es un degradado de marca con
 * las líneas de una cancha dibujadas en SVG, así nunca queda una imagen rota.
 */
export function MediaImage({ src, alt, className = "", imgClassName = "" }: MediaImageProps) {
    const [failedSrc, setFailedSrc] = useState<string | null>(null);
    const showImage = !!src && failedSrc !== src;

    return (
        <div className={`relative overflow-hidden ${className}`}>
            {showImage ? (
                <img
                    src={src!}
                    alt={alt}
                    loading="lazy"
                    onError={() => setFailedSrc(src!)}
                    className={`h-full w-full object-cover ${imgClassName}`}
                />
            ) : (
                <DefaultCover label={alt} />
            )}
        </div>
    );
}

function DefaultCover({ label }: { label: string }) {
    return (
        <div
            role="img"
            aria-label={label}
            className="relative flex h-full w-full items-center justify-center bg-gradient-to-br from-primary-500 via-primary-600 to-primary-800"
        >
            {/* Líneas de cancha */}
            <svg
                aria-hidden="true"
                className="absolute inset-0 h-full w-full text-white/15"
                viewBox="0 0 400 200"
                preserveAspectRatio="xMidYMid slice"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
            >
                <rect x="30" y="20" width="340" height="160" rx="6" />
                <line x1="200" y1="20" x2="200" y2="180" />
                <circle cx="200" cy="100" r="32" />
                <rect x="30" y="60" width="52" height="80" />
                <rect x="318" y="60" width="52" height="80" />
            </svg>
            <div className="relative flex h-14 w-14 items-center justify-center rounded-2xl bg-white/15 backdrop-blur-[2px]">
                <Trophy className="h-7 w-7 text-white/90" aria-hidden="true" />
            </div>
        </div>
    );
}
