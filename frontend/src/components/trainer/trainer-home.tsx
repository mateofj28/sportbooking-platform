"use client";

// Inicio del panel del entrenador: estado de la ficha, qué falta para publicar y accesos.
import { Button, Card, CardBody, Chip, Spinner } from "@heroui/react";
import Link from "next/link";
import { CalendarDaysIcon, CheckCircleIcon, ClockIcon, ExclamationTriangleIcon, NoSymbolIcon, UserIcon } from "@heroicons/react/24/outline";
import { useMyTrainerPanel, useSetTrainerPublished } from "@/hooks/use-trainer";
import { useTrainerMyClasses } from "@/hooks/use-classes";
import { formatDateShortAr, formatTimeAr } from "@/lib/datetime";
import { TRAINER_STATUS_META } from "@/lib/trainers";
import { useToastStore } from "@/stores/toast-store";

export function TrainerHome() {
    const { data: panel, isLoading, error } = useMyTrainerPanel();
    const setPublished = useSetTrainerPublished();
    const addToast = useToastStore((s) => s.addToast);
    const { data: upcoming } = useTrainerMyClasses("UPCOMING", 1, 5);

    if (isLoading) return <div className="flex justify-center py-12"><Spinner size="lg" /></div>;
    if (error || !panel) {
        return <p className="text-sm text-danger">No pudimos cargar tu panel. Probá recargar la página.</p>;
    }

    const status = TRAINER_STATUS_META[panel.status];
    const canPublish = panel.publishProblems.length === 0;

    const toggle = (publish: boolean) =>
        setPublished.mutate(publish, {
            onSuccess: () => addToast(publish ? "Tu perfil ya está publicado" : "Tu perfil dejó de estar visible"),
            onError: (e) => addToast(e.message),
        });

    const links = [
        { href: "/dashboard/trainer/classes", label: "Mis clases", icon: CalendarDaysIcon, detail: `${upcoming?.total ?? 0} próxima${upcoming?.total === 1 ? "" : "s"}` },
        { href: "/dashboard/trainer/profile", label: "Mi perfil de entrenador", icon: UserIcon, detail: `${panel.sports.length} deporte${panel.sports.length === 1 ? "" : "s"}` },
        { href: "/dashboard/trainer/availability", label: "Disponibilidad", icon: ClockIcon, detail: `${panel.slots.length} franja${panel.slots.length === 1 ? "" : "s"} por semana` },
        { href: "/dashboard/trainer/blocks", label: "Bloqueos", icon: NoSymbolIcon, detail: `${panel.blocks.length} bloqueo${panel.blocks.length === 1 ? "" : "s"}` },
    ];

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-2xl font-bold">Hola, {panel.firstName}</h1>
                <p className="text-sm text-default-500 mt-1">Desde acá armás tu perfil y tus horarios para dar clases.</p>
            </div>

            <Card shadow="none" className="bg-content1">
                <CardBody className="gap-4 p-5">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                        <div className="flex items-center gap-2">
                            <span className="text-sm text-default-500">Estado de tu perfil:</span>
                            <Chip size="sm" variant="flat" color={status.color}>{status.label}</Chip>
                        </div>
                        {panel.status === "DRAFT" && (
                            <Button color="primary" className="w-full sm:w-auto" isDisabled={!canPublish}
                                isLoading={setPublished.isPending} onPress={() => toggle(true)}>
                                Publicar perfil
                            </Button>
                        )}
                        {panel.status === "PUBLISHED" && (
                            <Button variant="bordered" className="w-full sm:w-auto"
                                isLoading={setPublished.isPending} onPress={() => toggle(false)}>
                                Ocultar perfil
                            </Button>
                        )}
                    </div>

                    {panel.status === "SUSPENDED" && (
                        <div role="alert" className="flex gap-2 rounded-lg bg-danger-50 px-4 py-3 text-sm text-danger">
                            <ExclamationTriangleIcon className="h-5 w-5 shrink-0" />
                            <div>
                                <p className="font-semibold text-danger!">La administración suspendió tu perfil</p>
                                {panel.suspendedReason && <p className="mt-0.5">Motivo: {panel.suspendedReason}</p>}
                                <p className="mt-0.5">Los clientes no te ven. Para reactivarlo escribinos desde Ayuda y soporte.</p>
                            </div>
                        </div>
                    )}

                    {panel.status === "PUBLISHED" && (
                        <p className="text-sm text-default-500">Los clientes ya pueden ver tu perfil.</p>
                    )}

                    {panel.status === "DRAFT" && (
                        canPublish ? (
                            <p className="flex items-center gap-2 text-sm text-success">
                                <CheckCircleIcon className="h-5 w-5" /> Tu perfil está completo. Publicalo para que los clientes te vean.
                            </p>
                        ) : (
                            <div>
                                <p className="text-sm font-semibold">Para publicar te falta:</p>
                                <ul className="mt-2 space-y-1">
                                    {panel.publishProblems.map((p) => (
                                        <li key={p} className="flex items-start gap-2 text-sm text-default-600">
                                            <ExclamationTriangleIcon className="h-4 w-4 mt-0.5 shrink-0 text-warning" /> {p}
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        )
                    )}
                </CardBody>
            </Card>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {links.map((l) => (
                    <Card key={l.href} as={Link} href={l.href} shadow="none" className="bg-content1">
                        <CardBody className="flex-row items-center gap-3 p-4">
                            <l.icon className="h-6 w-6 text-primary" />
                            <div>
                                <p className="text-sm font-semibold">{l.label}</p>
                                <p className="text-xs text-default-500">{l.detail}</p>
                            </div>
                        </CardBody>
                    </Card>
                ))}
            </div>

            {(upcoming?.items.length ?? 0) > 0 && (
                <section className="space-y-2">
                    <h2 className="text-lg font-semibold">Próximas clases</h2>
                    <ul className="divide-y divide-divider rounded-xl bg-content1">
                        {upcoming!.items.map((c) => (
                            <li key={c.classId} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm">
                                <span className="font-medium">{formatDateShortAr(c.start)} · {formatTimeAr(c.start)} a {formatTimeAr(c.end)}</span>
                                <span className="text-default-500">{c.sport.name} · {c.taken}/{c.capacity} alumnos · {c.location}</span>
                            </li>
                        ))}
                    </ul>
                </section>
            )}
        </div>
    );
}
