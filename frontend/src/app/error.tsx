"use client";

import { Button } from "@heroui/react";
import { AlertTriangle, ArrowLeft, RotateCcw } from "lucide-react";
import { useEffect } from "react";

/**
 * Pantalla para errores inesperados dentro de la app (reemplaza la de Next.js,
 * que está en inglés: "Application error: a client-side exception has occurred").
 */
export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
    useEffect(() => {
        console.error(error);
    }, [error]);

    return (
        <div role="alert" className="flex min-h-screen flex-col items-center justify-center bg-background px-6 text-center">
            <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-2xl bg-danger/10">
                <AlertTriangle className="h-10 w-10 text-danger" aria-hidden="true" />
            </div>
            <h1 className="text-2xl font-bold text-foreground">Algo salió mal</h1>
            <p className="mt-3 max-w-md text-default-500">
                Ocurrió un error inesperado al mostrar esta pantalla. Probá de nuevo; si se repite,
                escribinos desde Ayuda y soporte.
            </p>
            {error.digest && <p className="mt-2 text-xs text-default-400">Código: {error.digest}</p>}
            <div className="mt-8 flex gap-3">
                <Button color="primary" startContent={<RotateCcw className="h-4 w-4" />} onPress={reset}>
                    Reintentar
                </Button>
                <Button as="a" href="/" variant="bordered" startContent={<ArrowLeft className="h-4 w-4" />}>
                    Volver al inicio
                </Button>
            </div>
        </div>
    );
}
