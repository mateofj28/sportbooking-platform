"use client";

// Perfil de un entrenador y reserva de una clase (Req. 5.4, 6, 7).
// Horarios desde 24 h y hasta 30 días (hora AR); la base los calcula y vuelve a validar al reservar.
import {
    Avatar, Button, Card, CardBody, Checkbox, Chip, DatePicker, Modal, ModalBody, ModalContent, ModalFooter, ModalHeader,
    Spinner, useDisclosure,
} from "@heroui/react";
import { Select, SelectItem } from "@heroui/select";
import { parseDate, type CalendarDate } from "@internationalized/date";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { use, useEffect, useMemo, useState } from "react";
import { ChevronLeftIcon, ClockIcon, MapPinIcon, UsersIcon } from "@heroicons/react/24/outline";
import { Navbar } from "@/components/layout/navbar";
import { InsufficientBalance } from "@/components/shared/insufficient-balance";
import { Credits } from "@/components/trainer/credits";
import { useBookClass, useBookClassSeries, usePublicTrainer, useTrainerAvailability, type ClassOption, type ClassPayMode } from "@/hooks/use-classes";
import { RecurringPayModal } from "@/components/shared/recurring-pay-modal";
import { useMyBalance } from "@/hooks/use-wallet";
import { todayAr } from "@/lib/ads";
import { formatDateAr, formatTimeAr } from "@/lib/datetime";
import { formatPoints } from "@/lib/points";
import { durationsLabel, slotRangeLabel, WEEKDAYS } from "@/lib/trainers";
import { useAuthStore } from "@/stores/auth-store";
import { useToastStore } from "@/stores/toast-store";

/** Se reserva hasta 30 días adelante (E12). */
const MAX_DAYS = 30;

export default function TrainerProfilePage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = use(params);
    const router = useRouter();
    const { isAuthenticated } = useAuthStore();
    const addToast = useToastStore((s) => s.addToast);
    const { data: t, isLoading, error } = usePublicTrainer(id);
    const { data: balance = 0, isLoading: loadingBalance } = useMyBalance();
    const book = useBookClass();
    const confirm = useDisclosure();

    const today = todayAr();
    const minDate = useMemo(() => parseDate(today).add({ days: 1 }), [today]);
    const maxDate = useMemo(() => parseDate(today).add({ days: MAX_DAYS }), [today]);

    const [sportId, setSportId] = useState<string | null>(null);
    const [hours, setHours] = useState<number | null>(null);
    const [date, setDate] = useState<string | null>(null);
    const [picked, setPicked] = useState<ClassOption | null>(null);
    // Clase fija: la misma clase todas las semanas (8 fechas, Req. 8)
    const [weekly, setWeekly] = useState(false);
    const series = useBookClassSeries();
    const seriesModal = useDisclosure();
    const [seriesError, setSeriesError] = useState<string | null>(null);

    const sport = t?.sports.find((s) => s.id === sportId) ?? null;

    // Primer deporte y su duración más corta por defecto (visibles y editables)
    useEffect(() => {
        if (!t || sportId) return;
        const first = t.sports[0];
        if (first) { setSportId(first.id); setHours(Math.min(...first.durations)); }
    }, [t, sportId]);

    const { data: availability, isFetching: loadingSlots } = useTrainerAvailability(id, date, sportId, hours);
    const options = availability?.options ?? [];

    if (isLoading) return <Shell><div className="flex justify-center py-12"><Spinner size="lg" /></div></Shell>;
    if (error || !t) {
        return (
            <Shell>
                <p className="text-default-500">Este entrenador no está disponible.</p>
                <Button as={Link} href="/entrenadores" variant="bordered" className="mt-4">Ver entrenadores</Button>
            </Shell>
        );
    }

    const onSport = (v: string) => {
        const s = t.sports.find((x) => x.id === v);
        setSportId(v);
        setHours(s ? Math.min(...s.durations) : null);
        setPicked(null);
    };

    const onConfirm = () => {
        if (!picked || !sportId) return;
        book.mutate(
            { trainerId: t.trainerId, sportId, start: picked.start, hours: picked.hours, expectedTotal: picked.total },
            {
                onSuccess: () => {
                    confirm.onClose();
                    setPicked(null);
                    addToast("¡Clase reservada! Te mandamos la confirmación por email.");
                    router.push("/bookings?tab=classes");
                },
                onError: (e) => addToast(e.message),
            },
        );
    };

    const enough = !picked || balance >= picked.total;

    const onSeries = (payMode: ClassPayMode) => {
        if (!picked || !sportId) return;
        setSeriesError(null);
        series.mutate(
            { trainerId: t.trainerId, sportId, start: picked.start, hours: picked.hours, payMode, expectedTotal: picked.total },
            {
                onSuccess: (r) => {
                    seriesModal.onClose();
                    setPicked(null);
                    addToast(r.skippedCount > 0
                        ? `Clase fija creada: ${r.createdCount} fechas (${r.skippedCount} no estaban disponibles).`
                        : `Clase fija creada: ${r.createdCount} fechas.`);
                    router.push("/bookings?tab=classes");
                },
                onError: (e) => setSeriesError(e.message),
            },
        );
    };

    return (
        <Shell>
            <Button as={Link} href="/entrenadores" variant="light" size="sm" startContent={<ChevronLeftIcon className="h-4 w-4" />}>
                Entrenadores
            </Button>

            <div className="mt-4 flex items-start gap-4">
                <Avatar src={t.avatarUrl ?? undefined} name={`${t.firstName} ${t.lastName}`} className="h-16 w-16 shrink-0" />
                <div className="min-w-0">
                    <h1 className="text-2xl font-bold">{t.firstName} {t.lastName}</h1>
                    <div className="mt-1 flex flex-wrap gap-1">
                        {t.sports.map((s) => <Chip key={s.id} size="sm" variant="flat">{s.name}</Chip>)}
                    </div>
                    {t.bio && <p className="mt-2 text-default-600">{t.bio}</p>}
                </div>
            </div>
            {t.experience && (
                <section className="mt-6">
                    <h2 className="text-lg font-semibold">Experiencia</h2>
                    <p className="mt-1 whitespace-pre-line text-sm text-default-600">{t.experience}</p>
                </section>
            )}

            <section className="mt-6">
                <h2 className="text-lg font-semibold">Horarios y precios</h2>
                <div className="mt-2 space-y-2">
                    {t.slots.map((s) => (
                        <Card key={s.id} shadow="none" className="bg-content1">
                            <CardBody className="gap-1 p-3 text-sm">
                                <p className="font-semibold">{WEEKDAYS[s.dayOfWeek]} · {slotRangeLabel(s)}</p>
                                <p className="flex items-center gap-1 text-default-500"><MapPinIcon className="h-4 w-4" />{s.location}</p>
                                <p className="text-default-500">{s.sports.map((x) => x.name).join(", ")}</p>
                                <p>
                                    Individual <Credits amount={s.finalIndividual} /> por hora
                                    {s.finalGroup != null && <> · Grupal <Credits amount={s.finalGroup} /> por hora y por persona</>}
                                </p>
                            </CardBody>
                        </Card>
                    ))}
                </div>
            </section>

            <section className="mt-8" aria-labelledby="reservar">
                <h2 id="reservar" className="text-lg font-semibold">Reservar una clase</h2>
                {t.isMe ? (
                    <p className="mt-2 text-sm text-default-500">Este es tu perfil: no podés reservarte una clase.</p>
                ) : (
                    <>
                        <p className="mt-1 text-sm text-default-500">
                            Se reserva con 24 horas de anticipación o más y hasta {MAX_DAYS} días adelante. Podés cancelar hasta 24 horas antes y te devolvemos el 100%.
                        </p>
                        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
                            <Select label="Deporte" variant="bordered" disallowEmptySelection
                                selectedKeys={sportId ? [sportId] : []}
                                onSelectionChange={(k: any) => onSport(String(Array.from(k)[0]))}>
                                {t.sports.map((s) => <SelectItem key={s.id}>{s.name}</SelectItem>)}
                            </Select>
                            <Select label="Duración" variant="bordered" disallowEmptySelection isDisabled={!sport}
                                selectedKeys={hours ? [String(hours)] : []}
                                description={sport ? (sport.maxStudents > 1 ? `Grupal, hasta ${sport.maxStudents} alumnos` : "Individual") : undefined}
                                onSelectionChange={(k: any) => { setHours(Number(Array.from(k)[0])); setPicked(null); }}>
                                {(sport?.durations ?? []).slice().sort((a, b) => a - b)
                                    .map((h) => <SelectItem key={String(h)}>{`${h} ${h === 1 ? "hora" : "horas"}`}</SelectItem>)}
                            </Select>
                            <DatePicker label="Día" variant="bordered"
                                // Cast: HeroUI trae su copia de @internationalized/date (mismo runtime)
                                minValue={minDate as any} maxValue={maxDate as any}
                                value={date ? parseDate(date) as any : null}
                                onChange={(v) => {
                                    const d = (v as CalendarDate | null)?.toString() ?? null;
                                    setDate(d && d >= minDate.toString() && d <= maxDate.toString() ? d : null);
                                    setPicked(null);
                                }} />
                        </div>

                        <div className="mt-4">
                            {!date ? (
                                <p className="text-sm text-default-500">Elegí un día para ver los horarios libres.</p>
                            ) : loadingSlots ? (
                                <Spinner size="sm" />
                            ) : options.length === 0 ? (
                                <p className="text-sm text-default-500">No hay horarios libres ese día para {sport?.name} de {durationsLabel(hours ? [hours] : [])}.</p>
                            ) : (
                                <div className="flex flex-wrap gap-2" role="list" aria-label="Horarios libres">
                                    {options.map((o) => (
                                        <Button key={o.start} role="listitem" size="sm" isDisabled={o.already}
                                            variant={picked?.start === o.start ? "solid" : "bordered"} color="primary"
                                            onPress={() => setPicked(o)}>
                                            {formatTimeAr(o.start)}
                                            {o.isGroup && <span className="text-xs">· {o.already ? "ya reservaste" : `${o.spotsLeft} ${o.spotsLeft === 1 ? "lugar" : "lugares"}`}</span>}
                                        </Button>
                                    ))}
                                </div>
                            )}
                        </div>

                        {picked && (
                            <Card shadow="none" className="mt-4 bg-content1">
                                <CardBody className="flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                                    <div className="text-sm">
                                        <p className="font-semibold">{formatDateAr(picked.start)}</p>
                                        <p className="text-default-500">{formatTimeAr(picked.start)} a {formatTimeAr(picked.end)} · {picked.location}</p>
                                        <p className="mt-1">Total <Credits amount={picked.total} className="font-semibold" /></p>
                                    </div>
                                    {isAuthenticated ? (
                                            <div className="flex w-full flex-col gap-2 sm:w-auto sm:items-end">
                                                <Checkbox isSelected={weekly} onValueChange={setWeekly} size="sm">
                                                    Repetir todas las semanas (clase fija, 8 fechas)
                                                </Checkbox>
                                                <Button color="primary" className="w-full sm:w-auto"
                                                    onPress={() => { if (weekly) { setSeriesError(null); seriesModal.onOpen(); } else confirm.onOpen(); }}>
                                                    {weekly ? "Crear clase fija" : "Reservar"}
                                                </Button>
                                            </div>
                                    ) : (
                                        <Button as={Link} href="/login" color="primary" className="w-full sm:w-auto">Iniciá sesión para reservar</Button>
                                    )}
                                </CardBody>
                            </Card>
                        )}
                    </>
                )}
            </section>

            <Modal isOpen={confirm.isOpen} onClose={confirm.onClose} placement="center" scrollBehavior="inside">
                <ModalContent>
                    <ModalHeader>Confirmar clase</ModalHeader>
                    <ModalBody className="gap-3">
                        {picked && (
                            <dl className="grid grid-cols-[auto,1fr] gap-x-4 gap-y-1 text-sm">
                                <dt className="text-default-500">Entrenador</dt><dd>{t.firstName} {t.lastName}</dd>
                                <dt className="text-default-500">Deporte</dt><dd>{sport?.name} ({picked.isGroup ? `grupal, hasta ${picked.capacity}` : "individual"})</dd>
                                <dt className="text-default-500">Lugar</dt><dd>{picked.location}</dd>
                                <dt className="text-default-500">Fecha</dt><dd>{formatDateAr(picked.start)}</dd>
                                <dt className="text-default-500">Horario</dt>
                                <dd className="flex items-center gap-1"><ClockIcon className="h-4 w-4" />{formatTimeAr(picked.start)} a {formatTimeAr(picked.end)} ({picked.hours} h)</dd>
                                {picked.isGroup && (<><dt className="text-default-500">Lugares</dt>
                                    <dd className="flex items-center gap-1"><UsersIcon className="h-4 w-4" />{picked.spotsLeft} libres</dd></>)}
                                <dt className="text-default-500">Total</dt><dd className="font-semibold">{formatPoints(picked.total)}</dd>
                                <dt className="text-default-500">Tu saldo</dt><dd>{loadingBalance ? "…" : formatPoints(balance)}</dd>
                            </dl>
                        )}
                        {picked && !loadingBalance && !enough && <InsufficientBalance needed={picked.total} available={balance} />}
                        <p className="text-xs text-default-500">Se paga ahora con tus créditos. Podés cancelar hasta 24 horas antes del inicio y te devolvemos el 100%.</p>
                    </ModalBody>
                    <ModalFooter>
                        <Button variant="light" onPress={confirm.onClose}>Volver</Button>
                        <Button color="primary" isLoading={book.isPending} isDisabled={loadingBalance || !enough} onPress={onConfirm}>
                            Pagar y reservar
                        </Button>
                    </ModalFooter>
                </ModalContent>
            </Modal>
            {picked && (
                <RecurringPayModal
                    isOpen={seriesModal.isOpen}
                    onClose={seriesModal.onClose}
                    pricePerDate={picked.total}
                    dates={8}
                    balance={balance}
                    firstWithin24h={false}
                    isLoading={series.isPending}
                    error={seriesError}
                    onConfirm={onSeries}
                    noun="clase fija"
                    feminine
                />
            )}
        </Shell>
    );
}

function Shell({ children }: { children: React.ReactNode }) {
    return (
        <div className="flex min-h-screen flex-col">
            <Navbar />
            <main className="mx-auto w-full max-w-4xl flex-1 px-6 py-8">{children}</main>
        </div>
    );
}
