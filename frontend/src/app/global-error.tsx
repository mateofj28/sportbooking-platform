"use client";

/**
 * Último recurso: error en el layout raíz (sin tema ni providers disponibles).
 * Va con estilos en línea porque reemplaza a todo el <html>.
 */
export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
    return (
        <html lang="es-AR">
            <body style={{ margin: 0, fontFamily: "system-ui, sans-serif", background: "#ffffff", color: "#11181c" }}>
                <div role="alert" style={{ minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 24, textAlign: "center" }}>
                    <h1 style={{ fontSize: 24, margin: 0 }}>Algo salió mal</h1>
                    <p style={{ marginTop: 12, maxWidth: 420, color: "#71717a" }}>
                        Ocurrió un error inesperado. Probá de nuevo en un momento.
                    </p>
                    <div style={{ marginTop: 24, display: "flex", gap: 12 }}>
                        <button
                            type="button"
                            onClick={reset}
                            style={{ padding: "10px 18px", borderRadius: 12, border: "none", background: "#006FEE", color: "#ffffff", cursor: "pointer" }}
                        >
                            Reintentar
                        </button>
                        <a href="/" style={{ padding: "10px 18px", borderRadius: 12, border: "1px solid #d4d4d8", color: "#11181c", textDecoration: "none" }}>
                            Volver al inicio
                        </a>
                    </div>
                </div>
            </body>
        </html>
    );
}
