"use client";

// Clases (admin general, Req. 11.2): todas las clases y sus alumnos, con filtros resueltos en la base.
import { Button, DateRangePicker, Pagination, Spinner, Tab, Tabs } from "@heroui/react";
import { Select, SelectItem } from "@heroui/select";
import { parseDate, type CalendarDate } from "@internationalized/date";
import { useEffect, useMemo, useState } from "react";
import { StaffClassTable } from "@/components/classes/staff-class-table";
import { useAdminClasses, type AdminClassFilters } from "@/hooks/use-classes";
import { useAdminTrainers } from "@/hooks/use-trainer";
import { useSports } from "@/hooks/use-sports";
import { addYearsToDate, todayAr } from "@/lib/ads";

const PAGE_SIZE = 20;
const EMPTY: AdminClassFilters = { trainerId: null, sportId: null, from: "", to: "", status: "ALL" };

export default function AdminClassesPage() {
    const [f, setF] = useState<AdminClassFilters>(EMPTY);
    const [page, setPage] = useState(1);
    const { data, isLoading, isFetching } = useAdminClasses(f, page, PAGE_SIZE);
    const { data: trainers } = useAdminTrainers("", "ALL", 1, 100);
    const { data: sports } = useSports(false);

    // ?trainer=<id> (desde el detalle del entrenador)
    useEffect(() => {
        const t = new URLSearchParams(window.location.search).get("trainer");
        if (t) setF((x) => ({ ...x, trainerId: t }));
    }, []);

    // Historial hasta 2 años atrás; clases futuras hasta 30 días (hora AR)
    const today = todayAr();
    const minDay = addYearsToDate(today, -2);
    const maxDay = useMemo(() => parseDate(today).add({ days: 31 }).toString(), [today]);
    const set = (patch: Partial<AdminClassFilters>) => { setF((x) => ({ ...x, ...patch })); setPage(1); };
    const totalPages = Math.max(1, Math.ceil((data?.total ?? 0) / PAGE_SIZE));
    const hasFilters = JSON.stringify(f) !== JSON.stringify(EMPTY);

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-2xl font-bold">Clases</h1>
                <p className="text-sm text-default-500 mt-1">Todas las clases con entrenadores, sus alumnos y lo que pagó cada uno.</p>
            </div>

            <Tabs aria-label="Estado" size="sm" selectedKey={f.status} onSelectionChange={(k) => set({ status: k as AdminClassFilters["status"] })}>
                <Tab key="ALL" title="Todas" />
                <Tab key="UPCOMING" title="Próximas" />
                <Tab key="DONE" title="Completadas" />
                <Tab key="CANCELLED" title="Canceladas" />
            </Tabs>

            <div className="flex flex-wrap items-end gap-3" role="group" aria-label="Filtros">
                <Select label="Entrenador" size="sm" variant="bordered" className="w-full max-w-[240px]" disallowEmptySelection
                    selectedKeys={[f.trainerId ?? "ALL"]}
                    onSelectionChange={(k: any) => { const v = String(Array.from(k)[0]); set({ trainerId: v === "ALL" ? null : v }); }}>
                    {[{ id: "ALL", name: "Todos los entrenadores" },
                      ...(trainers?.items ?? []).map((t) => ({ id: t.trainerId, name: `${t.firstName} ${t.lastName}` }))]
                        .map((t) => <SelectItem key={t.id}>{t.name}</SelectItem>)}
                </Select>
                <Select label="Deporte" size="sm" variant="bordered" className="w-full max-w-[200px]" disallowEmptySelection
                    selectedKeys={[f.sportId ?? "ALL"]}
                    onSelectionChange={(k: any) => { const v = String(Array.from(k)[0]); set({ sportId: v === "ALL" ? null : v }); }}>
                    {[{ id: "ALL", name: "Todos los deportes" }, ...(sports ?? []).filter((s) => s.classesEnabled)]
                        .map((s) => <SelectItem key={s.id}>{s.name}</SelectItem>)}
                </Select>
                <DateRangePicker label="Fechas de la clase" size="sm" variant="bordered" className="w-full max-w-xs"
                    // Cast: HeroUI trae su copia de @internationalized/date (mismo runtime)
                    minValue={parseDate(minDay) as any} maxValue={parseDate(maxDay) as any}
                    value={f.from && f.to ? { start: parseDate(f.from), end: parseDate(f.to) } as any : null}
                    onChange={(v) => {
                        const r = v as { start: CalendarDate; end: CalendarDate } | null;
                        if (!r) return set({ from: "", to: "" });
                        const from = r.start.toString(); const to = r.end.toString();
                        if (from < minDay || to > maxDay || to < from) return;
                        set({ from, to });
                    }} />
                {hasFilters && <Button size="sm" variant="light" onPress={() => { setF(EMPTY); setPage(1); }}>Quitar filtros</Button>}
            </div>

            {isLoading ? (
                <div className="flex justify-center py-12"><Spinner size="lg" /></div>
            ) : (
                <div className={isFetching ? "opacity-70" : ""}>
                    <StaffClassTable items={data?.items ?? []} view="ADMIN" emptyContent="No hay clases con esos filtros" />
                </div>
            )}
            <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs text-default-500">{data?.total ?? 0} clase{data?.total === 1 ? "" : "s"}</p>
                {totalPages > 1 && <Pagination size="sm" showControls total={totalPages} page={page} onChange={setPage} />}
            </div>
        </div>
    );
}
