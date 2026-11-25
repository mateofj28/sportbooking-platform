"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Accordion, AccordionItem, Card, CardBody, Link, Spinner, TableBody, TableCell, TableColumn, TableHeader, TableRow } from "@heroui/react";
import { ClockIcon, TagIcon, WalletIcon } from "@heroicons/react/24/outline";
import { Navbar } from "@/components/layout/navbar";
import { DataTable } from "@/components/shared/data-table";
import { PointsAmount } from "@/components/shared/points-amount";
import { WhatsappTopupButton } from "@/components/shared/whatsapp-topup-button";
import { PointsInput } from "@/components/shared/points-input";
import { LedgerFilters, LedgerPagination, type LedgerFilterValue } from "@/components/shared/ledger-filters";
import { useMyWalletHistory } from "@/hooks/use-wallet";
import { useAuthStore } from "@/stores/auth-store";
import { formatArDateTime, formatPoints, WALLET_TX_LABEL, WHATSAPP_TOPUP_LABEL, WHATSAPP_TOPUP_NUMBER } from "@/lib/points";

/** WhatsApp con un mensaje ya escrito. */
const whatsappUrl = (text: string) => `https://wa.me/${WHATSAPP_TOPUP_NUMBER}?text=${encodeURIComponent(text)}`;
const WHATSAPP_HELP_URL = whatsappUrl("Hola, quiero saber cómo cargar créditos en SportBooking.");
const WHATSAPP_PROMOS_URL = whatsappUrl("Hola, quiero consultar por promociones para cargar créditos en SportBooking.");

/** Preguntas frecuentes de la billetera. */
const FAQ: { key: string; question: string; answer: React.ReactNode }[] = [
    {
        key: "como-cargo",
        question: "¿Cómo cargo créditos para utilizar en la App?",
        answer: (
            <>
                Haciendo click en{" "}
                <Link href={WHATSAPP_HELP_URL} isExternal size="sm" className="font-medium">nuestro WhatsApp</Link>{" "}
                te explicamos los pasos a seguir.
            </>
        ),
    },
    {
        // PENDIENTE: aclarar "no son reintegrables". Al cancelar un turno los créditos SÍ vuelven a la
        // billetera; seguramente significa "no se reintegran en dinero". Ver "Tareas pendientes" en
        // .kiro/steering/supabase-migration.md.
        key: "transferibles",
        question: "¿Los créditos son transferibles y reintegrables?",
        answer:
            "Por el momento los créditos no son transferibles: recomendamos cargar con anticipación lo justo y necesario para la reserva del turno. Y no son reintegrables.",
    },
    {
        key: "vencimiento",
        question: "¿Tienen vencimiento los créditos?",
        answer: "Los créditos no tienen vencimiento.",
    },
];

const KINDS = [
    { key: "ALL", label: "Todos los movimientos" },
    { key: "TOPUP", label: "Recargas" },
    { key: "ADJUSTMENT", label: "Ajustes" },
    { key: "BOOKING_PAYMENT", label: "Reservas" },
    { key: "BOOKING_REFUND", label: "Devoluciones" },
];
const PAGE_SIZE = 20;
const MAX_TOPUP = 10_000_000;

export default function WalletPage() {
    const router = useRouter();
    const { isAuthenticated, isHydrated } = useAuthStore();
    const [filters, setFilters] = useState<LedgerFilterValue>({ from: "", to: "", kind: "ALL" });
    const [page, setPage] = useState(1);
    const [buyPoints, setBuyPoints] = useState<number | null>(null);

    useEffect(() => {
        if (isHydrated && !isAuthenticated) router.replace("/login");
    }, [isHydrated, isAuthenticated, router]);

    const { data, isLoading, isError, error } = useMyWalletHistory({ ...filters, page, size: PAGE_SIZE });


    if (!isHydrated) return <div className="flex min-h-screen items-center justify-center"><Spinner size="lg" /></div>;
    if (!isAuthenticated) return null;

    return (
        <div className="flex min-h-screen flex-col">
            <Navbar />
            <main className="mx-auto w-full max-w-5xl flex-1 space-y-6 px-6 py-8">
                <div>
                    <h1 className="text-2xl font-bold">Mi billetera</h1>
                    <p className="mt-1 text-sm text-default-500">Pagás tus reservas con créditos. 1 crédito = $1.</p>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                    <Card shadow="none" className="bg-content1">
                        <CardBody className="flex flex-row items-center gap-4 p-6">
                            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10">
                                <WalletIcon className="h-6 w-6 text-primary" aria-hidden="true" />
                            </div>
                            <div>
                                <p className="text-sm text-default-500">Saldo disponible</p>
                                <p className="text-3xl font-bold tabular-nums">{data ? formatPoints(data.balance) : "…"}</p>
                            </div>
                        </CardBody>
                    </Card>

                    <Card shadow="none" className="bg-content1">
                        <CardBody className="gap-3 p-6">
                            <p className="text-sm font-semibold">Cargar créditos</p>
                            <p className="text-xs text-default-500">
                                Escribinos por WhatsApp al {WHATSAPP_TOPUP_LABEL}, hacé la transferencia y te cargamos los créditos.
                            </p>
                            <div className="flex flex-wrap items-start gap-2">
                                <PointsInput
                                    label="¿Cuántos créditos?"
                                    size="sm"
                                    className="max-w-[200px]"
                                    max={MAX_TOPUP}
                                    value={buyPoints}
                                    onChange={setBuyPoints}
                                />
                                <WhatsappTopupButton points={buyPoints} />
                            </div>
                        </CardBody>
                    </Card>
                </div>

                {/* Avisos para tener en cuenta antes de cargar */}
                <div className="grid gap-4 md:grid-cols-2">
                    <div role="note" className="flex items-start gap-3 rounded-xl border border-warning/40 bg-warning/10 p-4">
                        <ClockIcon className="mt-0.5 h-5 w-5 flex-shrink-0 text-warning-600" aria-hidden="true" />
                        <div>
                            <p className="text-sm font-semibold text-warning-700! dark:text-warning-400!">Cargá con 24 hs de anticipación</p>
                            <p className="mt-0.5 text-xs text-warning-700 dark:text-warning-400">
                                Realizá las cargas de créditos con 24 hs de anticipación al turno que querés reservar.
                            </p>
                        </div>
                    </div>
                    <div role="note" className="flex items-start gap-3 rounded-xl border border-primary/30 bg-primary/10 p-4">
                        <TagIcon className="mt-0.5 h-5 w-5 flex-shrink-0 text-primary" aria-hidden="true" />
                        <div>
                            <p className="text-sm font-semibold text-primary!">Consultá por promociones</p>
                            <p className="mt-0.5 text-xs text-default-600">
                                Preguntanos por las promociones vigentes{" "}
                                <Link href={WHATSAPP_PROMOS_URL} isExternal size="sm" className="text-xs font-medium">por WhatsApp</Link>.
                            </p>
                        </div>
                    </div>
                </div>

                <section className="space-y-3" aria-label="Movimientos">
                    <h2 className="text-lg font-semibold">Movimientos</h2>
                    <LedgerFilters value={filters} onChange={(v) => { setFilters(v); setPage(1); }} kinds={KINDS} />

                    {isError ? (
                        <p role="alert" className="text-sm text-danger">{error?.message}</p>
                    ) : (
                        <>
                            <DataTable aria-label="Movimientos de mi billetera">
                                <TableHeader>
                                    <TableColumn>FECHA Y HORA</TableColumn>
                                    <TableColumn>DETALLE</TableColumn>
                                    <TableColumn align="end">CRÉDITOS</TableColumn>
                                    <TableColumn align="end">SALDO</TableColumn>
                                </TableHeader>
                                <TableBody
                                    isLoading={isLoading}
                                    loadingContent={<Spinner />}
                                    emptyContent="Todavía no tenés movimientos"
                                >
                                    {(data?.items ?? []).map((t) => (
                                        <TableRow key={t.id}>
                                            <TableCell className="text-default-500">{formatArDateTime(t.createdAt)}</TableCell>
                                            <TableCell>
                                                <p className="font-medium">{WALLET_TX_LABEL[t.kind]}</p>
                                                <p className="max-w-[420px] truncate text-xs text-default-400">
                                                    {t.kind === "TOPUP" || t.kind === "ADJUSTMENT" ? (t.reason ?? t.detail) : t.detail.replace(/^(Reserva|Devolución) — /, "")}
                                                </p>
                                            </TableCell>
                                            <TableCell className="text-right"><PointsAmount amount={t.amount} /></TableCell>
                                            <TableCell className="text-right tabular-nums text-default-500">{formatPoints(t.balanceAfter)}</TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </DataTable>
                            <LedgerPagination total={data?.total ?? 0} page={page} size={PAGE_SIZE} onPage={setPage} />
                        </>
                    )}
                </section>

                <section className="space-y-3" aria-label="Preguntas frecuentes">
                    <h2 className="text-lg font-semibold">Preguntas frecuentes</h2>
                    <Accordion variant="splitted" selectionMode="multiple" className="px-0">
                        {FAQ.map((f) => (
                            <AccordionItem
                                key={f.key}
                                aria-label={f.question}
                                title={<span className="text-sm font-medium">{f.question}</span>}
                                className="shadow-none"
                            >
                                <p className="pb-2 text-sm text-default-600">{f.answer}</p>
                            </AccordionItem>
                        ))}
                    </Accordion>
                </section>
            </main>
        </div>
    );
}
