"use client";

// ============================================================
// components/shared/data-table.tsx
// Componente tabla reutilizable con estilos consistentes:
// - Filas compactas (py-2 en lugar del default py-3)
// - Header con fondo ligeramente diferenciado del body
// - Columnas con whitespace-nowrap para evitar quiebre de texto
// - removeWrapper por defecto para integrarse con cualquier layout
//
// USO:
//   <DataTable aria-label="Usuarios">
//     <TableHeader>...</TableHeader>
//     <TableBody>...</TableBody>
//   </DataTable>
// ============================================================

import {
    Table,
    type TableProps,
} from "@heroui/react";

/** Tabla estándar del panel admin con estilos consistentes. */
export function DataTable({ children, ...props }: TableProps) {
    return (
        <Table
            removeWrapper
            isStriped
            classNames={{
                th: "bg-default-100 text-default-600 text-xs font-semibold uppercase tracking-wide py-2.5 first:rounded-l-lg last:rounded-r-lg whitespace-nowrap",
                td: "py-2 text-sm whitespace-nowrap",
                tr: "hover:bg-default-50 transition-colors",
            }}
            {...props}
        >
            {children}
        </Table>
    );
}
