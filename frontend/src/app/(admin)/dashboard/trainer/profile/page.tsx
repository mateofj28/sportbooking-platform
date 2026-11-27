"use client";

// Perfil público del entrenador: descripción, experiencia y deportes (spec entrenadores, Etapa 1).
// Los datos personales (nombre, teléfono, DNI, foto) se editan en "Mi perfil", como cualquier usuario.
import { Button, Card, CardBody, Checkbox, CheckboxGroup, Spinner, Textarea } from "@heroui/react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useMyTrainerPanel, useSaveTrainerProfile } from "@/hooks/use-trainer";
import { useSports } from "@/hooks/use-sports";
import { durationsLabel, TRAINER_LIMITS } from "@/lib/trainers";
import { trainerProfileSchema } from "@/lib/validations/trainer.schema";
import { useToastStore } from "@/stores/toast-store";

export default function TrainerProfilePage() {
    const { data: panel, isLoading } = useMyTrainerPanel();
    const { data: sports, isLoading: loadingSports } = useSports();
    const save = useSaveTrainerProfile();
    const addToast = useToastStore((s) => s.addToast);

    const [bio, setBio] = useState("");
    const [experience, setExperience] = useState("");
    const [sportIds, setSportIds] = useState<string[]>([]);
    const [errors, setErrors] = useState<Record<string, string>>({});

    useEffect(() => {
        if (!panel) return;
        setBio(panel.bio ?? "");
        setExperience(panel.experience ?? "");
        setSportIds(panel.sports.map((s) => s.id));
    }, [panel]);

    // Deportes que admiten clases; si el perfil tiene uno que ya no las admite, se muestra igual
    // (marcado) para que el entrenador pueda quitarlo.
    const options = useMemo(() => {
        const enabled = (sports ?? []).filter((s) => s.classesEnabled);
        const extra = (panel?.sports ?? []).filter((ps) => !enabled.some((s) => s.id === ps.id));
        return [
            ...enabled.map((s) => ({ id: s.id, name: s.name, durations: s.classDurations, max: s.classMaxStudents, disabled: false })),
            ...extra.map((s) => ({ id: s.id, name: s.name, durations: s.durations, max: s.maxStudents, disabled: true })),
        ];
    }, [sports, panel]);

    if (isLoading || loadingSports) return <div className="flex justify-center py-12"><Spinner size="lg" /></div>;
    if (!panel) return <p className="text-sm text-danger">No pudimos cargar tu perfil. Probá recargar la página.</p>;

    const onSave = () => {
        const parsed = trainerProfileSchema.safeParse({ bio, experience, sportIds });
        if (!parsed.success) {
            const e: Record<string, string> = {};
            for (const i of parsed.error.issues) e[String(i.path[0])] ??= i.message;
            setErrors(e);
            return;
        }
        setErrors({});
        save.mutate(parsed.data, {
            onSuccess: (p) => addToast(p.status === "DRAFT" && panel.status === "PUBLISHED"
                ? "Guardado. Tu perfil volvió a borrador: publicalo de nuevo desde el inicio."
                : "Perfil guardado"),
            onError: (e) => addToast(e.message),
        });
    };

    return (
        <div className="space-y-6 max-w-3xl">
            <div>
                <h1 className="text-2xl font-bold">Mi perfil de entrenador</h1>
                <p className="text-sm text-default-500 mt-1">Esto es lo que ven los clientes cuando buscan un entrenador.</p>
            </div>

            <Card shadow="none" className="bg-content1">
                <CardBody className="gap-1 p-5 text-sm">
                    <p className="font-semibold">{panel.firstName} {panel.lastName}</p>
                    <p className="text-default-500">{panel.email} · {panel.phone || "sin teléfono"} · DNI {panel.dni || "—"}</p>
                    <p className="text-default-500">
                        La foto, el nombre y el teléfono se cambian en <Link href="/profile" className="text-primary underline">Mi perfil</Link>.
                    </p>
                </CardBody>
            </Card>

            <div className="space-y-4">
                <Textarea
                    label="Descripción corta"
                    variant="bordered"
                    value={bio}
                    onValueChange={setBio}
                    maxLength={TRAINER_LIMITS.bio}
                    description={`${bio.length}/${TRAINER_LIMITS.bio}. Ej.: "Profe de tenis, clases para todas las edades".`}
                    isInvalid={!!errors.bio}
                    errorMessage={errors.bio}
                />
                <Textarea
                    label="Experiencia"
                    variant="bordered"
                    minRows={4}
                    value={experience}
                    onValueChange={setExperience}
                    maxLength={TRAINER_LIMITS.experience}
                    description={`${experience.length}/${TRAINER_LIMITS.experience}. Títulos, años dando clases, logros.`}
                    isInvalid={!!errors.experience}
                    errorMessage={errors.experience}
                />

                <CheckboxGroup
                    label="Deportes que enseñás"
                    value={sportIds}
                    onValueChange={setSportIds}
                    isInvalid={!!errors.sportIds}
                    errorMessage={errors.sportIds}
                >
                    {options.length === 0 && (
                        <p className="text-sm text-default-500">Todavía no hay deportes habilitados para clases. La administración los habilita.</p>
                    )}
                    {options.map((o) => (
                        <Checkbox key={o.id} value={o.id} isDisabled={o.disabled && !sportIds.includes(o.id)}>
                            <span className="text-sm">{o.name}</span>
                            <span className="ml-2 text-xs text-default-500">
                                {o.disabled
                                    ? "ya no admite clases: quitalo"
                                    : `clases de ${durationsLabel(o.durations)} · ${(o.max ?? 1) > 1 ? `hasta ${o.max} alumnos` : "individual"}`}
                            </span>
                        </Checkbox>
                    ))}
                </CheckboxGroup>
                <p className="text-xs text-default-500">
                    La duración de las clases y el cupo de alumnos los define la administración para cada deporte.
                </p>
            </div>

            <Button color="primary" className="w-full sm:w-auto" isLoading={save.isPending} onPress={onSave}>
                Guardar perfil
            </Button>
        </div>
    );
}
