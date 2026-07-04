"use client";

import { Button, Input, Link, Divider } from "@heroui/react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
    registerSchema,
    type RegisterFormData,
} from "@/lib/validations/auth.schema";
import { useAuth } from "@/hooks/use-auth";
import { Trophy, Mail, Lock, User, Phone, ArrowRight, CheckCircle2 } from "lucide-react";

export default function RegisterPage() {
    const { register: registerMutation } = useAuth();

    const {
        register,
        handleSubmit,
        formState: { errors },
    } = useForm<RegisterFormData>({
        resolver: zodResolver(registerSchema),
    });

    const onSubmit = (data: RegisterFormData) => {
        const { confirmPassword, ...registerData } = data;
        registerMutation.mutate(registerData);
    };

    return (
        <div className="flex min-h-screen">
            {/* Left panel - branding */}
            <div className="hidden lg:flex lg:w-[45%] relative overflow-hidden bg-gradient-to-br from-secondary via-secondary-600 to-primary items-center justify-center p-12">
                <div className="absolute inset-0 opacity-10">
                    <div className="absolute top-32 right-10 h-72 w-72 rounded-full bg-white/20 blur-3xl" />
                    <div className="absolute bottom-10 left-20 h-64 w-64 rounded-full bg-white/10 blur-3xl" />
                </div>
                <div className="relative z-10 max-w-md text-white">
                    <div className="flex items-center gap-3 mb-8">
                        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-white/20 backdrop-blur-sm">
                            <Trophy className="h-6 w-6 text-white" />
                        </div>
                        <span className="text-2xl font-bold">SportBooking</span>
                    </div>
                    <h2 className="text-3xl font-bold leading-tight">
                        Únete a la comunidad deportiva más grande
                    </h2>
                    <p className="mt-4 text-white/70 leading-relaxed">
                        Miles de jugadores ya reservan sus canchas con nosotros.
                        Crea tu cuenta y empieza a jugar hoy mismo.
                    </p>

                    <div className="mt-10 space-y-5">
                        <BenefitCard
                            title="Gratis para siempre"
                            description="Sin cargos ocultos ni suscripciones"
                        />
                        <BenefitCard
                            title="Reserva en 30 segundos"
                            description="Proceso rápido y sin complicaciones"
                        />
                        <BenefitCard
                            title="Gestiona tus reservas"
                            description="Historial, cancelaciones y más desde tu perfil"
                        />
                    </div>
                </div>
            </div>

            {/* Right panel - form */}
            <div className="flex flex-1 flex-col items-center justify-center px-6 py-8 lg:px-12">
                <div className="w-full max-w-md animate-fade-in">
                    {/* Mobile logo */}
                    <div className="mb-6 flex items-center gap-2 lg:hidden">
                        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary">
                            <Trophy className="h-4 w-4 text-white" />
                        </div>
                        <span className="text-xl font-bold">SportBooking</span>
                    </div>

                    <div className="mb-6">
                        <h1 className="text-2xl font-bold text-foreground">Crear tu cuenta</h1>
                        <p className="mt-1 text-sm text-default-500">
                            Completa tus datos para empezar a reservar
                        </p>
                    </div>

                    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
                        <div className="grid grid-cols-2 gap-3">
                            <Input
                                {...register("firstName")}
                                label="Nombre"
                                placeholder="Juan"
                                variant="bordered"
                                startContent={<User className="h-4 w-4 text-default-400" />}
                                isInvalid={!!errors.firstName}
                                errorMessage={errors.firstName?.message}
                                classNames={{ inputWrapper: "bg-default-50" }}
                            />
                            <Input
                                {...register("lastName")}
                                label="Apellido"
                                placeholder="Pérez"
                                variant="bordered"
                                isInvalid={!!errors.lastName}
                                errorMessage={errors.lastName?.message}
                                classNames={{ inputWrapper: "bg-default-50" }}
                            />
                        </div>
                        <Input
                            {...register("email")}
                            label="Email"
                            placeholder="tu@email.com"
                            type="email"
                            variant="bordered"
                            startContent={<Mail className="h-4 w-4 text-default-400" />}
                            isInvalid={!!errors.email}
                            errorMessage={errors.email?.message}
                            classNames={{ inputWrapper: "bg-default-50" }}
                        />
                        <Input
                            {...register("phone")}
                            label="Teléfono (opcional)"
                            placeholder="+54 11 1234-5678"
                            variant="bordered"
                            startContent={<Phone className="h-4 w-4 text-default-400" />}
                            classNames={{ inputWrapper: "bg-default-50" }}
                        />
                        <Input
                            {...register("password")}
                            label="Contraseña"
                            placeholder="Mínimo 8 caracteres"
                            type="password"
                            variant="bordered"
                            startContent={<Lock className="h-4 w-4 text-default-400" />}
                            isInvalid={!!errors.password}
                            errorMessage={errors.password?.message}
                            classNames={{ inputWrapper: "bg-default-50" }}
                        />
                        <Input
                            {...register("confirmPassword")}
                            label="Confirmar Contraseña"
                            placeholder="Repite tu contraseña"
                            type="password"
                            variant="bordered"
                            startContent={<Lock className="h-4 w-4 text-default-400" />}
                            isInvalid={!!errors.confirmPassword}
                            errorMessage={errors.confirmPassword?.message}
                            classNames={{ inputWrapper: "bg-default-50" }}
                        />

                        <Button
                            type="submit"
                            color="primary"
                            size="lg"
                            isLoading={registerMutation.isPending}
                            className="mt-2 font-semibold shadow-lg shadow-primary/20"
                            endContent={!registerMutation.isPending && <ArrowRight className="h-4 w-4" />}
                        >
                            Crear Cuenta
                        </Button>

                        {registerMutation.isError && (
                            <div className="rounded-lg bg-danger-50 px-4 py-3 text-center text-sm text-danger">
                                {(registerMutation.error as any)?.message || "Error al registrarse"}
                            </div>
                        )}
                    </form>

                    <Divider className="my-5" />

                    <p className="text-center text-sm text-default-500">
                        ¿Ya tienes cuenta?{" "}
                        <Link href="/login" className="font-semibold text-primary">
                            Inicia Sesión
                        </Link>
                    </p>
                </div>
            </div>
        </div>
    );
}

function BenefitCard({ title, description }: { title: string; description: string }) {
    return (
        <div className="flex items-start gap-3">
            <div className="mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-white/20">
                <CheckCircle2 className="h-3 w-3 text-white" />
            </div>
            <div>
                <p className="text-sm font-semibold text-white">{title}</p>
                <p className="text-xs text-white/60">{description}</p>
            </div>
        </div>
    );
}
