"use client";

import { MutationCache, QueryCache, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import { translateErrorInPlace } from "@/lib/error-messages";
import "@/lib/zod-es"; // mensajes de validación de Zod en español

export function QueryProvider({ children }: { children: React.ReactNode }) {
    const [queryClient] = useState(
        () =>
            new QueryClient({
                // Red de seguridad: cualquier error que llegue a la interfaz por React Query
                // queda en español. Corre antes que los onError de cada mutación.
                queryCache: new QueryCache({ onError: translateErrorInPlace }),
                mutationCache: new MutationCache({ onError: translateErrorInPlace }),
                defaultOptions: {
                    queries: {
                        staleTime: 5 * 60 * 1000,    // 5 minutos — base sensata para datos operacionales
                        gcTime: 10 * 60 * 1000,       // 10 minutos en memoria (doble del staleTime)
                        retry: 1,
                        refetchOnWindowFocus: false,  // desactivado globalmente; se activa puntualmente
                        // donde el dato necesita frescura (ej. notificaciones)
                    },
                },
            })
    );

    return (
        <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
}
