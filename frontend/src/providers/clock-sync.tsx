"use client";

// ============================================================
// providers/clock-sync.tsx
// Sincroniza el reloj de la app con el del servidor (ver lib/clock.ts).
// - Al abrir la app, cada 10 min y al volver a la pestaña.
// - Mide el viaje de ida y vuelta y toma el punto medio (error típico: decenas de ms).
// - Si la diferencia cambió más de 1 minuto (PC con la hora mal en la primera visita),
//   vuelve a montar la app una vez para que todas las pantallas usen la hora corregida.
// - Si la red falla, se queda con la última diferencia conocida.
// ============================================================

import { Fragment, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { setServerOffset } from "@/lib/clock";

const RESYNC_MS = 10 * 60 * 1000;
const REMOUNT_THRESHOLD_MS = 60 * 1000;

async function measureOffset(): Promise<number | null> {
    const t0 = Date.now();
    const { data, error } = await (supabase.rpc as any)("server_now");
    const t1 = Date.now();
    if (error || !data) return null;
    const server = new Date(data as string).getTime();
    if (!Number.isFinite(server)) return null;
    return server - (t0 + t1) / 2;
}

export function ClockSync({ children }: { children: React.ReactNode }) {
    const [generation, setGeneration] = useState(0);

    useEffect(() => {
        let cancelled = false;
        const sync = async () => {
            const offset = await measureOffset().catch(() => null);
            if (cancelled || offset === null) return;
            const delta = setServerOffset(offset);
            if (delta > REMOUNT_THRESHOLD_MS) setGeneration((g) => g + 1);
        };
        void sync();
        const timer = setInterval(sync, RESYNC_MS);
        const onVisible = () => { if (document.visibilityState === "visible") void sync(); };
        document.addEventListener("visibilitychange", onVisible);
        return () => {
            cancelled = true;
            clearInterval(timer);
            document.removeEventListener("visibilitychange", onVisible);
        };
    }, []);

    return <Fragment key={generation}>{children}</Fragment>;
}
