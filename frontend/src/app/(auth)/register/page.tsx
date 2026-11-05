"use client";

import { Button, Input, Link, Divider, Checkbox } from "@heroui/react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
    registerSchema,
    type RegisterFormData,
} from "@/lib/validations/auth.schema";
import { useAuth } from "@/hooks/use-auth";
import { useRouter } from "next/navigation";
import { Trophy, Mail, Lock, User, Phone, ArrowRight, CheckCircle2, Eye, EyeOff, CreditCard } from "lucide-react";
import { useState } from "react";
import { supabase } from "@/lib/supabase";

const COUNTRY_CODES = [
    { code: "+54", country: "AR", flag: "🇦🇷" },
    { code: "+57", country: "CO", flag: "🇨🇴" },
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
    const router = useRouter();
    const [showPassword, setShowPassword] = useState(false);
    const [showConfirmPassword, setShowConfirmPassword] = useState(false);
    const [countryCode, setCountryCode] = useState("+54"); // Argentina por defecto
    const [showCodes, setShowCodes] = useState(false);
    const [acceptedTerms, setAcceptedTerms] = useState(false);
    const [dniError, setDniError] = useState<string | null>(null);
    const [dniChecking, setDniChecking] = useState(false);
    const [registered, setRegistered] = useState(false);
    const [registeredEmail, setRegisteredEmail] = useState("");

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
    const dniValue = watch("dni");
    const passwordsMatch = password && confirmPassword && password === confirmPassword;
    const passwordsDontMatch = password && confirmPassword && password !== confirmPassword;

    /** Verifica en tiempo real si el DNI ya existe en profiles */
    const checkDniUnique = async (dni: string) => {
        if (!dni || !/^[0-9]{1,15}$/.test(dni)) return;
        setDniChecking(true);
        setDniError(null);
        const { count } = await supabase
            .from("profiles")
            .select("id", { count: "exact", head: true })
            .eq("dni", dni);
        setDniChecking(false);
        if ((count ?? 0) > 0) {
            setDniError("Este DNI ya está registrado en la plataforma");
        }
    };

    const onSubmit = async (data: RegisterFormData) => {
        // Validación de DNI único antes de registrar
        const { count } = await supabase
            .from("profiles")
            .select("id", { count: "exact", head: true })
            .eq("dni", data.dni);
        if ((count ?? 0) > 0) {
            setDniError("Este DNI ya está registrado en la plataforma");
            return;
        }
        setDniError(null);

        const { confirmPassword: _, ...registerData } = data;
        if (registerData.phone) {
            registerData.phone = `${countryCode} ${registerData.phone}`;
        }
        setRegisteredEmail(data.email);
        registerMutation.mutate(registerData, {
            onSuccess: () => {
                setRegistered(true);
            },
        });
    };

    const selectedCountry = COUNTRY_CODES.find((c) => c.code === countryCode);

    return (
        <div className="flex min-h-screen">
            {/* Left panel - branding */}
            <div className="hidden lg:flex lg:w-[45%] relative overflow-hidden bg-gradient-to-br from-secondary via-secondary-600 to-primary items-center justify-center p-12">                <div className="absolute inset-0 opacity-10">
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

            {/* Right panel - form or success */}
          <div className="flex flex-1 flex-col items-center justify-center px-6 py-8 lg:px-12">
              <div className="w-full max-w-md animate-fade-in">

                    {registered ? (
                        /* ---- Pantalla de éxito ---- */
                        <div className="flex flex-col items-center text-center gap-6">
                            {/* Ícono animado */}
                            <div className="flex h-20 w-20 items-center justify-center rounded-full bg-success/10 ring-4 ring-success/20">
                                <CheckCircle2 className="h-10 w-10 text-success" />
                            </div>

                            {/* Logo mobile */}
                            <div className="flex items-center gap-2 lg:hidden">
                                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary">
                                    <Trophy className="h-4 w-4 text-white" />
                                </div>
                                <span className="text-lg font-bold">SportBooking</span>
                            </div>

                            <div>
                                <h1 className="text-2xl font-bold text-foreground">¡Cuenta creada!</h1>
                                <p className="mt-2 text-sm text-default-500 leading-relaxed">
                                    Tu registro fue exitoso. Te enviamos un correo de confirmación a:
                                </p>
                                <p className="mt-2 font-semibold text-primary break-all">{registeredEmail}</p>
                            </div>

                            {/* Tarjeta de instrucciones */}
                            <div className="w-full rounded-2xl border border-divider bg-default-50 p-5 text-left space-y-3">
                                <p className="text-sm font-semibold text-foreground">¿Qué hacer ahora?</p>
                                <div className="flex items-start gap-3">
                                    <div className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-primary text-white text-xs font-bold mt-0.5">1</div>
                                    <p className="text-sm text-default-600">Revisá tu bandeja de entrada (y la carpeta de spam por si acaso).</p>
                                </div>
                                <div className="flex items-start gap-3">
                                    <div className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-primary text-white text-xs font-bold mt-0.5">2</div>
                                    <p className="text-sm text-default-600">Abrí el correo de SportBooking y hacé clic en <span className="font-semibold">Confirmar mi cuenta</span>.</p>
                                </div>
                                <div className="flex items-start gap-3">
                                    <div className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-primary text-white text-xs font-bold mt-0.5">3</div>
                                    <p className="text-sm text-default-600">Una vez confirmado, iniciá sesión y empezá a reservar.</p>
                                </div>
                            </div>

                            <p className="text-sm text-default-400 font-medium">
                                Ya podés cerrar esta pestaña.
                            </p>
                        </div>
                    ) : (
                        <>
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

                        {/* DNI */}
                        <Input
                            {...register("dni", {
                                onBlur: (e) => checkDniUnique(e.target.value),
                            })}
                            label="DNI"
                            placeholder="12345678"
                            type="text"
                            inputMode="numeric"
                            maxLength={15}
                            variant="bordered"
                            startContent={<CreditCard className="h-4 w-4 text-default-400" />}
                            isInvalid={!!errors.dni || !!dniError}
                            errorMessage={errors.dni?.message || dniError || undefined}
                            isDisabled={dniChecking}
                            description={dniChecking ? "Verificando DNI..." : undefined}
                            classNames={{ inputWrapper: "bg-default-50" }}
                            onKeyPress={(e) => { if (!/[0-9]/.test(e.key)) e.preventDefault(); }}
                        />

                      {/* Phone with country code selector */}
                      <div className="relative">
                          <Input
                              {...register("phone")}
                              label="Teléfono (opcional)"
                              placeholder="300 123 4567"
                              type="tel"
                                            inputMode="numeric"
                                            maxLength={15}
                              variant="bordered"
                              classNames={{ inputWrapper: "bg-default-50" }}
                                            isInvalid={!!errors.phone}
                                            errorMessage={errors.phone?.message}
                                            onKeyPress={(e) => {
                                                // Solo dígitos, espacios y guiones
                                                if (!/[\d\s\-]/.test(e.key)) e.preventDefault();
                                            }}
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

                        <Checkbox
                            isSelected={acceptedTerms}
                            onValueChange={setAcceptedTerms}
                            size="sm"
                            className="mt-1"
                        >
                            <span className="text-xs text-default-500">
                                Acepto los{" "}
                                <Link href="/terminos" className="text-primary hover:underline" target="_blank">
                                    Términos y Condiciones
                                </Link>
                            </span>
                        </Checkbox>

                      <Button
                          type="submit"
                          color="primary"
                          size="lg"
                          isLoading={registerMutation.isPending}
                            isDisabled={!acceptedTerms}
                            className="font-semibold shadow-lg shadow-primary/20"
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
                        </>
                    )}
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
