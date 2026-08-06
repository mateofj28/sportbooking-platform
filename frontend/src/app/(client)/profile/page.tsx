"use client";

import { Button, Card, CardBody, CardHeader, Input, Divider, Spinner } from "@heroui/react";
import { useForm } from "react-hook-form";
import { useMutation } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import { useAuthStore } from "@/stores/auth-store";
import { useToastStore } from "@/stores/toast-store";
import { Navbar } from "@/components/layout/navbar";
import { Footer } from "@/components/layout/footer";
import { User, Mail, Phone, Save, Lock, Eye, EyeOff } from "lucide-react";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { User as UserType } from "@/types";

export default function ProfilePage() {
    const { user, updateUser, isAuthenticated, isHydrated } = useAuthStore();
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
        mutationFn: (data: Partial<UserType>) =>
            apiClient.patch<UserType>("/users/profile", data),
        onSuccess: (data) => {
            updateUser(data);
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
            <Footer />
        </div>
    );
}

function ChangePasswordForm() {
    const [currentPassword, setCurrentPassword] = useState("");
    const [newPassword, setNewPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [showCurrent, setShowCurrent] = useState(false);
    const [showNew, setShowNew] = useState(false);
    const addToast = useToastStore((s) => s.addToast);

    const mutation = useMutation({
        mutationFn: (data: { currentPassword: string; newPassword: string }) =>
            apiClient.patch("/auth/change-password", data),
        onSuccess: () => {
            addToast("Contraseña actualizada correctamente");
            setCurrentPassword("");
            setNewPassword("");
            setConfirmPassword("");
        },
    });

    const passwordsMatch = newPassword && confirmPassword && newPassword === confirmPassword;
    const canSubmit = currentPassword && newPassword.length >= 8 && passwordsMatch;

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!canSubmit) return;
        mutation.mutate({ currentPassword, newPassword });
    };

    return (
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <Input
                label="Contraseña actual"
                type={showCurrent ? "text" : "password"}
                variant="bordered"
                value={currentPassword}
                onValueChange={setCurrentPassword}
                startContent={<Lock className="h-4 w-4 text-default-400" />}
                endContent={
                    <button type="button" onClick={() => setShowCurrent(!showCurrent)} className="text-default-400 hover:text-default-600">
                        {showCurrent ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                }
            />
            <Input
                label="Nueva contraseña"
                type={showNew ? "text" : "password"}
                variant="bordered"
                value={newPassword}
                onValueChange={setNewPassword}
                placeholder="Mín. 8 caracteres, 1 mayúscula, 1 número"
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
