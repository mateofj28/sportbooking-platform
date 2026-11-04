"use client";

import { useRef, useState } from "react";
import { Spinner } from "@heroui/react";
import { ImagePlus, X } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useAuthStore } from "@/stores/auth-store";
import { useToastStore } from "@/stores/toast-store";

type StorageBucket = "venues" | "facilities" | "avatars";

interface ImageUploadProps {
    /** URL actual de la imagen (si ya hay una). */
    value?: string;
    /** Se llama con la URL pública subida (o "" al quitar). */
    onChange: (url: string) => void;
    /** Bucket de Supabase Storage donde se sube. */
    bucket?: StorageBucket;
    label?: string;
}

/**
 * Sube una imagen a Supabase Storage y devuelve la URL pública.
 * Reemplaza la subida a Cloudinary via NestJS.
 * Valida tipo (solo imágenes) y tamaño (máx 5 MB) antes de subir.
 */
export function ImageUpload({
    value,
    onChange,
    bucket = "venues",
    label = "Foto del complejo",
}: ImageUploadProps) {
    const inputRef = useRef<HTMLInputElement>(null);
    const [uploading, setUploading] = useState(false);
    const addToast = useToastStore((s) => s.addToast);
    const userId = useAuthStore((s) => s.user?.id);

    const handleFile = async (file: File | undefined) => {
        if (!file) return;

        // Validar tipo
        const ALLOWED = ["image/jpeg", "image/png", "image/webp", "image/gif"];
        if (!ALLOWED.includes(file.type)) {
            addToast("Formato no permitido. Usa JPG, PNG, WEBP o GIF");
            return;
        }

        // Validar tamaño (5 MB)
        if (file.size > 5 * 1024 * 1024) {
            addToast("La imagen supera los 5 MB");
            return;
        }

        setUploading(true);
        try {
            // Path con prefijo por scope:
            // - avatars: "{user_id}/{timestamp}.ext"   (RLS scope por usuario)
            // - venues/facilities: "{scope_id}/{timestamp}.ext"
            const ext = file.name.split(".").pop() ?? "jpg";
            const prefix = bucket === "avatars" ? userId ?? "unknown" : userId ?? "unknown";
            const path = `${prefix}/${Date.now()}.${ext}`;

            // Subir el archivo
            const { error: uploadError } = await supabase.storage
                .from(bucket)
                .upload(path, file, {
                    cacheControl: "3600",
                    upsert: true,
                });

            if (uploadError) throw uploadError;

            // Obtener URL pública
            const { data } = supabase.storage.from(bucket).getPublicUrl(path);
            onChange(data.publicUrl);
        } catch (e: any) {
            console.error("ImageUpload error:", e);
            addToast(e?.message ?? "No se pudo subir la imagen");
        } finally {
            setUploading(false);
            if (inputRef.current) inputRef.current.value = "";
        }
    };

    return (
        <div>
            <p className="text-xs text-default-500 mb-2">{label}</p>
            <input
                ref={inputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp,image/gif"
                className="hidden"
                onChange={(e) => handleFile(e.target.files?.[0])}
            />

            {value ? (
                <div className="relative h-40 w-full overflow-hidden rounded-xl border border-divider">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={value} alt="Vista previa" className="h-full w-full object-cover" />
                    <div className="absolute inset-0 flex items-end justify-between gap-2 bg-gradient-to-t from-black/50 to-transparent p-2">
                        <button
                            type="button"
                            onClick={() => inputRef.current?.click()}
                            className="rounded-lg bg-white/90 px-3 py-1.5 text-xs font-medium text-default-700 hover:bg-white"
                        >
                            Cambiar
                        </button>
                        <button
                            type="button"
                            onClick={() => onChange("")}
                            className="rounded-lg bg-white/90 p-1.5 text-danger hover:bg-white"
                            aria-label="Quitar imagen"
                        >
                            <X className="h-4 w-4" />
                        </button>
                    </div>
                </div>
            ) : (
                <button
                    type="button"
                    onClick={() => inputRef.current?.click()}
                    disabled={uploading}
                    className="flex h-40 w-full flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-divider text-default-500 transition-colors hover:border-primary hover:text-primary disabled:opacity-60"
                >
                    {uploading ? (
                        <>
                            <Spinner size="sm" />
                            <span className="text-xs">Subiendo...</span>
                        </>
                    ) : (
                        <>
                            <ImagePlus className="h-6 w-6" />
                            <span className="text-xs">Subir imagen (JPG, PNG, WEBP · máx 5 MB)</span>
                        </>
                    )}
                </button>
            )}
        </div>
    );
}
