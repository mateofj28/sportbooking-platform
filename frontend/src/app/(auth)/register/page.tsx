"use client";

import { Button, Input, Link, Divider } from "@heroui/react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
    registerSchema,
    type RegisterFormData,
} from "@/lib/validations/auth.schema";
import { useAuth } from "@/hooks/use-auth";
import { Trophy, Mail, Lock, User, Phone, ArrowRight, CheckCircle2, Eye, EyeOff, Globe } from "lucide-react";
import { useState } from "react";

const COUNTRY_CODES = [
    { code: "+57", country: "CO", flag: "🇨🇴" },
    { code: "+54", country: "AR", flag: "🇦🇷" },
    { code: "+56", country: "CL", flag: "🇨🇱" },
    { code: "+52", country: "MX", flag: "🇲🇽" },
    { code: "+51", country: "PE", flag: "🇵🇪" },
    { code: "+593", country: "EC", flag: "🇪🇨" },
    { code: "+598", country: "UY", flag: "🇺🇾" },
    { code: "+591", country: "BO", flag: "🇧🇴" },
    { code: "+595", country: "PY", flag: "🇵🇾" },
    { code: "+58", country: "VE", flag: "🇻🇪" },
    { code: "+1", country: "US", flag: "🇺🇸" },
    { code: "+34", country: "ES", flag: "🇪🇸" },
    { code: "+55", country: "BR", flag: "🇧🇷" },
];

export default function RegisterPage() {
    const { register: registerMutation } = useAuth();
    const [showPassword, setShowPassword] = useState(false);
    const [showConfirmPassword, setShowConfirmPassword] = useState(false);
    const [countryCode, setCountryCode] = useState("+57");
    const [showCodes, setShowCodes] = useState(false);

    const {
        register,
        handleSubmit,
      watch,
      formState: { errors },
  } = useForm<RegisterFormData>({
      resolver: zodResolver(registerSchema),
      mode: "onChange",
  });

    const password = watch("password");
    const confirmPassword = watch("confirmPassword");
    const passwordsMatch = password && confirmPassword && password === confirmPassword;
    const passwordsDontMatch = password && confirmPassword && password !== confirmPassword;

    const onSubmit = (data: RegisterFormData) => {
        const { confirmPassword, ...registerData } = data;
      // Prepend country code to phone if provided
      if (registerData.phone) {
          registerData.phone = `${countryCode} ${registerData.phone}`;
      }
      registerMutation.mutate(registerData);
  };

    const selectedCountry = COUNTRY_CODES.find((c) => c.code === countryCode);

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

                      {/* Phone with country code selector */}
                      <div className="relative">
                          <Input
                              {...register("phone")}
                              label="Teléfono (opcional)"
                              placeholder="300 123 4567"
                              type="tel"
                              variant="bordered"
                              classNames={{ inputWrapper: "bg-default-50" }}
                              startContent={
                                  <div className="relative">
                                      <button
                                          type="button"
                                          onClick={() => setShowCodes(!showCodes)}
                                          className="flex items-center gap-1 text-sm font-medium text-default-600 hover:text-primary transition-colors pr-2 border-r border-default-200 mr-2"
                                      >
                                          <span>{selectedCountry?.flag}</span>
                                          <span className="text-xs">{countryCode}</span>
                                      </button>
                                  </div>
                              }
                          />
                          {showCodes && (
                              <div className="absolute top-full left-0 z-50 mt-1 w-56 max-h-48 overflow-y-auto rounded-xl border border-divider bg-background shadow-xl">
                                  {COUNTRY_CODES.map((c) => (
                                      <button
                                          key={c.code}
                                          type="button"
                                          onClick={() => { setCountryCode(c.code); setShowCodes(false); }}
                                          className={`flex w-full items-center gap-3 px-3 py-2 text-sm hover:bg-default-100 transition-colors ${countryCode === c.code ? "bg-primary-50 text-primary" : ""}`}
                                      >
                                          <span className="text-base">{c.flag}</span>
                                          <span className="font-medium">{c.country}</span>
                                          <span className="text-default-400 ml-auto">{c.code}</span>
                                      </button>
                                  ))}
                              </div>
                          )}
                      </div>

                      {/* Password with toggle visibility */}
                      <Input
                          {...register("password")}
                          label="Contraseña"
                          placeholder="Mínimo 8 caracteres"
                          type={showPassword ? "text" : "password"}
                          variant="bordered"
                          startContent={<Lock className="h-4 w-4 text-default-400" />}
                          endContent={
                              <button type="button" onClick={() => setShowPassword(!showPassword)} className="text-default-400 hover:text-default-600 transition-colors">
                                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                              </button>
                          }
                          isInvalid={!!errors.password}
                          errorMessage={errors.password?.message}
                          classNames={{ inputWrapper: "bg-default-50" }}
                      />

                      {/* Confirm password with toggle + match indicator */}
                      <div>
                          <Input
                              {...register("confirmPassword")}
                              label="Confirmar Contraseña"
                              placeholder="Repite tu contraseña"
                              type={showConfirmPassword ? "text" : "password"}
                              variant="bordered"
                              startContent={<Lock className="h-4 w-4 text-default-400" />}
                              endContent={
                                  <button type="button" onClick={() => setShowConfirmPassword(!showConfirmPassword)} className="text-default-400 hover:text-default-600 transition-colors">
                                      {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                                  </button>
                              }
                              isInvalid={!!errors.confirmPassword || !!passwordsDontMatch}
                              errorMessage={errors.confirmPassword?.message}
                              classNames={{ inputWrapper: "bg-default-50" }}
                              color={passwordsMatch ? "success" : undefined}
                          />
                          {passwordsMatch && !errors.confirmPassword && (
                              <p className="mt-1 flex items-center gap-1 text-xs text-success">
                                  <CheckCircle2 className="h-3 w-3" />
                                  Las contraseñas coinciden
                              </p>
                          )}
                          {passwordsDontMatch && !errors.confirmPassword && (
                              <p className="mt-1 text-xs text-danger">
                                  Las contraseñas no coinciden
                              </p>
                          )}
                      </div>

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
