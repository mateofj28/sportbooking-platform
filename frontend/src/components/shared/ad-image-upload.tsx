"use client";

import { useId, useRef, useState } from "react";
import { Button, Spinner } from "@heroui/react";
import { ImagePlus, RefreshCw, Trash2 } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useAuthStore } from "@/stores/auth-store";
import { translateError } from "@/lib/error-messages";
import {
    AD_IMAGE_MAX_BYTES, AD_IMAGE_SPECS, AD_IMAGE_TYPES, checkAdImageSize, type AdImageKind,
} from "@/lib/ads";

interface AdImageUploadProps {
    kind: AdImageKind;
    /** URL pública actual ("" si no hay). */
    value: string;
    onChange: (url: string) => void;
    isRequired?: boolean;
    /** Error de validación del formulario (ej. "Subí la imagen"). */
    errorMessage?: string;
}

/** Lee ancho y alto reales de la imagen antes de subirla. */
function readImageSize(file: File): Promise<{ width: number; height: number }> {
    return new Promise((resolve, reject) => {
        const url = URL.createObjectURL(file);
        const img = new Image();
        img.onload = () => { resolve({ width: img.naturalWidth, height: img.naturalHeight }); URL.revokeObjectURL(url); };
        img.onerror = () => { reject(new Error("No se pudo leer la imagen")); URL.revokeObjectURL(url); };
        img.src = url;
    });
}

const EXT: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };

/**
 * Banner de publicidad (bucket "ads"). Antes de subir valida formato, peso (2 MB) y
 * medidas (proporción y ancho mínimo de AD_IMAGE_SPECS); la base y el bucket vuelven a
 * exigir formato, peso y origen de la URL.
 */
export function AdImageUpload({ kind, value, onChange, isRequired, errorMessage }: AdImageUploadProps) {
    const spec = AD_IMAGE_SPECS[kind];
    const inputRef = useRef<HTMLInputElement>(null);
    const [uploading, setUploading] = useState(false);
    const [localError, setLocalError] = useState<string | null>(null);
    const userId = useAuthStore((s) => s.user?.id);
    const labelId = useId();
    const errorId = useId();

    const error = localError ?? errorMessage ?? null;
    const aspect = kind === "desktop" ? "aspect-[24/5]" : "aspect-[2/1] max-w-sm";

    const handleFile = async (file: File | undefined) => {
        if (!file) return;
        setLocalError(null);
        try {
            if (!(AD_IMAGE_TYPES as readonly string[]).includes(file.type)) {
                throw new Error("Formato no permitido. Usá JPG, PNG o WebP.");
            }
            if (file.size > AD_IMAGE_MAX_BYTES) {
                throw new Error(`La imagen pesa ${(file.size / 1024 / 1024).toFixed(1)} MB. El máximo es 2 MB.`);
            }
            const { width, height } = await readImageSize(file);
            const sizeError = checkAdImageSize(kind, width, height);
            if (sizeError) throw new Error(sizeError);

            setUploading(true);
            const path = `${userId ?? "admin"}/${Date.now()}-${kind}.${EXT[file.type]}`;
            const { error: upErr } = await supabase.storage
                .from("ads")
                .upload(path, file, { cacheControl: "31536000", upsert: false, contentType: file.type });
            if (upErr) throw upErr;
            onChange(supabase.storage.from("ads").getPublicUrl(path).data.publicUrl);
        } catch (e) {
            setLocalError(translateError(e, "No se pudo subir la imagen"));
        } finally {
            setUploading(false);
            if (inputRef.current) inputRef.current.value = "";
        }
    };

    return (
        <div role="group" aria-labelledby={labelId} aria-describedby={error ? errorId : undefined}>
            <p id={labelId} className="text-sm text-default-600">
                Imagen para {spec.label}{isRequired ? <span className="text-danger"> *</span> : " (opcional)"}
            </p>
            <p className="mb-2 text-xs text-default-400">
                {spec.width} × {spec.height} px · JPG, PNG o WebP · hasta 2 MB
                {kind === "mobile" && " · Si no la cargás, en celular se usa la de computadora."}
            </p>

            <input
                ref={inputRef}
                type="file"
                accept={AD_IMAGE_TYPES.join(",")}
                className="hidden"
                onChange={(e) => handleFile(e.target.files?.[0])}
            />

            {value ? (
                <div className="space-y-2">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                        src={value}
                        alt={`Vista previa de la imagen para ${spec.label}`}
                        className={`w-full rounded-xl border border-divider object-cover ${aspect}`}
                    />
                    <div className="flex gap-2">
                        <Button size="sm" variant="bordered" startContent={<RefreshCw className="h-4 w-4" />}
                            onPress={() => inputRef.current?.click()} isLoading={uploading}>
                            Cambiar
                        </Button>
                        {!isRequired && (
                            <Button size="sm" variant="light" color="danger" startContent={<Trash2 className="h-4 w-4" />}
                                onPress={() => { setLocalError(null); onChange(""); }}>
                                Quitar
                            </Button>
                        )}
                    </div>
                </div>
            ) : (
                <button
                    type="button"
                    onClick={() => inputRef.current?.click()}
                    disabled={uploading}
                    className={`flex w-full flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed text-default-500 hover:border-primary hover:text-primary disabled:opacity-60 ${aspect} ${error ? "border-danger" : "border-divider"}`}
                >
                    {uploading ? (
                        <>
                            <Spinner size="sm" />
                            <span className="text-xs">Subiendo…</span>
                        </>
                    ) : (
                        <>
                            <ImagePlus className="h-6 w-6" aria-hidden="true" />
                            <span className="text-xs">Subir imagen para {spec.label}</span>
                        </>
                    )}
                </button>
            )}

            {error && <p id={errorId} role="alert" className="mt-1 text-xs text-danger">{error}</p>}
        </div>
    );
}
