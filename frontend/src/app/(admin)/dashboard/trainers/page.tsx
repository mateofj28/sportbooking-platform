"use client";

// Entrenadores (solo admin general): lista con filtros y alta de entrenadores. Spec entrenadores, Etapa 1.
import {
    Button, Chip, Input, Modal, ModalBody, ModalContent, ModalFooter, ModalHeader, Pagination,
    Spinner, Tab, TableBody, TableCell, TableColumn, TableHeader, TableRow, Tabs, useDisclosure,
} from "@heroui/react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ChevronRightIcon, MagnifyingGlassIcon, PlusIcon } from "@heroicons/react/24/outline";
import { DataTable } from "@/components/shared/data-table";
import { PhoneInput } from "@/components/shared/phone-input";
import { DniInput } from "@/components/shared/dni-input";
import { Credits } from "@/components/trainer/credits";
import { useAdminTrainers, useCreateTrainer, type TrainerStatus } from "@/hooks/use-trainer";
import { formatDateTimeAr } from "@/lib/datetime";
import { TRAINER_STATUS_META } from "@/lib/trainers";
import { useToastStore } from "@/stores/toast-store";

const PAGE_SIZE = 20;
type Filter = "ALL" | TrainerStatus;

const EMPTY_FORM = { firstName: "", lastName: "", email: "", password: "", phone: "", dni: "" };

export default function AdminTrainersPage() {
    const router = useRouter();
    const addToast = useToastStore((s) => s.addToast);
    const [search, setSearch] = useState("");
    const [status, setStatus] = useState<Filter>("ALL");
    const [page, setPage] = useState(1);
    const { data, isLoading, isFetching } = useAdminTrainers(search.trim(), status, page, PAGE_SIZE);

    const modal = useDisclosure();
    const create = useCreateTrainer();
    const [form, setForm] = useState(EMPTY_FORM);
    const [countryCode, setCountryCode] = useState("+54");
    const [phoneError, setPhoneError] = useState<string | null>(null);
    const [dniError, setDniError] = useState<string | null>(null);

    const totalPages = Math.max(1, Math.ceil((data?.total ?? 0) / PAGE_SIZE));
    const counts = data?.counts;

    const openNew = () => { setForm(EMPTY_FORM); setPhoneError(null); setDniError(null); modal.onOpen(); };
    const canCreate = form.firstName.trim() && form.lastName.trim() && form.email.trim() && form.password
        && form.phone.trim() && form.dni.trim() && !phoneError && !dniError;

    const onCreate = () => {
        if (!canCreate) return;
        create.mutate(
            { ...form, email: form.email.trim(), phone: `${countryCode} ${form.phone.trim()}`, dni: form.dni.trim() },
            {
                onSuccess: (r) => {
                    modal.onClose();
                    addToast("Entrenador creado. Ya puede entrar y completar su perfil.");
                    if (r?.id) router.push(`/dashboard/trainers/${r.id}`);
                },
                onError: (e) => addToast(e.message),
            },
        );
    };

    return (
        <div className="space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                    <h1 className="text-2xl font-bold">Entrenadores</h1>
                    <p className="text-sm text-default-500 mt-1">Alta, estado y comisiones de los entrenadores de la plataforma.</p>
                </div>
                <Button color="primary" className="w-full sm:w-auto" startContent={<PlusIcon className="h-4 w-4" />} onPress={openNew}>
                    Nuevo entrenador
                </Button>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <Tabs aria-label="Estado" size="sm" selectedKey={status}
                    onSelectionChange={(k) => { setStatus(k as Filter); setPage(1); }}>
                    <Tab key="ALL" title={`Todos${counts ? ` (${counts.ALL})` : ""}`} />
                    <Tab key="PUBLISHED" title={`Publicados${counts ? ` (${counts.PUBLISHED})` : ""}`} />
                    <Tab key="DRAFT" title={`Borradores${counts ? ` (${counts.DRAFT})` : ""}`} />
                    <Tab key="SUSPENDED" title={`Suspendidos${counts ? ` (${counts.SUSPENDED})` : ""}`} />
                </Tabs>
                <Input
                    aria-label="Buscar entrenador"
                    placeholder="Buscar por nombre, email o DNI..."
                    variant="bordered"
                    size="sm"
                    className="sm:max-w-xs"
                    value={search}
                    onValueChange={(v) => { setSearch(v); setPage(1); }}
                    isClearable
                    onClear={() => { setSearch(""); setPage(1); }}
                    startContent={<MagnifyingGlassIcon className="h-4 w-4 text-default-400" />}
                />
            </div>

            {isLoading ? (
                <div className="flex justify-center py-12"><Spinner size="lg" /></div>
            ) : (
                <DataTable aria-label="Entrenadores">
                    <TableHeader>
                        <TableColumn>NOMBRE</TableColumn>
                        <TableColumn>CONTACTO</TableColumn>
                        <TableColumn>DEPORTES</TableColumn>
                        <TableColumn>FRANJAS</TableColumn>
                        <TableColumn>CLASES</TableColumn>
                        <TableColumn>CANCELACIONES</TableColumn>
                        <TableColumn>DESDE</TableColumn>
                        <TableColumn>ESTADO</TableColumn>
                        <TableColumn>ALTA</TableColumn>
                        <TableColumn> </TableColumn>
                    </TableHeader>
                    <TableBody emptyContent="No hay entrenadores" loadingContent={<Spinner />} isLoading={isFetching && !data}>
                        {(data?.items ?? []).map((t) => {
                            const meta = TRAINER_STATUS_META[t.status];
                            return (
                                <TableRow key={t.trainerId} className="cursor-pointer" onClick={() => router.push(`/dashboard/trainers/${t.trainerId}`)}>
                                    <TableCell className="font-medium">
                                        {t.firstName} {t.lastName}
                                        {!t.isTrainerRole && <p className="text-xs text-warning">Ya no tiene rol de entrenador</p>}
                                        {!t.isActive && <p className="text-xs text-danger">Cuenta desactivada</p>}
                                    </TableCell>
                                    <TableCell className="text-default-500">
                                        <p>{t.email}</p>
                                        <p className="text-xs">{t.phone || "—"} · DNI {t.dni || "—"}</p>
                                    </TableCell>
                                    <TableCell>{t.sports.length ? t.sports.join(", ") : "—"}</TableCell>
                                    <TableCell>{t.slotsCount}</TableCell>
                                    <TableCell>{t.classesCount}</TableCell>
                                    <TableCell className="text-xs text-default-500">
                                        <p>Entrenador: {t.cancelledByTrainer}</p>
                                        <p>Alumnos: {t.cancelledByClients}</p>
                                    </TableCell>
                                    <TableCell>{t.minRate != null ? <Credits amount={t.minRate} /> : "—"}</TableCell>
                                    <TableCell><Chip size="sm" variant="flat" color={meta.color}>{meta.label}</Chip></TableCell>
                                    <TableCell className="text-default-500">{formatDateTimeAr(t.createdAt)}</TableCell>
                                    <TableCell>
                                        <Button size="sm" variant="light" isIconOnly aria-label="Ver detalle"
                                            onPress={() => router.push(`/dashboard/trainers/${t.trainerId}`)}>
                                            <ChevronRightIcon className="h-4 w-4" />
                                        </Button>
                                    </TableCell>
                                </TableRow>
                            );
                        })}
                    </TableBody>
                </DataTable>
            )}
            <p className="text-xs text-default-500">"Desde" es la tarifa individual más baja del entrenador, sin la comisión.</p>

            {totalPages > 1 && (
                <div className="flex justify-center">
                    <Pagination size="sm" showControls total={totalPages} page={page} onChange={setPage} />
                </div>
            )}

            <Modal isOpen={modal.isOpen} onClose={modal.onClose} size="2xl" scrollBehavior="inside" placement="center">
                <ModalContent>
                    <ModalHeader>Nuevo entrenador</ModalHeader>
                    <ModalBody className="gap-4">
                        <p className="text-sm text-default-500">
                            Se crea la cuenta con rol Entrenador y su perfil en borrador. El entrenador entra con este email y contraseña,
                            completa su perfil y lo publica.
                        </p>
                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                            <Input label="Nombre" variant="bordered" isRequired value={form.firstName} onValueChange={(v) => setForm({ ...form, firstName: v })} />
                            <Input label="Apellido" variant="bordered" isRequired value={form.lastName} onValueChange={(v) => setForm({ ...form, lastName: v })} />
                            <Input label="Email" type="email" variant="bordered" isRequired value={form.email} onValueChange={(v) => setForm({ ...form, email: v })} />
                            <Input label="Contraseña" type="password" variant="bordered" isRequired value={form.password}
                                onValueChange={(v) => setForm({ ...form, password: v })} description="Mín. 8 caracteres, 1 mayúscula, 1 número" />
                            <PhoneInput value={form.phone} onChange={(v) => setForm({ ...form, phone: v })}
                                countryCode={countryCode} onCountryCodeChange={setCountryCode}
                                error={phoneError} onError={setPhoneError} isRequired />
                            <DniInput value={form.dni} onChange={(v) => setForm({ ...form, dni: v })}
                                error={dniError} onError={setDniError} isRequired />
                        </div>
                    </ModalBody>
                    <ModalFooter>
                        <Button variant="light" onPress={modal.onClose}>Cancelar</Button>
                        <Button color="primary" isLoading={create.isPending} isDisabled={!canCreate} onPress={onCreate}>
                            Crear entrenador
                        </Button>
                    </ModalFooter>
                </ModalContent>
            </Modal>
        </div>
    );
}
