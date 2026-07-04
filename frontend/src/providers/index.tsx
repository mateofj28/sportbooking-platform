"use client";

import { HeroUIProviderWrapper } from "./heroui-provider";
import { QueryProvider } from "./query-provider";
import { AuthHydration } from "./auth-hydration";

export function Providers({ children }: { children: React.ReactNode }) {
    return (
        <QueryProvider>
            <HeroUIProviderWrapper>
                <AuthHydration>{children}</AuthHydration>
            </HeroUIProviderWrapper>
        </QueryProvider>
    );
}
