"use client";

import { Button, Card, CardBody, CardHeader, Input, Divider, Spinner } from "@heroui/react";
import { useForm } from "react-hook-form";
import { useMutation } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import { useAuthStore } from "@/stores/auth-store";
import { Navbar } from "@/components/layout/navbar";
import { Footer } from "@/components/layout/footer";
import { User, Mail, Phone, Save } from "lucide-react";
import { useEffect } from "react";
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
            </main>
            <Footer />
        </div>
    );
}
