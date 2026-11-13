"use client";
import { toAppError } from '@/lib/error-messages'

import { Button, Card, CardBody, CardHeader, Input, Divider, Spinner } from "@heroui/react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAuthStore } from "@/stores/auth-store";
import { useToastStore } from "@/stores/toast-store";
import { Navbar } from "@/components/layout/navbar";
import { PhoneInput, COUNTRY_CODES, validatePhoneNumber } from "@/components/shared/phone-input";
import { User, Mail, Save, Lock, Eye, EyeOff } from "lucide-react";
import { z } from "zod";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { User as UserType } from "@/types";

const DEFAULT_COUNTRY = "+54";

/** "+54 11 2345-6789" -> { code: "+54", local: "11 2345-6789" }. Sin código conocido: Argentina. */
function splitPhone(phone: string | null | undefined): { code: string; local: string } {
    const value = (phone ?? "").trim();
    if (!value) return { code: DEFAULT_COUNTRY, local: "" };
    // El código más largo primero (+593 antes que +59…)
    const match = [...COUNTRY_CODES]
        .sort((a, b) => b.code.length - a.code.length)
        .find((c) => value.startsWith(`${c.code} `) || value === c.code);
    if (match) return { code: match.code, local: value.slice(match.code.length).trim() };
    return { code: DEFAULT_COUNTRY, local: value.replace(/[^\d\s-]/g, "") };
}

/** Dato fijo del perfil, mostrado como texto. */
function ProfileField({ icon, label, value }: { icon?: React.ReactNode; label: string; value?: string | null }) {
    return (
        <div className="min-w-0">
            <dt className="text-xs text-default-500">{label}</dt>
            <dd className="mt-1 flex items-center gap-2 text-sm text-foreground">
                {icon && <span className="text-default-400" aria-hidden="true">{icon}</span>}
                <span className="truncate">{value?.trim() || <span className="text-default-400">Sin cargar</span>}</span>
            </dd>
        </div>
    );
}

export default function ProfilePage() {
    const { user, _updateUser: updateUser, isAuthenticated, isHydrated } = useAuthStore();
    const router = useRouter();
    const addToast = useToastStore((s) => s.addToast);

    useEffect(() => {
        if (isHydrated && !isAuthenticated) {
            router.replace("/login");
        }
    }, [isHydrated, isAuthenticated, router]);

    // Datos del perfil desde la base (el store puede no tener nombre ni teléfono)
    const { data: profile, isLoading: profileLoading } = useQuery({
        queryKey: ["my-profile", user?.id],
        enabled: !!user?.id,
        queryFn: async () => {
            const { data, error } = await supabase
                .from("profiles")
                .select("first_name, last_name, email, phone")
                .eq("id", user!.id)
                .single();
            if (error) throw toAppError(error);
            return data;
        },
    });

    // Cuenta de Supabase Auth: email actual y, si hay un cambio sin confirmar, el nuevo
    const { data: authUser, refetch: refetchAuthUser } = useQuery({
        queryKey: ["my-auth-user", user?.id],
        enabled: !!user?.id,
        queryFn: async () => {
            const { data, error } = await supabase.auth.getUser();
            if (error) throw toAppError(error);
            return { email: data.user?.email ?? "", newEmail: data.user?.new_email ?? null };
        },
    });

    // Editables: teléfono y email. Nombre y apellido son fijos (la base lo exige:
    // guard_profile_update, migraciones 039/040).
    const [countryCode, setCountryCode] = useState(DEFAULT_COUNTRY);
    const [phone, setPhone] = useState("");
    const [phoneError, setPhoneError] = useState<string | null>(null);
    const [savedPhone, setSavedPhone] = useState<string | null>(null);
    const [email, setEmail] = useState("");
    const [emailError, setEmailError] = useState<string | null>(null);

    const currentEmail = authUser?.email || profile?.email || user?.email || "";

    useEffect(() => {
        if (!profile) return;
        const parsed = splitPhone(profile.phone);
        setCountryCode(parsed.code);
        setPhone(parsed.local);
        setSavedPhone(profile.phone ?? null);
    }, [profile]);

    useEffect(() => {
        if (currentEmail) setEmail(currentEmail);
    }, [currentEmail]);

    const fullPhone = phone.trim() ? `${countryCode} ${phone.trim()}` : null;
    const phoneDirty = fullPhone !== savedPhone;
    const emailDirty = email.trim().toLowerCase() !== currentEmail.toLowerCase();
    const dirty = phoneDirty || emailDirty;

    const updateMutation = useMutation({
        mutationFn: async ({ newPhone, newEmail }: { newPhone?: string | null; newEmail?: string }) => {
            if (!user?.id) throw new Error("No autenticado");
            const result: { phone?: string | null; emailSentTo?: string } = {};
            if (newPhone !== undefined) {
                const { data, error } = await supabase
                    .from("profiles")
                    .update({ phone: newPhone })
                    .eq("id", user.id)
                    .select("phone")
                    .single();
                if (error) throw toAppError(error);
                result.phone = data.phone ?? null;
            }
            if (newEmail !== undefined) {
                // Supabase manda el link de confirmación; el email cambia recién al confirmarlo
                const { error } = await supabase.auth.updateUser(
                    { email: newEmail },
                    { emailRedirectTo: `${window.location.origin}/profile` },
                );
                if (error) throw toAppError(error);
                result.emailSentTo = newEmail;
            }
            return result;
        },
        onSuccess: (result) => {
            if (result.phone !== undefined) {
                setSavedPhone(result.phone);
                updateUser({ phone: result.phone ?? undefined } as Partial<UserType>);
            }
            if (result.emailSentTo) {
                void refetchAuthUser();
                addToast(`Te enviamos un link a ${result.emailSentTo} para confirmar el cambio de email`, "info");
            } else {
                addToast("Datos actualizados");
            }
        },
    });

    const onSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        const pErr = phoneDirty ? validatePhoneNumber(phone.trim(), countryCode) : null;
        const eParsed = z.string().trim().email("Ingresá un email válido").max(254).safeParse(email);
        const eErr = emailDirty && !eParsed.success ? eParsed.error.issues[0]?.message ?? "Email inválido" : null;
        setPhoneError(pErr);
        setEmailError(eErr);
        if (pErr || eErr) return;
        updateMutation.mutate({
            newPhone: phoneDirty ? fullPhone : undefined,
            newEmail: emailDirty && eParsed.success ? eParsed.data.toLowerCase() : undefined,
        });
    };

    if (!isHydrated) return <div className="flex min-h-screen items-center justify-center"><Spinner size="lg" /></div>;
    if (!isAuthenticated) return null;

    return (
        <div className="flex min-h-screen flex-col">
            <Navbar />
            <main className="mx-auto w-full max-w-2xl flex-1 px-6 py-8">
                <h1 className="text-3xl font-bold">Mi Perfil</h1>

                <Card className="mt-8">
                    <CardHeader>
                        <h2 className="text-lg font-semibold">Información Personal</h2>
                    </CardHeader>
                    <Divider />
                    <CardBody>
                        {profileLoading || !profile ? (
                            <div className="flex justify-center py-6"><Spinner /></div>
                        ) : (
                            <form onSubmit={onSubmit} className="flex flex-col gap-5">
                                    {/* Nombre y apellido: fijos, como texto */}
                                <dl className="grid gap-4 sm:grid-cols-2">
                                    <ProfileField icon={<User className="h-4 w-4" />} label="Nombre" value={profile.first_name} />
                                        <ProfileField label="Apellido" value={profile.last_name} />
                                </dl>

                                    <Input
                                        label="Email"
                                        type="email"
                                        autoComplete="email"
                                        variant="bordered"
                                        value={email}
                                        onValueChange={(v) => { setEmail(v); if (emailError) setEmailError(null); }}
                                        isInvalid={!!emailError}
                                        errorMessage={emailError ?? undefined}
                                        description={
                                            authUser?.newEmail
                                                ? `Cambio pendiente a ${authUser.newEmail}: confirmalo con el link que te enviamos.`
                                                : emailDirty
                                                    ? "Te vamos a enviar un link para confirmar el email nuevo."
                                                    : undefined
                                        }
                                        startContent={<Mail className="h-4 w-4 text-default-400" />}
                                        classNames={{ inputWrapper: "bg-default-50" }}
                                    />

                                <PhoneInput
                                    value={phone}
                                    onChange={(v) => { setPhone(v); if (phoneError) setPhoneError(null); }}
                                    countryCode={countryCode}
                                    onCountryCodeChange={setCountryCode}
                                    error={phoneError}
                                    onError={setPhoneError}
                                />

                                    <Button
                                        type="submit"
                                        color="primary"
                                        isLoading={updateMutation.isPending}
                                        isDisabled={!dirty}
                                        startContent={updateMutation.isPending ? undefined : <Save className="h-4 w-4" />}
                                        className="self-end"
                                    >
                                        Guardar cambios
                                    </Button>

                                    {updateMutation.isError && (
                                        <p role="alert" className="text-sm text-danger">
                                            {updateMutation.error?.message || "No se pudieron guardar los cambios"}
                                        </p>
                                    )}
                                </form>
                        )}
                    </CardBody>
                </Card>

                {/* Change Password */}
                <Card className="mt-6">
                    <CardHeader>
                        <h2 className="text-lg font-semibold">Cambiar Contraseña</h2>
                    </CardHeader>
                    <Divider />
                    <CardBody>
                        <ChangePasswordForm />
                    </CardBody>
                </Card>
            </main>
        </div>
    );
}

function ChangePasswordForm() {
    const [newPassword, setNewPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [showNew, setShowNew] = useState(false);
    const addToast = useToastStore((s) => s.addToast);

    // Supabase Auth no valida la contraseña actual en updateUser.
    // El usuario ya está autenticado, por lo que this is sufficient.
    const mutation = useMutation({
        mutationFn: async (password: string) => {
            const { error } = await supabase.auth.updateUser({ password });
            if (error) throw toAppError(error);
        },
        onSuccess: () => {
            addToast("Contraseña actualizada correctamente");
            setNewPassword("");
            setConfirmPassword("");
        },
    });

    const passwordsMatch = newPassword && confirmPassword && newPassword === confirmPassword;
    const canSubmit = newPassword.length >= 8 && passwordsMatch;

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!canSubmit) return;
        mutation.mutate(newPassword);
    };

    return (
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <Input
                label="Nueva contraseña"
                type={showNew ? "text" : "password"}
                variant="bordered"
                value={newPassword}
                onValueChange={setNewPassword}
                placeholder="Mín. 8 caracteres"
                startContent={<Lock className="h-4 w-4 text-default-400" />}
                endContent={
                    <button type="button" onClick={() => setShowNew(!showNew)} className="text-default-400 hover:text-default-600">
                        {showNew ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                }
            />
            <Input
                label="Confirmar nueva contraseña"
                type="password"
                variant="bordered"
                value={confirmPassword}
                onValueChange={setConfirmPassword}
                startContent={<Lock className="h-4 w-4 text-default-400" />}
                color={passwordsMatch ? "success" : undefined}
            />
            {newPassword && confirmPassword && !passwordsMatch && (
                <p className="text-xs text-danger">Las contraseñas no coinciden</p>
            )}

            <Button
                type="submit"
                color="primary"
                isDisabled={!canSubmit}
                isLoading={mutation.isPending}
                className="self-end"
            >
                Cambiar Contraseña
            </Button>

            {mutation.isError && (
                <p className="text-sm text-danger">{(mutation.error as any)?.message || "Error al cambiar contraseña"}</p>
            )}
        </form>
    );
}
