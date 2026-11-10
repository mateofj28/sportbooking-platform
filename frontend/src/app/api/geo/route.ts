// ============================================================
// GET /api/geo
//
// Provincia APROXIMADA del visitante según su IP. Respaldo para cuando el GPS
// no está disponible o el usuario no da permiso (ver hooks/use-current-province.ts).
//
// Vercel agrega a cada pedido la geolocalización de la IP:
//   x-vercel-ip-country         -> ISO 3166-1, ej. "AR"
//   x-vercel-ip-country-region  -> parte regional del ISO 3166-2, ej. "X" (Córdoba)
// Con eso se arma "AR-X", el mismo código que usa la base.
//
// No se guarda ni se reenvía nada. Fuera de Vercel (desarrollo local) los headers
// no existen y la respuesta es { province: null }.
// Precisión: aproximada. En Argentina muchas conexiones móviles salen por Buenos
// Aires, por eso el GPS tiene prioridad.
// ============================================================

import { NextResponse, type NextRequest } from "next/server";
import { isProvinceCode } from "@/lib/ar-provinces";

export const dynamic = "force-dynamic"; // depende de cada visitante: nunca prerenderizar

export function GET(req: NextRequest) {
    const country = req.headers.get("x-vercel-ip-country")?.toUpperCase();
    const region = req.headers.get("x-vercel-ip-country-region")?.toUpperCase();
    const code = country === "AR" && region ? `AR-${region}` : null;

    return NextResponse.json(
        { province: code && isProvinceCode(code) ? code : null, source: "ip" },
        // Privado y sin caché: la respuesta es de este visitante y puede cambiar si se mueve
        { headers: { "Cache-Control": "private, no-store" } },
    );
}
