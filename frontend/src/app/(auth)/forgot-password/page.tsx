"use client";

import { Button, Card, CardBody, CardHeader, Input, Link } from "@heroui/react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
    forgotPasswordSchema,
    type ForgotPasswordFormData,
} from "@/lib/validations/auth.schema";
import { useMutation } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import { Trophy, Mail, ArrowLeft } from "lucide-react";

export default function ForgotPasswordPage() {
    const mutation = useMutation({
        mutationFn: (data: ForgotPasswordFormData) =>
            apiClient.post("/auth/forgot-password", data),
    });

    const {
        register,
        handleSubmit,
        formState: { errors },
    } = useForm<ForgotPasswordFormData>({
        resolver: zodResolver(forgotPasswordSchema),
    });

    const onSubmit = (data: ForgotPasswordFormData) => {
        mutation.mutate(data);
    };

    return (
        <div className="flex min-h-screen items-center justify-center px-4">
            <Card className="w-full max-w-md">
                <CardHeader className="flex flex-col items-center gap-2 pb-0 pt-8">
                    <Trophy className="h-10 w-10 text-primary" />
                    <h1 className="text-2xl font-bold">Recuperar Contraseña</h1>
                    <p className="text-center text-sm text-default-500">
                        Ingresa tu email y te enviaremos un link para restablecer tu
                        contraseña
                    </p>
                </CardHeader>
                <CardBody className="px-8 py-6">
                    {mutation.isSuccess ? (
                        <div className="text-center">
                            <p className="text-success">
                                Si el email existe, recibirás un enlace para restablecer tu
                                contraseña.
                            </p>
                            <Button
                                as={Link}
                                href="/login"
                                variant="light"
                                className="mt-4"
                                startContent={<ArrowLeft className="h-4 w-4" />}
                            >
                                Volver al login
                            </Button>
                        </div>
                    ) : (
                        <form
                            onSubmit={handleSubmit(onSubmit)}
                            className="flex flex-col gap-4"
                        >
                            <Input
                                {...register("email")}
                                label="Email"
                                placeholder="tu@email.com"
                                type="email"
                                variant="bordered"
                                startContent={<Mail className="h-4 w-4 text-default-400" />}
                                isInvalid={!!errors.email}
                                errorMessage={errors.email?.message}
                            />
                            <Button
                                type="submit"
                                color="primary"
                                isLoading={mutation.isPending}
                            >
                                Enviar enlace
                            </Button>
                        </form>
                    )}

                    <p className="mt-6 text-center text-sm text-default-500">
                        <Link href="/login" size="sm">
                            <ArrowLeft className="mr-1 inline h-3 w-3" />
                            Volver al login
                        </Link>
                    </p>
                </CardBody>
            </Card>
        </div>
    );
}
