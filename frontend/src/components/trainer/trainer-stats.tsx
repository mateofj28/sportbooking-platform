"use client";

// Estadísticas de clases (Req. 11.4): admin general (todo, con comisión y por entrenador) y
// entrenador (lo suyo, sin comisión). Mismas reglas AR que las canchas: actividad por día de
// inicio, dinero por día de fin (pagado y terminado).
import { Card, CardBody, DateRangePicker, Spinner, TableBody, TableCell, TableColumn, TableHeader, TableRow } from "@heroui/react";
import { Select, SelectItem } from "@heroui/select";
import { parseDate, type CalendarDate } from "@internationalized/date";
import { useState } from "react";
import { DataTable } from "@/components/shared/data-table";
import { useAdminTrainers } from "@/hooks/use-trainer";
import { useSports } from "@/hooks/use-sports";
import { useTrainerStats, type StatsRange } from "@/hooks/use-trainer-money";
import { addYearsToDate, todayAr } from "@/lib/ads";
import { formatPoints } from "@/lib/points";

const RANGES: { key: StatsRange; label: string }[] = [
    { key: "today", label: "Hoy" },
    { key: "yesterday", label: "Ayer" },
    { key: "week", label: "Últimos 7 días" },
    { key: "month", label: "Últimos 30 días" },
    { key: "custom", label: "Personalizado" },
    { key: "all", label: "Todo" },
];

export function TrainerStatsView({ admin }: { admin: boolean }) {
    const [range, setRange] = useState<StatsRange>("month");
    const [from, setFrom] = useState("");
    const [to, setTo] = useState("");
    const [trainerId, setTrainerId] = useState<string | null>(null);
    const [sportId, setSportId] = useState<string | null>(null);
    const { data, isLoading, isFetching } = useTrainerStats({ range, from, to, trainerId, sportId });
    const { data: trainers } = useAdminTrainers("", "ALL", 1, 100, admin);
    const { data: sports } = useSports(false);
    const today = todayAr();
    const minDay = addYearsToDate(today, -2);
    const t = data?.totals;

    return (
        <div className="space-y-6">
            <div className="flex flex-wrap items-end gap-3" role="group" aria-label="Filtros">
                <Select label="Período" size="sm" variant="bordered" className="w-full max-w-[200px]" disallowEmptySelection
                    selectedKeys={[range]} onSelectionChange={(k: any) => setRange(String(Array.from(k)[0]) as StatsRange)}>
                    {RANGES.map((r) => <SelectItem key={r.key}>{r.label}</SelectItem>)}
                </Select>
                {range === "custom" && (
                    <DateRangePicker label="Fechas" size="sm" variant="bordered" className="w-full max-w-xs"
                        // Cast: HeroUI trae su copia de @internationalized/date (mismo runtime)
                        minValue={parseDate(minDay) as any} maxValue={parseDate(today) as any}
                        value={from && to ? { start: parseDate(from), end: parseDate(to) } as any : null}
                        onChange={(v) => {
                            const r = v as { start: CalendarDate; end: CalendarDate } | null;
                            setFrom(r?.start.toString() ?? ""); setTo(r?.end.toString() ?? "");
                        }} />
                )}
                {admin && (
                    <Select label="Entrenador" size="sm" variant="bordered" className="w-full max-w-[240px]" disallowEmptySelection
                        selectedKeys={[trainerId ?? "ALL"]}
                        onSelectionChange={(k: any) => { const v = String(Array.from(k)[0]); setTrainerId(v === "ALL" ? null : v); }}>
                        {[{ id: "ALL", name: "Todos los entrenadores" },
                          ...(trainers?.items ?? []).map((x) => ({ id: x.trainerId, name: `${x.firstName} ${x.lastName}` }))]
                            .map((x) => <SelectItem key={x.id}>{x.name}</SelectItem>)}
                    </Select>
                )}
                <Select label="Deporte" size="sm" variant="bordered" className="w-full max-w-[200px]" disallowEmptySelection
                    selectedKeys={[sportId ?? "ALL"]}
                    onSelectionChange={(k: any) => { const v = String(Array.from(k)[0]); setSportId(v === "ALL" ? null : v); }}>
                    {[{ id: "ALL", name: "Todos los deportes" }, ...(sports ?? []).filter((s) => s.classesEnabled)]
                        .map((s) => <SelectItem key={s.id}>{s.name}</SelectItem>)}
                </Select>
            </div>

            {isLoading || !t ? (
                range === "custom" && (!from || !to)
                    ? <p className="text-sm text-default-500">Elegí las fechas del período.</p>
                    : <div className="flex justify-center py-12"><Spinner size="lg" /></div>
            ) : (
                <div className={`space-y-6 ${isFetching ? "opacity-70" : ""}`}>
                    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                        <Stat label="Reservas de clases" value={String(t.total)} sub={`${t.canceladas} canceladas`} />
                        <Stat label="Realizadas" value={String(t.realizadas)} sub="Pagadas, la clase no terminó" />
                        <Stat label="Completadas" value={String(t.completadas)} sub={`${t.uniqueStudents} alumnos distintos`} />
                        <Stat label={admin ? "Ingresos de entrenadores" : "Ganado"} value={formatPoints(Number(t.earned))} sub="Clases terminadas, por día de fin" />
                        {admin && t.commission != null && <Stat label="Comisión de clases" value={formatPoints(Number(t.commission))} sub={`Cobrado a clientes: ${formatPoints(Number(t.revenue ?? 0))}`} />}
                        <Stat label="Canceladas por el entrenador" value={String(t.cancelledByTrainer)} sub={`Por los alumnos: ${t.cancelledByClients}`} />
                    </div>

                    <section className="space-y-2">
                        <h2 className="text-lg font-semibold">Por deporte</h2>
                        <DataTable aria-label="Por deporte">
                            <TableHeader>
                                <TableColumn>DEPORTE</TableColumn>
                                <TableColumn align="end">RESERVAS</TableColumn>
                                <TableColumn align="end">{admin ? "INGRESOS ENTRENADORES" : "GANADO"}</TableColumn>
                            </TableHeader>
                            <TableBody emptyContent="Sin clases en el período">
                                {data!.bySport.map((s) => (
                                    <TableRow key={s.sportId}>
                                        <TableCell>{s.name}</TableCell>
                                        <TableCell className="text-right tabular-nums">{s.count}</TableCell>
                                        <TableCell className="text-right tabular-nums">{formatPoints(Number(s.earned))}</TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </DataTable>
                    </section>

                    {admin && data!.byTrainer && (
                        <section className="space-y-2">
                            <h2 className="text-lg font-semibold">Por entrenador</h2>
                            <DataTable aria-label="Por entrenador">
                                <TableHeader>
                                    <TableColumn>ENTRENADOR</TableColumn>
                                    <TableColumn align="end">RESERVAS</TableColumn>
                                    <TableColumn align="end">INGRESOS</TableColumn>
                                    <TableColumn align="end">COMISIÓN</TableColumn>
                                    <TableColumn align="end">CANCELÓ</TableColumn>
                                </TableHeader>
                                <TableBody emptyContent="Sin clases en el período">
                                    {data!.byTrainer.map((x) => (
                                        <TableRow key={x.trainerId}>
                                            <TableCell>{x.name}</TableCell>
                                            <TableCell className="text-right tabular-nums">{x.count}</TableCell>
                                            <TableCell className="text-right tabular-nums">{formatPoints(Number(x.earned))}</TableCell>
                                            <TableCell className="text-right tabular-nums">{formatPoints(Number(x.commission))}</TableCell>
                                            <TableCell className="text-right tabular-nums">{x.cancelledByTrainer}</TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </DataTable>
                        </section>
                    )}

                    {data!.byDay.length > 0 && (
                        <section className="space-y-2">
                            <h2 className="text-lg font-semibold">{admin ? "Ingresos por día" : "Ganado por día"}</h2>
                            <DataTable aria-label="Por día">
                                <TableHeader>
                                    <TableColumn>DÍA</TableColumn>
                                    <TableColumn align="end">MONTO</TableColumn>
                                </TableHeader>
                                <TableBody>
                                    {[...data!.byDay].reverse().map((d) => (
                                        <TableRow key={d.date}>
                                            <TableCell>{d.date.split("-").reverse().join("/")}</TableCell>
                                            <TableCell className="text-right tabular-nums">{formatPoints(Number(d.earned))}</TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </DataTable>
                        </section>
                    )}
                </div>
            )}
        </div>
    );
}

function Stat({ label, value, sub }: { label: string; value: string; sub: string }) {
    return (
        <Card shadow="none" className="bg-content1">
            <CardBody className="gap-1 p-4">
                <p className="text-xs text-default-500">{label}</p>
                <p className="text-2xl font-bold tabular-nums">{value}</p>
                <p className="text-xs text-default-400">{sub}</p>
            </CardBody>
        </Card>
    );
}
