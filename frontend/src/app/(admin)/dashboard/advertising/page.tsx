"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
    Button, Chip, Input, Modal, ModalBody, ModalContent, ModalFooter, ModalHeader,
    Radio, RadioGroup, Select, SelectItem, Spinner, Switch, TableBody, TableCell,
    TableColumn, TableHeader, TableRow, Tooltip, useDisclosure,
} from "@heroui/react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Eye, Megaphone, Pencil, Plus, Trash2 } from "lucide-react";
import { DataTable } from "@/components/shared/data-table";
import { ConfirmModal } from "@/components/shared/confirm-modal";
import { DateTimeField } from "@/components/shared/date-time-field";
import { PromoCarousel, adToSlide, type PromoSlide } from "@/components/shared/promo-carousel";
import { AdImageUpload } from "@/components/shared/ad-image-upload";
import { LocalityPicker, LocalitySearch, useLocalityIndex } from "@/components/shared/locality-picker";
import type { LocalityInfo } from "@/lib/geo/locality-locator";
import {
    AD_LIMITS, AD_STATUS_META, describeSchedule,
    AD_MAX_LOCALITIES, describeTargeting, getAdStatus, isoToArLocal, localityLabel, maxAdDate, todayAr,
    type AdStatus, type Advertisement,
} from "@/lib/ads";
import {
    createAdvertisementSchema, EMPTY_AD_FORM, type AdvertisementFormData,
} from "@/lib/validations/advertisement.schema";
import {
    PREVIEW_NO_LOCALITY, useActiveAdvertisements, useAdminAdvertisements,
    useDeleteAdvertisement, useSaveAdvertisement, useToggleAdvertisement,
} from "@/hooks/use-advertisements";
import { useAuthStore } from "@/stores/auth-store";
import { useToastStore } from "@/stores/toast-store";

type StatusFilter = "ALL" | AdStatus;
/** "ALL" = todas, "NATIONAL" = solo nacionales, "LOCAL" = solo por municipio. */
type ScopeFilter = "ALL" | "NATIONAL" | "LOCAL";

const SCOPE_FILTERS: { key: ScopeFilter; label: string }[] = [
    { key: "ALL", label: "Todas las zonas" },
    { key: "NATIONAL", label: "Todo el país" },
    { key: "LOCAL", label: "Por municipio" },
];

const STATUS_FILTERS: { key: StatusFilter; label: string }[] = [
    { key: "ALL", label: "Todos los estados" },
    { key: "ACTIVE", label: "Activas" },
    { key: "SCHEDULED", label: "Programadas" },
    { key: "EXPIRED", label: "Vencidas" },
    { key: "PAUSED", label: "Pausadas" },
];

/** Prioridades elegibles: 0, 10, 20 … 100. */
const PRIORITY_STEPS = Array.from({ length: 11 }, (_, i) => i * 10);

function priorityLabel(p: number): string {
    if (p === AD_LIMITS.priorityMin) return `${p} · Más baja`;
    if (p === 50) return `${p} · Media`;
    if (p === AD_LIMITS.priorityMax) return `${p} · Más alta`;
    return String(p);
}

/** Primera clave de un Select de selección simple (HeroUI entrega un Set). */
const firstKey = (keys: unknown): string | undefined => Array.from(keys as Set<string>)[0];

function adToForm(ad: Advertisement): AdvertisementFormData {
    return {
        title: ad.title,
        altText: ad.altText,
        imageUrl: ad.imageUrl,
        imageMobileUrl: ad.imageMobileUrl ?? "",
        linkUrl: ad.linkUrl ?? "",
        scope: ad.scope,
        localities: ad.localities,
        priority: ad.priority,
        startsAt: isoToArLocal(ad.startsAt),
        endsAt: isoToArLocal(ad.endsAt),
        isActive: ad.isActive,
    };
}

export default function AdvertisingPage() {
    const router = useRouter();
    const user = useAuthStore((s) => s.user);
    const isHydrated = useAuthStore((s) => s.isHydrated);
    const isAdmin = user?.role === "ADMIN";
    const addToast = useToastStore((s) => s.addToast);

    // Solo el admin general gestiona publicidad (la base también lo exige por RLS)
    useEffect(() => {
        if (isHydrated && user && !isAdmin) router.replace("/dashboard");
    }, [isHydrated, user, isAdmin, router]);

    const { data: ads, isLoading, isError, error, refetch } = useAdminAdvertisements(isAdmin);
    const saveMutation = useSaveAdvertisement();
    const toggleMutation = useToggleAdvertisement();
    const deleteMutation = useDeleteAdvertisement();

    const { isOpen, onOpen, onClose } = useDisclosure();
    const [editing, setEditing] = useState<Advertisement | null>(null);
    const [deleteTarget, setDeleteTarget] = useState<Advertisement | null>(null);

    const [statusFilter, setStatusFilter] = useState<StatusFilter>("ALL");
    const [scopeFilter, setScopeFilter] = useState<ScopeFilter>("ALL");
    const [previewLocality, setPreviewLocality] = useState<string>(PREVIEW_NO_LOCALITY);
    const { data: localityIndex } = useLocalityIndex();

    // "Ahora" se fija por render para que el estado de toda la tabla sea consistente
    const now = new Date();

    const filtered = useMemo(() => {
        const current = new Date();
        return (ads ?? []).filter((ad) => {
            if (statusFilter !== "ALL" && getAdStatus(ad, current) !== statusFilter) return false;
            if (scopeFilter !== "ALL" && ad.scope !== scopeFilter) return false;
            return true;
        });
    }, [ads, statusFilter, scopeFilter]);

    const hasFilters = statusFilter !== "ALL" || scopeFilter !== "ALL";

    const openCreate = () => { setEditing(null); onOpen(); };
    const openEdit = (ad: Advertisement) => { setEditing(ad); onOpen(); };

    const handleSave = (data: AdvertisementFormData) => {
        saveMutation.mutate(
            { id: editing?.id, data },
            {
                onSuccess: () => {
                    addToast(editing ? "Publicidad actualizada" : "Publicidad creada");
                    onClose();
                },
                onError: (e) => addToast(`No se pudo guardar: ${e.message}`, "error"),
            },
        );
    };

    const handleToggle = (ad: Advertisement, isActive: boolean) => {
        toggleMutation.mutate(
            { id: ad.id, isActive },
            {
                onSuccess: () => addToast(isActive ? "Publicidad reanudada" : "Publicidad pausada"),
                onError: (e) => addToast(`No se pudo actualizar: ${e.message}`, "error"),
            },
        );
    };

    const handleDelete = () => {
        if (!deleteTarget) return;
        deleteMutation.mutate(deleteTarget.id, {
            onSuccess: () => addToast("Publicidad eliminada"),
            onError: (e) => addToast(`No se pudo eliminar: ${e.message}`, "error"),
        });
        setDeleteTarget(null);
    };

    if (!isHydrated || !user) {
        return <div className="flex items-center justify-center py-12"><Spinner size="lg" /></div>;
    }
    if (!isAdmin) return null;

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                    <h1 className="text-2xl font-bold">Publicidad</h1>
                    <p className="mt-1 text-sm text-default-500">
                        Gestioná las promociones que ven los clientes. Cada una puede mostrarse en todo el país o solo en municipios específicos, según dónde esté el cliente.
                    </p>
                </div>
                <Button color="primary" startContent={<Plus className="h-4 w-4" />} onPress={openCreate}>
                    Nueva publicidad
                </Button>
            </div>

            {/* Filtros */}
            <div className="flex flex-wrap items-end gap-3">
                <Select
                    label="Estado" size="sm" variant="bordered" className="max-w-[220px]"
                    disallowEmptySelection
                    selectedKeys={[statusFilter]}
                    onSelectionChange={(keys: unknown) => setStatusFilter((firstKey(keys) as StatusFilter) || "ALL")}
                >
                    {STATUS_FILTERS.map((s) => <SelectItem key={s.key}>{s.label}</SelectItem>)}
                </Select>
                <Select
                    label="Alcance" size="sm" variant="bordered" className="max-w-[260px]"
                    disallowEmptySelection
                    selectedKeys={[scopeFilter]}
                    onSelectionChange={(keys: unknown) => setScopeFilter((firstKey(keys) as ScopeFilter) || "ALL")}
                >
                    {SCOPE_FILTERS.map((s) => <SelectItem key={s.key}>{s.label}</SelectItem>)}
                </Select>
                {hasFilters && (
                    <button
                        type="button"
                        onClick={() => { setStatusFilter("ALL"); setScopeFilter("ALL"); }}
                        className="pb-2 text-xs text-primary hover:underline"
                    >
                        Limpiar filtros
                    </button>
                )}
                {ads && (
                    <span className="pb-2 text-xs text-default-400">
                        {filtered.length} de {ads.length} publicidad{ads.length !== 1 ? "es" : ""}
                    </span>
                )}
            </div>

            {/* Tabla */}
            {isLoading ? (
                <div className="flex items-center justify-center py-12"><Spinner size="lg" /></div>
            ) : isError ? (
                <div className="rounded-xl border border-danger-200 p-6 text-center">
                    <p className="text-sm font-semibold text-danger">No se pudieron cargar las publicidades</p>
                    <p className="mt-1 text-xs text-default-500">{error?.message}</p>
                    <button type="button" onClick={() => refetch()} className="mt-2 text-xs text-primary hover:underline">
                        Reintentar
                    </button>
                </div>
            ) : (
                <DataTable aria-label="Publicidades">
                    <TableHeader>
                        <TableColumn>PUBLICIDAD</TableColumn>
                        <TableColumn>SEGMENTACIÓN</TableColumn>
                        <TableColumn>VIGENCIA</TableColumn>
                        <TableColumn align="center">PRIORIDAD</TableColumn>
                        <TableColumn>ESTADO</TableColumn>
                        <TableColumn align="center">PUBLICADA</TableColumn>
                        <TableColumn align="end">ACCIONES</TableColumn>
                    </TableHeader>
                    <TableBody
                        emptyContent={hasFilters ? "Ninguna publicidad coincide con los filtros" : "Todavía no hay publicidades. Creá la primera."}
                    >
                        {filtered.map((ad) => {
                            const status = getAdStatus(ad, now);
                            const meta = AD_STATUS_META[status];
                            return (
                                <TableRow key={ad.id}>
                                    <TableCell>
                                        <div className="flex items-center gap-3">
                                            {/* eslint-disable-next-line @next/next/no-img-element */}
                                            <img
                                                src={ad.imageUrl}
                                                alt=""
                                                loading="lazy"
                                                className="aspect-[24/5] w-28 flex-shrink-0 rounded-md border border-divider object-cover"
                                            />
                                            <div className="min-w-0">
                                                <p className="max-w-[220px] truncate font-medium">{ad.title}</p>
                                                <p className="max-w-[220px] truncate text-xs text-default-400">
                                                    {ad.imageMobileUrl ? "Con imagen para celular" : "Sin imagen para celular"}
                                                </p>
                                            </div>
                                        </div>
                                    </TableCell>
                                    <TableCell><TargetingCell ad={ad} index={localityIndex} /></TableCell>
                                    <TableCell className="text-default-500">{describeSchedule(ad)}</TableCell>
                                    <TableCell className="text-center text-default-500">{ad.priority}</TableCell>
                                    <TableCell>
                                        <Chip size="sm" variant="flat" color={meta.color}>{meta.label}</Chip>
                                    </TableCell>
                                    <TableCell>
                                        <Switch
                                            size="sm"
                                            aria-label={ad.isActive ? `Pausar ${ad.title}` : `Reanudar ${ad.title}`}
                                            isSelected={ad.isActive}
                                            isDisabled={toggleMutation.isPending}
                                            onValueChange={(v) => handleToggle(ad, v)}
                                        />
                                    </TableCell>
                                    <TableCell>
                                        <div className="flex justify-end gap-1">
                                            <Button size="sm" color="primary" variant="light" isIconOnly aria-label={`Editar ${ad.title}`} onPress={() => openEdit(ad)}>
                                                <Pencil className="h-4 w-4" />
                                            </Button>
                                            <Button size="sm" color="danger" variant="light" isIconOnly aria-label={`Eliminar ${ad.title}`} onPress={() => setDeleteTarget(ad)}>
                                                <Trash2 className="h-4 w-4" />
                                            </Button>
                                        </div>
                                    </TableCell>
                                </TableRow>
                            );
                        })}
                    </TableBody>
                </DataTable>
            )}

            {/* Simulador: lo que ve alguien que está en un municipio (misma RPC que usa la app) */}
            <ClientSimulator
                locality={previewLocality}
                onLocalityChange={setPreviewLocality}
                index={localityIndex}
            />

            {/* Crear / editar */}
            {isOpen && (
                <AdFormModal
                    key={editing?.id ?? "new"}
                    isOpen={isOpen}
                    onClose={onClose}
                    initial={editing ? adToForm(editing) : EMPTY_AD_FORM}
                    isEditing={!!editing}
                    isSaving={saveMutation.isPending}
                    onSubmit={handleSave}
                />
            )}

            <ConfirmModal
                isOpen={!!deleteTarget}
                onClose={() => setDeleteTarget(null)}
                onConfirm={handleDelete}
                title="Eliminar publicidad"
                message={`¿Eliminar "${deleteTarget?.title ?? ""}"? Dejará de mostrarse a los clientes y no se puede deshacer. Si solo querés ocultarla un tiempo, pausala.`}
                confirmLabel="Sí, eliminar"
            />
        </div>
    );
}

// ---------------------------------------------------------------
// Segmentación en la tabla
// ---------------------------------------------------------------
function TargetingCell({ ad, index }: { ad: Advertisement; index?: Map<string, LocalityInfo> }) {
    if (ad.scope === "NATIONAL") {
        return <Chip size="sm" variant="flat" color="primary">Todo el país</Chip>;
    }
    const shown = ad.localities.slice(0, 2);
    const rest = ad.localities.length - shown.length;
    const all = ad.localities.map((c) => localityLabel(c, index)).join(", ");
    return (
        <Tooltip content={<span className="block max-w-xs">{all}</span>} delay={200}>
            <div className="flex items-center gap-1" aria-label={describeTargeting(ad, index)}>
                {shown.map((code) => (
                    <Chip key={code} size="sm" variant="flat">{index?.get(code)?.name ?? code}</Chip>
                ))}
                {rest > 0 && <Chip size="sm" variant="flat" color="secondary">+{rest}</Chip>}
            </div>
        </Tooltip>
    );
}

// ---------------------------------------------------------------
// Simulador "ver como cliente de …"
// ---------------------------------------------------------------
function ClientSimulator({
    locality, onLocalityChange, index,
}: { locality: string; onLocalityChange: (code: string) => void; index?: Map<string, LocalityInfo> }) {
    const { data, isLoading } = useActiveAdvertisements(locality === PREVIEW_NO_LOCALITY ? null : locality);
    const slides = useMemo(() => (data ?? []).map(adToSlide), [data]);
    const hasLocality = locality !== PREVIEW_NO_LOCALITY;

    return (
        <section className="space-y-4 rounded-2xl border border-divider bg-content1 p-5">
            <div className="flex flex-wrap items-end justify-between gap-3">
                <div className="flex items-start gap-3">
                    <div className="mt-0.5 flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10">
                        <Eye className="h-4 w-4 text-primary" aria-hidden="true" />
                    </div>
                    <div>
                        <h2 className="text-base font-semibold">Vista del cliente</h2>
                        <p className="text-xs text-default-500">
                            Mirá exactamente lo que vería hoy alguien que está en un municipio (la app usa su ubicación actual): solo publicidad activa y vigente.
                        </p>
                    </div>
                </div>
            </div>

            <div className="space-y-2">
                <LocalitySearch onSelect={onLocalityChange} label="Ver como cliente que está en…" />
                <div className="flex flex-wrap items-center gap-2 text-sm">
                    <span className="text-default-500">Simulando:</span>
                    <Chip size="sm" variant="flat" color={hasLocality ? "primary" : "default"}>
                        {hasLocality ? localityLabel(locality, index) : "Sin ubicación (solo nacionales)"}
                    </Chip>
                    {hasLocality && (
                        <Button size="sm" variant="light" onPress={() => onLocalityChange(PREVIEW_NO_LOCALITY)}>
                            Ver sin ubicación
                        </Button>
                    )}
                </div>
            </div>

            {isLoading ? (
                <div className="flex justify-center py-6"><Spinner /></div>
            ) : slides.length > 0 ? (
                <>
                    <p className="text-xs text-default-400">
                        Ve {slides.length} publicidad{slides.length !== 1 ? "es" : ""}, en este orden.
                    </p>
                    <PromoCarousel slides={slides} autoPlayMs={0} />
                </>
            ) : (
                <div className="flex flex-col items-center gap-2 py-6 text-center">
                    <Megaphone className="h-6 w-6 text-default-300" aria-hidden="true" />
                    <p className="text-sm text-default-500">Este cliente no vería ninguna publicidad.</p>
                </div>
            )}
        </section>
    );
}

// ---------------------------------------------------------------
// Formulario (crear / editar)
// ---------------------------------------------------------------
interface AdFormModalProps {
    isOpen: boolean;
    onClose: () => void;
    initial: AdvertisementFormData;
    isEditing: boolean;
    isSaving: boolean;
    onSubmit: (data: AdvertisementFormData) => void;
}

function AdFormModal({ isOpen, onClose, initial, isEditing, isSaving, onSubmit }: AdFormModalProps) {
    // El esquema recuerda las fechas con las que se abrió el formulario: la regla de
    // "no en el pasado" solo se exige sobre fechas nuevas o modificadas.
    const [schema] = useState(() =>
        createAdvertisementSchema({ startsAt: initial.startsAt, endsAt: initial.endsAt }),
    );

    const {
        control, handleSubmit, watch, setValue, formState: { errors },
    } = useForm<AdvertisementFormData>({
        resolver: zodResolver(schema),
        defaultValues: initial,
        mode: "onChange",
    });

    const values = watch();
    const scope = values.scope;

    // Prioridad: de 10 en 10. Si el anuncio ya tenía un valor intermedio (p. ej. cargado por API),
    // se conserva como opción extra para no cambiárselo en silencio.
    const priorityOptions = useMemo(() => {
        const set = new Set<number>(PRIORITY_STEPS);
        if (Number.isFinite(initial.priority)) set.add(initial.priority);
        return Array.from(set).sort((a, b) => a - b);
    }, [initial.priority]);

    // Límites de los selectores de fecha (hora de Argentina). Al editar un anuncio que ya
    // empezó/venció, su fecha original sigue siendo elegible para no forzar a cambiarla.
    const today = todayAr();
    const maxDate = maxAdDate();
    const initialStartDay = initial.startsAt.slice(0, 10);
    const initialEndDay = initial.endsAt.slice(0, 10);
    const startMin = initialStartDay && initialStartDay < today ? initialStartDay : today;
    const endBase = initialEndDay && initialEndDay < today ? initialEndDay : today;
    const startDay = values.startsAt.slice(0, 10);
    const endMin = startDay && startDay > endBase ? startDay : endBase;

    // Vista previa en vivo con las imágenes subidas
    const previewSlide: PromoSlide | null = values.imageUrl
        ? {
            alt: values.altText.trim() || values.title.trim() || "Publicidad",
            image: values.imageUrl,
            imageMobile: values.imageMobileUrl || null,
            href: values.linkUrl.trim() || null,
        }
        : null;
    return (
        <Modal isOpen={isOpen} onClose={onClose} size="2xl" scrollBehavior="inside">
            <ModalContent>
                <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex min-h-0 flex-1 flex-col">
                    <ModalHeader>{isEditing ? "Editar publicidad" : "Nueva publicidad"}</ModalHeader>
                    <ModalBody className="gap-5">
                        {/* Imágenes del banner */}
                        <Controller
                            name="imageUrl" control={control}
                            render={({ field }) => (
                                <AdImageUpload
                                    kind="desktop" isRequired
                                    value={field.value}
                                    onChange={(url) => setValue("imageUrl", url, { shouldValidate: true, shouldDirty: true })}
                                    errorMessage={errors.imageUrl?.message}
                                />
                            )}
                        />
                        <Controller
                            name="imageMobileUrl" control={control}
                            render={({ field }) => (
                                <AdImageUpload
                                    kind="mobile"
                                    value={field.value}
                                    onChange={(url) => setValue("imageMobileUrl", url, { shouldValidate: true, shouldDirty: true })}
                                    errorMessage={errors.imageMobileUrl?.message}
                                />
                            )}
                        />

                        {/* Vista previa (como la ve el cliente) */}
                        {previewSlide && (
                            <div>
                                <p className="mb-2 text-xs font-medium text-default-500">Vista previa en computadora</p>
                                <PromoCarousel slides={[{ ...previewSlide, imageMobile: null }]} autoPlayMs={0} />
                                {previewSlide.imageMobile && (
                                    <>
                                        <p className="mb-2 mt-4 text-xs font-medium text-default-500">Vista previa en celular</p>
                                        <div className="max-w-sm">
                                            <PromoCarousel slides={[{ ...previewSlide, image: previewSlide.imageMobile, imageMobile: null }]} autoPlayMs={0} />
                                        </div>
                                    </>
                                )}
                            </div>
                        )}

                        {/* Datos */}
                        <Controller
                            name="title" control={control}
                            render={({ field }) => (
                                <Input
                                    {...field} label="Nombre interno" variant="bordered" isRequired
                                    placeholder="Ej: Personal 5G — noviembre"
                                    maxLength={AD_LIMITS.title}
                                    isInvalid={!!errors.title} errorMessage={errors.title?.message}
                                    description="Solo se ve en este panel, para reconocerla."
                                />
                            )}
                        />
                        <Controller
                            name="altText" control={control}
                            render={({ field }) => (
                                <Input
                                    {...field} label="¿Qué dice la imagen?" variant="bordered" isRequired
                                    placeholder="Ej: 5G para todos. Premiados como la red más rápida del país"
                                    maxLength={AD_LIMITS.alt}
                                    isInvalid={!!errors.altText} errorMessage={errors.altText?.message}
                                    description={`Lo leen los lectores de pantalla. ${field.value.length}/${AD_LIMITS.alt}`}
                                />
                            )}
                        />
                        <Controller
                            name="linkUrl" control={control}
                            render={({ field }) => (
                                <Input
                                    {...field} label="Enlace al tocarla (opcional)" variant="bordered"
                                    placeholder="https://… o /facilities"
                                    isInvalid={!!errors.linkUrl} errorMessage={errors.linkUrl?.message}
                                />
                            )}
                        />
                        {/* Segmentación */}
                        <div className="space-y-3 rounded-xl border border-divider p-4">
                            <Controller
                                name="scope" control={control}
                                render={({ field }) => (
                                    <RadioGroup
                                        label="¿Dónde se muestra?"
                                        value={field.value}
                                        onValueChange={(v) => {
                                            field.onChange(v);
                                            if (v === "NATIONAL") setValue("localities", [], { shouldValidate: true });
                                        }}
                                    >
                                        <Radio value="NATIONAL" description="La ven todos los clientes, estén donde estén (también quienes no compartieron su ubicación).">
                                            Todo el país
                                        </Radio>
                                        <Radio value="LOCAL" description="Solo la ven clientes que están en los municipios que elijas, según su ubicación actual.">
                                            Municipios específicos
                                        </Radio>
                                    </RadioGroup>
                                )}
                            />
                            {scope === "LOCAL" && (
                                <Controller
                                    name="localities" control={control}
                                    render={({ field }) => (
                                        <LocalityPicker
                                            value={field.value}
                                            onChange={(codes) => field.onChange(codes)}
                                            max={AD_MAX_LOCALITIES}
                                            isInvalid={!!errors.localities}
                                            errorMessage={errors.localities?.message}
                                        />
                                    )}
                                />
                            )}
                        </div>

                        {/* Programación */}
                        <div className="grid gap-5">
                            <Controller
                                name="startsAt" control={control}
                                render={({ field }) => (
                                    <DateTimeField
                                        label="Comienza (opcional)"
                                        value={field.value}
                                        onChange={field.onChange}
                                        defaultTime="00:00"
                                        minDate={startMin}
                                        maxDate={maxDate}
                                        description="Hora de Argentina. Sin fecha = se publica desde ya. Al elegir el día, arranca a las 00:00."
                                        isInvalid={!!errors.startsAt} errorMessage={errors.startsAt?.message}
                                    />
                                )}
                            />
                            <Controller
                                name="endsAt" control={control}
                                render={({ field }) => (
                                    <DateTimeField
                                        label="Termina (opcional)"
                                        value={field.value}
                                        onChange={field.onChange}
                                        defaultTime="23:59"
                                        minDate={endMin}
                                        maxDate={maxDate}
                                        description="Hora de Argentina. Sin fecha = sin vencimiento. Al elegir el día, termina a las 23:59."
                                        isInvalid={!!errors.endsAt} errorMessage={errors.endsAt?.message}
                                    />
                                )}
                            />
                        </div>

                        <div className="grid gap-4 sm:grid-cols-2">
                            <Controller
                                name="priority" control={control}
                                render={({ field }) => (
                                    <Select
                                        label="Prioridad" variant="bordered"
                                        disallowEmptySelection
                                        selectedKeys={[String(field.value)]}
                                        onSelectionChange={(keys: unknown) => {
                                            const k = firstKey(keys);
                                            if (k !== undefined) field.onChange(Number(k));
                                        }}
                                        description="Las de mayor número aparecen primero."
                                        isInvalid={!!errors.priority} errorMessage={errors.priority?.message}
                                    >
                                        {priorityOptions.map((p) => (
                                            <SelectItem key={String(p)}>{priorityLabel(p)}</SelectItem>
                                        ))}
                                    </Select>
                                )}
                            />
                            <Controller
                                name="isActive" control={control}
                                render={({ field }) => (
                                    <div className="flex items-center">
                                        <Switch isSelected={field.value} onValueChange={field.onChange}>
                                            Publicada
                                        </Switch>
                                    </div>
                                )}
                            />
                        </div>
                    </ModalBody>
                    <ModalFooter>
                        <Button variant="light" onPress={onClose} isDisabled={isSaving}>Cancelar</Button>
                        <Button color="primary" type="submit" isLoading={isSaving}>
                            {isEditing ? "Guardar cambios" : "Crear publicidad"}
                        </Button>
                    </ModalFooter>
                </form>
            </ModalContent>
        </Modal>
    );
}
