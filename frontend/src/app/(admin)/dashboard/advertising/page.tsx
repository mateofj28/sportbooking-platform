"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
    Button, Chip, Input, Modal, ModalBody, ModalContent, ModalFooter, ModalHeader,
    Radio, RadioGroup, Select, SelectItem, Spinner, Switch, TableBody, TableCell,
    TableColumn, TableHeader, TableRow, Textarea, Tooltip, useDisclosure,
} from "@heroui/react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Eye, Megaphone, Pencil, Plus, Trash2 } from "lucide-react";
import { DataTable } from "@/components/shared/data-table";
import { ConfirmModal } from "@/components/shared/confirm-modal";
import { PromoCarousel, adToSlide, type PromoSlide } from "@/components/shared/promo-carousel";
import { PROVINCES, provinceName } from "@/lib/ar-provinces";
import {
    AD_LIMITS, AD_STATUS_META, AD_THEMES, AD_THEME_KEYS, adGradient, describeSchedule,
    describeTargeting, getAdStatus, isoToArLocal, type AdStatus, type AdTheme, type Advertisement,
} from "@/lib/ads";
import {
    advertisementSchema, EMPTY_AD_FORM, type AdvertisementFormData,
} from "@/lib/validations/advertisement.schema";
import {
    PREVIEW_NO_PROVINCE, useActiveAdvertisements, useAdminAdvertisements,
    useDeleteAdvertisement, useSaveAdvertisement, useToggleAdvertisement,
} from "@/hooks/use-advertisements";
import { useAuthStore } from "@/stores/auth-store";
import { useToastStore } from "@/stores/toast-store";

type StatusFilter = "ALL" | AdStatus;
/** "ALL" = todos, "NATIONAL" = solo nacionales, o un código de provincia (anuncios que la incluyen). */
type ScopeFilter = string;

const STATUS_FILTERS: { key: StatusFilter; label: string }[] = [
    { key: "ALL", label: "Todos los estados" },
    { key: "ACTIVE", label: "Activas" },
    { key: "SCHEDULED", label: "Programadas" },
    { key: "EXPIRED", label: "Vencidas" },
    { key: "PAUSED", label: "Pausadas" },
];

/** Primera clave de un Select de selección simple (HeroUI entrega un Set). */
const firstKey = (keys: unknown): string | undefined => Array.from(keys as Set<string>)[0];

function adToForm(ad: Advertisement): AdvertisementFormData {
    return {
        title: ad.title,
        subtitle: ad.subtitle ?? "",
        description: ad.description ?? "",
        theme: ad.theme,
        linkUrl: ad.linkUrl ?? "",
        ctaLabel: ad.ctaLabel ?? "",
        scope: ad.scope,
        provinces: ad.provinces,
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
    const [previewProvince, setPreviewProvince] = useState<string>(PREVIEW_NO_PROVINCE);

    // "Ahora" se fija por render para que el estado de toda la tabla sea consistente
    const now = new Date();

    const filtered = useMemo(() => {
        const current = new Date();
        return (ads ?? []).filter((ad) => {
            if (statusFilter !== "ALL" && getAdStatus(ad, current) !== statusFilter) return false;
            if (scopeFilter === "NATIONAL") return ad.scope === "NATIONAL";
            if (scopeFilter !== "ALL") return ad.scope === "REGIONAL" && ad.provinces.includes(scopeFilter);
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
                        Gestioná las promociones que ven los clientes. Cada una puede mostrarse en todo el país o solo en provincias específicas.
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
                    onSelectionChange={(keys: unknown) => setScopeFilter(firstKey(keys) || "ALL")}
                >
                    {[
                        <SelectItem key="ALL">Todos los alcances</SelectItem>,
                        <SelectItem key="NATIONAL">Solo nacionales</SelectItem>,
                        ...PROVINCES.map((p) => <SelectItem key={p.code}>{`Incluye ${p.name}`}</SelectItem>),
                    ]}
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
                                            <span
                                                aria-hidden="true"
                                                className={`h-8 w-1.5 flex-shrink-0 rounded-full ${AD_THEMES[ad.theme]?.swatch ?? "bg-blue-600"}`}
                                            />
                                            <div className="min-w-0">
                                                <p className="max-w-[260px] truncate font-medium">{ad.title}</p>
                                                {ad.subtitle && (
                                                    <p className="max-w-[260px] truncate text-xs text-default-400">{ad.subtitle}</p>
                                                )}
                                            </div>
                                        </div>
                                    </TableCell>
                                    <TableCell><TargetingCell ad={ad} /></TableCell>
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

            {/* Simulador: lo que ve un cliente de cada provincia (misma RPC que usa la app) */}
            <ClientSimulator province={previewProvince} onProvinceChange={setPreviewProvince} />

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
function TargetingCell({ ad }: { ad: Advertisement }) {
    if (ad.scope === "NATIONAL") {
        return <Chip size="sm" variant="flat" color="primary">Todo el país</Chip>;
    }
    const shown = ad.provinces.slice(0, 2);
    const rest = ad.provinces.length - shown.length;
    return (
        <Tooltip content={describeTargeting(ad)} delay={200}>
            <div className="flex items-center gap-1">
                {shown.map((code) => (
                    <Chip key={code} size="sm" variant="flat">{provinceName(code)}</Chip>
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
    province, onProvinceChange,
}: { province: string; onProvinceChange: (p: string) => void }) {
    const { data, isLoading } = useActiveAdvertisements(province);
    const slides = useMemo(() => (data ?? []).map(adToSlide), [data]);

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
                            Mirá exactamente lo que vería un cliente de cada provincia hoy: solo publicidad activa y vigente.
                        </p>
                    </div>
                </div>
                <Select
                    label="Ver como cliente de" size="sm" variant="bordered" className="max-w-[300px]"
                    disallowEmptySelection
                    selectedKeys={[province]}
                    onSelectionChange={(keys: unknown) => onProvinceChange(firstKey(keys) || PREVIEW_NO_PROVINCE)}
                >
                    {[
                        <SelectItem key={PREVIEW_NO_PROVINCE}>Sin provincia (solo nacionales)</SelectItem>,
                        ...PROVINCES.map((p) => <SelectItem key={p.code}>{p.name}</SelectItem>),
                    ]}
                </Select>
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
    const {
        control, handleSubmit, watch, setValue, formState: { errors },
    } = useForm<AdvertisementFormData>({
        resolver: zodResolver(advertisementSchema),
        defaultValues: initial,
        mode: "onChange",
    });

    const values = watch();
    const scope = values.scope;

    // Vista previa en vivo con lo que se está escribiendo
    const previewSlide: PromoSlide = {
        title: values.title.trim() || "Título de la publicidad",
        subtitle: values.subtitle.trim() || null,
        description: values.description.trim() || null,
        bg: adGradient(values.theme),
        href: values.linkUrl.trim() || null,
        ctaLabel: values.ctaLabel.trim() || null,
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} size="2xl" scrollBehavior="inside">
            <ModalContent>
                <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex min-h-0 flex-1 flex-col">
                    <ModalHeader>{isEditing ? "Editar publicidad" : "Nueva publicidad"}</ModalHeader>
                    <ModalBody className="gap-5">
                        {/* Vista previa */}
                        <div>
                            <p className="mb-2 text-xs font-medium text-default-500">Vista previa</p>
                            <PromoCarousel slides={[previewSlide]} autoPlayMs={0} />
                        </div>

                        {/* Contenido */}
                        <Controller
                            name="title" control={control}
                            render={({ field }) => (
                                <Input
                                    {...field} label="Título" variant="bordered" isRequired
                                    placeholder="Ej: 🏆 Torneo de Fútbol 5"
                                    maxLength={AD_LIMITS.title}
                                    isInvalid={!!errors.title} errorMessage={errors.title?.message}
                                    description={`${field.value.length}/${AD_LIMITS.title}`}
                                />
                            )}
                        />
                        <Controller
                            name="subtitle" control={control}
                            render={({ field }) => (
                                <Input
                                    {...field} label="Subtítulo (opcional)" variant="bordered"
                                    placeholder="Ej: Inscripciones abiertas"
                                    maxLength={AD_LIMITS.subtitle}
                                    isInvalid={!!errors.subtitle} errorMessage={errors.subtitle?.message}
                                />
                            )}
                        />
                        <Controller
                            name="description" control={control}
                            render={({ field }) => (
                                <Textarea
                                    {...field} label="Descripción (opcional)" variant="bordered" minRows={2}
                                    placeholder="Contá en una o dos frases de qué se trata"
                                    maxLength={AD_LIMITS.description}
                                    isInvalid={!!errors.description} errorMessage={errors.description?.message}
                                    description={`${field.value.length}/${AD_LIMITS.description}`}
                                />
                            )}
                        />

                        {/* Color */}
                        <div>
                            <p id="ad-theme-label" className="mb-2 text-sm text-default-600">Color</p>
                            <div role="radiogroup" aria-labelledby="ad-theme-label" className="flex flex-wrap gap-2">
                                {AD_THEME_KEYS.map((key: AdTheme) => {
                                    const selected = values.theme === key;
                                    return (
                                        <button
                                            key={key} type="button" role="radio" aria-checked={selected}
                                            aria-label={AD_THEMES[key].label}
                                            onClick={() => setValue("theme", key, { shouldValidate: true })}
                                            className={`flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs transition-colors ${selected ? "border-primary bg-primary/10" : "border-divider hover:bg-default-100"}`}
                                        >
                                            <span aria-hidden="true" className={`h-4 w-4 rounded-full ${AD_THEMES[key].swatch}`} />
                                            {AD_THEMES[key].label}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>

                        {/* Destino */}
                        <div className="grid gap-4 sm:grid-cols-2">
                            <Controller
                                name="linkUrl" control={control}
                                render={({ field }) => (
                                    <Input
                                        {...field} label="Enlace (opcional)" variant="bordered"
                                        placeholder="https://… o /facilities"
                                        isInvalid={!!errors.linkUrl} errorMessage={errors.linkUrl?.message}
                                    />
                                )}
                            />
                            <Controller
                                name="ctaLabel" control={control}
                                render={({ field }) => (
                                    <Input
                                        {...field} label="Texto del botón (opcional)" variant="bordered"
                                        placeholder="Ej: Ver más"
                                        maxLength={AD_LIMITS.cta}
                                        isInvalid={!!errors.ctaLabel} errorMessage={errors.ctaLabel?.message}
                                    />
                                )}
                            />
                        </div>

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
                                            if (v === "NATIONAL") setValue("provinces", [], { shouldValidate: true });
                                        }}
                                    >
                                        <Radio value="NATIONAL" description="La ven clientes de todas las provincias, incluso quienes no eligieron una.">
                                            Todo el país
                                        </Radio>
                                        <Radio value="REGIONAL" description="Solo la ven clientes que viven en las provincias que elijas.">
                                            Provincias específicas
                                        </Radio>
                                    </RadioGroup>
                                )}
                            />
                            {scope === "REGIONAL" && (
                                <>
                                    <Controller
                                        name="provinces" control={control}
                                        render={({ field }) => (
                                            <Select
                                                label="Provincias" variant="bordered" isRequired
                                                selectionMode="multiple" isMultiline
                                                placeholder="Elegí una o más provincias"
                                                selectedKeys={new Set(field.value)}
                                                onSelectionChange={(keys: unknown) => field.onChange(Array.from(keys as Set<string>))}
                                                isInvalid={!!errors.provinces} errorMessage={errors.provinces?.message}
                                                renderValue={(items: { key?: React.Key | null; textValue?: string }[]) => (
                                                    <div className="flex flex-wrap gap-1">
                                                        {items.map((i) => (
                                                            <Chip key={i.key} size="sm" variant="flat">{i.textValue}</Chip>
                                                        ))}
                                                    </div>
                                                )}
                                            >
                                                {PROVINCES.map((p) => <SelectItem key={p.code}>{p.name}</SelectItem>)}
                                            </Select>
                                        )}
                                    />
                                    <div className="flex gap-3 text-xs">
                                        <button
                                            type="button" className="text-primary hover:underline"
                                            onClick={() => setValue("provinces", PROVINCES.map((p) => p.code), { shouldValidate: true })}
                                        >
                                            Seleccionar todas
                                        </button>
                                        <button
                                            type="button" className="text-primary hover:underline"
                                            onClick={() => setValue("provinces", [], { shouldValidate: true })}
                                        >
                                            Limpiar
                                        </button>
                                    </div>
                                </>
                            )}
                        </div>

                        {/* Programación */}
                        <div className="grid gap-4 sm:grid-cols-2">
                            <Controller
                                name="startsAt" control={control}
                                render={({ field }) => (
                                    <Input
                                        {...field} type="datetime-local" label="Comienza (opcional)" variant="bordered"
                                        labelPlacement="outside" placeholder=" "
                                        description="Hora de Argentina. Vacío = desde ya."
                                        isInvalid={!!errors.startsAt} errorMessage={errors.startsAt?.message}
                                    />
                                )}
                            />
                            <Controller
                                name="endsAt" control={control}
                                render={({ field }) => (
                                    <Input
                                        {...field} type="datetime-local" label="Termina (opcional)" variant="bordered"
                                        labelPlacement="outside" placeholder=" "
                                        description="Hora de Argentina. Vacío = sin vencimiento."
                                        isInvalid={!!errors.endsAt} errorMessage={errors.endsAt?.message}
                                    />
                                )}
                            />
                        </div>

                        <div className="grid gap-4 sm:grid-cols-2">
                            <Controller
                                name="priority" control={control}
                                render={({ field }) => (
                                    <Input
                                        type="number" label="Prioridad" variant="bordered"
                                        min={AD_LIMITS.priorityMin} max={AD_LIMITS.priorityMax}
                                        value={Number.isNaN(field.value) ? "" : String(field.value)}
                                        onValueChange={(v) => field.onChange(v === "" ? NaN : Number(v))}
                                        onBlur={field.onBlur}
                                        description="0 a 100. Las de mayor número aparecen primero."
                                        isInvalid={!!errors.priority} errorMessage={errors.priority?.message}
                                    />
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
