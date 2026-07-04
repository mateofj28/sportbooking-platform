"use client";

import { Button, Input, Link, Divider } from "@heroui/react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { loginSchema, type LoginFormData } from "@/lib/validations/auth.schema";
import { useAuth } from "@/hooks/use-auth";
import { Trophy, Mail, Lock, ArrowRight } from "lucide-react";

export default function LoginPage() {
    const { login } = useAuth();

    const {
        register,
        handleSubmit,
        formState: { errors },
    } = useForm<LoginFormData>({
        resolver: zodResolver(loginSchema),
    });

    const onSubmit = (data: LoginFormData) => {
        login.mutate(data);
    };

    return (
        <div className="flex min-h-screen">
            {/* Left panel - branding */}
            <div className="hidden lg:flex lg:w-1/2 relative overflow-hidden bg-gradient-to-br from-primary via-primary-600 to-secondary items-center justify-center p-12">
                <div className="absolute inset-0 opacity-10">
                    <div className="absolute top-20 left-10 h-64 w-64 rounded-full bg-white/20 blur-3xl" />
                    <div className="absolute bottom-20 right-10 h-80 w-80 rounded-full bg-white/10 blur-3xl" />
                </div>
                <div className="relative z-10 max-w-md text-white">
                    <div className="flex items-center gap-3 mb-8">
                        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-white/20 backdrop-blur-sm">
                            <Trophy className="h-6 w-6 text-white" />
                        </div>
                        <span className="text-2xl font-bold">SportBooking</span>
                    </div>
                    <h2 className="text-3xl font-bold leading-tight">
                        La forma más fácil de reservar tu cancha
                    </h2>
                    <p className="mt-4 text-white/70 leading-relaxed">
                        Accede a cientos de instalaciones deportivas, elige tu horario y
                        confirma en segundos. Sin llamadas, sin esperas.
                    </p>
                    <div className="mt-10 space-y-4">
                        <FeatureItem text="Reserva confirmada al instante" />
                        <FeatureItem text="Cancela hasta 24h antes sin costo" />
                        <FeatureItem text="Múltiples deportes y sedes" />
                    </div>
                </div>
            </div>

            {/* Right panel - form */}
            <div className="flex flex-1 flex-col items-center justify-center px-6 py-12 lg:px-12">
                <div className="w-full max-w-sm animate-fade-in">
                    {/* Mobile logo */}
                    <div className="mb-8 flex items-center gap-2 lg:hidden">
                        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary">
                            <Trophy className="h-4 w-4 text-white" />
                        </div>
                        <span className="text-xl font-bold">SportBooking</span>
                    </div>

                    <div className="mb-8">
                        <h1 className="text-2xl font-bold text-foreground">Bienvenido de nuevo</h1>
                        <p className="mt-1 text-sm text-default-500">
                            Ingresa tus credenciales para continuar
                        </p>
                    </div>

                    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-5">
                        <Input
                            {...register("email")}
                            label="Email"
                            placeholder="tu@email.com"
                            type="email"
                            variant="bordered"
                            size="lg"
                            startContent={<Mail className="h-4 w-4 text-default-400" />}
                            isInvalid={!!errors.email}
                            errorMessage={errors.email?.message}
                            classNames={{ inputWrapper: "bg-default-50" }}
                        />
                        <Input
                            {...register("password")}
                            label="Contraseña"
                            placeholder="••••••••"
                            type="password"
                            variant="bordered"
                            size="lg"
                            startContent={<Lock className="h-4 w-4 text-default-400" />}
                            isInvalid={!!errors.password}
                            errorMessage={errors.password?.message}
                            classNames={{ inputWrapper: "bg-default-50" }}
                        />

                        <div className="flex justify-end">
                            <Link href="/forgot-password" size="sm" className="text-primary">
                                ¿Olvidaste tu contraseña?
                            </Link>
                        </div>

                        <Button
                            type="submit"
                            color="primary"
                            size="lg"
                            isLoading={login.isPending}
                            className="font-semibold shadow-lg shadow-primary/20"
                            endContent={!login.isPending && <ArrowRight className="h-4 w-4" />}
                        >
                            Iniciar Sesión
                        </Button>

                        {login.isError && (
                            <div className="rounded-lg bg-danger-50 px-4 py-3 text-center text-sm text-danger">
                                {(login.error as any)?.message || "Error al iniciar sesión"}
                            </div>
                        )}
                    </form>

                    <Divider className="my-6" />

                    <p className="text-center text-sm text-default-500">
                        ¿No tienes cuenta?{" "}
                        <Link href="/register" className="font-semibold text-primary">
                            Regístrate gratis
                        </Link>
                    </p>
                </div>
            </div>
        </div>
    );
}

function FeatureItem({ text }: { text: string }) {
    return (
        <div className="flex items-center gap-3">
            <div className="flex h-6 w-6 items-center justify-center rounded-full bg-white/20">
                <svg className="h-3 w-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                </svg>
            </div>
            <span className="text-sm text-white/80">{text}</span>
        </div>
    );
}
