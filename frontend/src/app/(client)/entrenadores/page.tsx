"use client";

// Entrenadores (vista de cliente, Req. 5): solo publicados, con filtros resueltos en la base.
import { Avatar, Button, Card, CardBody, Chip, Pagination, Spinner } from "@heroui/react";
import { Select, SelectItem } from "@heroui/select";
import Link from "next/link";
import { useState } from "react";
import { AcademicCapIcon } from "@heroicons/react/24/outline";
import { Navbar } from "@/components/layout/navbar";
import { PointsInput } from "@/components/shared/points-input";
import { Credits } from "@/components/trainer/credits";
import { useSearchTrainers, type TrainerSearch } from "@/hooks/use-classes";
import { useSports } from "@/hooks/use-sports";
import { daysLabel, WEEKDAYS } from "@/lib/trainers";

const PAGE_SIZE = 12;
const EMPTY: TrainerSearch = { sportId: null, dayOfWeek: null, minPrice: null, maxPrice: null };

export default function TrainersPage() {
    const [filters, setFilters] = useState<TrainerSearch>(EMPTY);
    const [page, setPage] = useState(1);
    const { data, isLoading, isFetching } = useSearchTrainers(filters, page, PAGE_SIZE);
    const { data: sports } = useSports();
    const classSports = (sports ?? []).filter((s) => s.classesEnabled);

    const set = (patch: Partial<TrainerSearch>) => { setFilters((f) => ({ ...f, ...patch })); setPage(1); };
    const rangeError = filters.minPrice != null && filters.maxPrice != null && filters.minPrice > filters.maxPrice
        ? "El mínimo no puede ser mayor que el máximo" : undefined;
    const hasFilters = JSON.stringify(filters) !== JSON.stringify(EMPTY);
    const totalPages = Math.max(1, Math.ceil((data?.total ?? 0) / PAGE_SIZE));

    return (
        <div className="flex min-h-screen flex-col">
            <Navbar />
            <main className="mx-auto w-full max-w-5xl flex-1 px-6 py-8">
                <h1 className="text-3xl font-bold">Entrenadores</h1>
                <p className="mt-2 text-default-500">Reservá una clase con un entrenador y pagala con tus créditos.</p>

                <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4" role="group" aria-label="Filtros">
                    <Select label="Deporte" size="sm" variant="bordered" disallowEmptySelection
                        selectedKeys={[filters.sportId ?? "ALL"]}
                        onSelectionChange={(k: any) => { const v = String(Array.from(k)[0]); set({ sportId: v === "ALL" ? null : v }); }}>
                        {[{ id: "ALL", name: "Todos los deportes" }, ...classSports].map((s) => <SelectItem key={s.id}>{s.name}</SelectItem>)}
                    </Select>
                    <Select label="Día" size="sm" variant="bordered" disallowEmptySelection
                        selectedKeys={[filters.dayOfWeek == null ? "ALL" : String(filters.dayOfWeek)]}
                        onSelectionChange={(k: any) => { const v = String(Array.from(k)[0]); set({ dayOfWeek: v === "ALL" ? null : Number(v) }); }}>
                        {[{ key: "ALL", label: "Todos los días" }, ...WEEKDAYS.map((d, i) => ({ key: String(i), label: d }))]
                            .map((d) => <SelectItem key={d.key}>{d.label}</SelectItem>)}
                    </Select>
                    <PointsInput label="Precio por hora desde" size="sm" value={filters.minPrice} onChange={(v) => set({ minPrice: v })} />
                    <PointsInput label="Precio por hora hasta" size="sm" value={filters.maxPrice} onChange={(v) => set({ maxPrice: v })}
                        isInvalid={!!rangeError} errorMessage={rangeError} />
                </div>
                {hasFilters && (
                    <Button size="sm" variant="light" className="mt-2" onPress={() => { setFilters(EMPTY); setPage(1); }}>
                        Quitar filtros
                    </Button>
                )}

                <div className="mt-6">
                    {isLoading ? (
                        <div className="flex justify-center py-12"><Spinner size="lg" /></div>
                    ) : (data?.items.length ?? 0) === 0 ? (
                        <div className="py-12 text-center">
                            <AcademicCapIcon className="mx-auto h-12 w-12 text-default-300" />
                            <p className="mt-4 text-lg text-default-500">
                                {hasFilters ? "No hay entrenadores con esos filtros" : "Todavía no hay entrenadores disponibles"}
                            </p>
                        </div>
                    ) : (
                        <div className={`grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 ${isFetching ? "opacity-70" : ""}`}>
                            {data!.items.map((t) => (
                                <Card key={t.trainerId} as={Link} href={`/entrenadores/${t.trainerId}`} shadow="none" className="bg-content1">
                                    <CardBody className="gap-3 p-4">
                                        <div className="flex items-center gap-3">
                                            <Avatar src={t.avatarUrl ?? undefined} name={`${t.firstName} ${t.lastName}`} />
                                            <div className="min-w-0">
                                                <p className="truncate font-semibold">{t.firstName} {t.lastName}</p>
                                                <p className="text-xs text-default-500">Da clases los {daysLabel(t.days)}</p>
                                            </div>
                                        </div>
                                        {t.bio && <p className="line-clamp-2 text-sm text-default-600">{t.bio}</p>}
                                        <div className="flex flex-wrap gap-1">
                                            {t.sports.map((s) => <Chip key={s} size="sm" variant="flat">{s}</Chip>)}
                                        </div>
                                        <p className="text-sm">Desde <Credits amount={t.minPrice} className="font-semibold" /> por hora</p>
                                    </CardBody>
                                </Card>
                            ))}
                        </div>
                    )}
                </div>

                {totalPages > 1 && (
                    <div className="mt-6 flex justify-center">
                        <Pagination size="sm" showControls total={totalPages} page={page} onChange={setPage} />
                    </div>
                )}
            </main>
        </div>
    );
}
