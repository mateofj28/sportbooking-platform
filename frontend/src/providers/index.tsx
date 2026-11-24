"use client";

import { HeroUIProviderWrapper } from "./heroui-provider";
import { QueryProvider } from "./query-provider";
import { AuthHydration } from "./auth-hydration";
import { ClockSync } from "./clock-sync";

export function Providers({ children }: { children: React.ReactNode }) {
    return (
        <QueryProvider>
            <HeroUIProviderWrapper>
                <AuthHydration>
                    {/* Hora del servidor y "hoy" de Argentina para toda la app (lib/clock.ts) */}
                    <ClockSync>{children}</ClockSync>
                </AuthHydration>
            </HeroUIProviderWrapper>
        </QueryProvider>
    );
}
