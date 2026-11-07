"use client";

// ============================================================
// components/shared/data-table.tsx
// Componente tabla reutilizable con estilos consistentes:
// - Filas compactas (py-2)
// - Header con fondo diferenciado
// - Scroll horizontal automático si hay overflow (responsive)
// - whitespace-nowrap para evitar quiebre de texto en celdas
// ============================================================

import {
    Table,
    type TableProps,
} from "@heroui/react";

/** Tabla estándar del panel admin con estilos consistentes.
 *  El contenedor tiene overflow-x-auto para que en zoom alto
 *  o pantallas estrechas se pueda hacer scroll horizontal
 *  en vez de cortar las columnas. */
export function DataTable({ children, ...props }: TableProps) {
    return (
        <div className="w-full overflow-x-auto rounded-lg">
            <Table
                removeWrapper
                isStriped
                classNames={{
                    th: "bg-default-100 text-default-600 text-xs font-semibold uppercase tracking-wide py-2.5 first:rounded-l-lg last:rounded-r-lg whitespace-nowrap",
                    td: "py-2 text-sm whitespace-nowrap",
                    tr: "hover:bg-default-50 transition-colors",
                    table: "min-w-full",
                }}
                {...props}
            >
                {children}
            </Table>
        </div>
    );
}
