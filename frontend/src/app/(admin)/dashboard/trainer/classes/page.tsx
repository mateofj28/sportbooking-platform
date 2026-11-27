"use client";

// Mis clases (entrenador, Req. 10.2): próximas e historial, alumnos y cancelaciones.
import { Pagination, Spinner, Tab, Tabs } from "@heroui/react";
import { useState } from "react";
import { StaffClassTable } from "@/components/classes/staff-class-table";
import { useTrainerMyClasses } from "@/hooks/use-classes";

const PAGE_SIZE = 20;

export default function TrainerClassesPage() {
    const [scope, setScope] = useState<"UPCOMING" | "HISTORY">("UPCOMING");
    const [page, setPage] = useState(1);
    const { data, isLoading } = useTrainerMyClasses(scope, page, PAGE_SIZE);
    const totalPages = Math.max(1, Math.ceil((data?.total ?? 0) / PAGE_SIZE));

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-2xl font-bold">Mis clases</h1>
                <p className="text-sm text-default-500 mt-1">
                    Las clases que te reservaron. Podés cancelar un lugar o la clase entera en cualquier momento: el alumno recibe el 100%.
                </p>
            </div>
            <Tabs aria-label="Clases" size="sm" selectedKey={scope} onSelectionChange={(k) => { setScope(k as "UPCOMING" | "HISTORY"); setPage(1); }}>
                <Tab key="UPCOMING" title="Próximas" />
                <Tab key="HISTORY" title="Historial" />
            </Tabs>
            {isLoading ? (
                <div className="flex justify-center py-12"><Spinner size="lg" /></div>
            ) : (
                <StaffClassTable items={data?.items ?? []} view="TRAINER"
                    emptyContent={scope === "UPCOMING" ? "No tenés clases próximas" : "Todavía no hay clases en tu historial"} />
            )}
            {totalPages > 1 && (
                <div className="flex justify-center"><Pagination size="sm" showControls total={totalPages} page={page} onChange={setPage} /></div>
            )}
        </div>
    );
}
