"use client";
import { toAppError } from '@/lib/error-messages'

import { Button, Card, CardBody, CardHeader, Input, Divider, Spinner } from "@heroui/react";
import { useForm } from "react-hook-form";
import { useMutation } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAuthStore } from "@/stores/auth-store";
import { useToastStore } from "@/stores/toast-store";
import { Navbar } from "@/components/layout/navbar";
import { User, Mail, Phone, Save, Lock, Eye, EyeOff } from "lucide-react";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { User as UserType } from "@/types";

export default function ProfilePage() {
    const { user, _updateUser: updateUser, isAuthenticated, isHydrated } = useAuthStore();
    const router = useRouter();

    useEffect(() => {
        if (isHydrated && !isAuthenticated) {
            router.replace("/login");
        }
    }, [isHydrated, isAuthenticated, router]);

    const { register, handleSubmit } = useForm({
        defaultValues: {
            firstName: user?.firstName || "",
            lastName: user?.lastName || "",
            phone: user?.phone || "",
        },
    });

    const updateMutation = useMutation({
        mutationFn: async (data: { firstName?: string; lastName?: string; phone?: string }) => {
            if (!user?.id) throw new Error("No autenticado");
            const { data: result, error } = await supabase
                .from("profiles")
                .update({
                    first_name: data.firstName,
                    last_name: data.lastName,
                    phone: data.phone,
                })
                .eq("id", user.id)
                .select()
                .single();
            if (error) throw toAppError(error);
            return result;
        },
        onSuccess: (data) => {
            // Merge updated profile fields back into auth store
            updateUser({
                firstName: data.first_name,
                lastName: data.last_name,
                phone: data.phone ?? undefined,
            } as Partial<UserType>);
        },
    });

    const onSubmit = (data: any) => {
        updateMutation.mutate(data);
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
                        <form
                            onSubmit={handleSubmit(onSubmit)}
                            className="flex flex-col gap-4"
                        >
                            <div className="grid gap-4 sm:grid-cols-2">
                                <Input
                                    {...register("firstName")}
                                    label="Nombre"
                                    variant="bordered"
                                    startContent={<User className="h-4 w-4 text-default-400" />}
                                />
                                <Input
                                    {...register("lastName")}
                                    label="Apellido"
                                    variant="bordered"
                                />
                            </div>
                            <Input
                                label="Email"
                                value={user?.email || ""}
                                variant="bordered"
                                isReadOnly
                                startContent={<Mail className="h-4 w-4 text-default-400" />}
                            />
                            <Input
                                {...register("phone")}
                                label="Teléfono"
                                variant="bordered"
                                startContent={<Phone className="h-4 w-4 text-default-400" />}
                            />

                            <Button
                                type="submit"
                                color="primary"
                                isLoading={updateMutation.isPending}
                                startContent={<Save className="h-4 w-4" />}
                                className="self-end"
                            >
                                Guardar Cambios
                            </Button>

                            {updateMutation.isSuccess && (
                                <p className="text-sm text-success">
                                    Perfil actualizado correctamente
                                </p>
                            )}
                        </form>
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
