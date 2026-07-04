"use client";

import { Button, Card, CardBody, CardHeader, Input, Link } from "@heroui/react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { resetPasswordSchema, type ResetPasswordFormData } from "@/lib/validations/auth.schema";
import { useMutation } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import { Trophy, Lock, ArrowLeft, CheckCircle2, Eye, EyeOff } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useState, Suspense } from "react";

function ResetPasswordContent() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token") || "";
  const [showPassword, setShowPassword] = useState(false);

  const mutation = useMutation({
    mutationFn: (data: { token: string; password: string }) =>
      apiClient.post("/auth/reset-password", data),
  });

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ResetPasswordFormData>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: { token },
  });

  const onSubmit = (data: ResetPasswordFormData) => {
    mutation.mutate({ token: data.token, password: data.password });
  };

  return (
    <div className="flex min-h-screen items-center justify-center px-4 bg-gradient-to-br from-primary-50 via-background to-secondary-50">
      <Card className="w-full max-w-md shadow-xl">
        <CardHeader className="flex flex-col items-center gap-2 pb-0 pt-8">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10">
            <Trophy className="h-6 w-6 text-primary" />
          </div>
          <h1 className="text-2xl font-bold">Nueva Contraseña</h1>
          <p className="text-center text-sm text-default-500">
            Ingresa tu nueva contraseña
          </p>
        </CardHeader>
        <CardBody className="px-8 py-6">
          {mutation.isSuccess ? (
            <div className="text-center space-y-4">
              <div className="flex h-16 w-16 mx-auto items-center justify-center rounded-full bg-success/10">
                <CheckCircle2 className="h-8 w-8 text-success" />
              </div>
              <p className="text-success font-medium">
                ¡Contraseña actualizada correctamente!
              </p>
              <p className="text-sm text-default-500">
                Ya puedes iniciar sesión con tu nueva contraseña.
              </p>
              <Button
                as={Link}
                href="/login"
                color="primary"
                variant="flat"
                className="mt-4"
              >
                Ir al Login
              </Button>
            </div>
          ) : (
            <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
              <input type="hidden" {...register("token")} />
              <Input
                {...register("password")}
                label="Nueva Contraseña"
                placeholder="Mínimo 8 caracteres"
                type={showPassword ? "text" : "password"}
                variant="bordered"
                startContent={<Lock className="h-4 w-4 text-default-400" />}
                endContent={
                  <button type="button" onClick={() => setShowPassword(!showPassword)} className="text-default-400 hover:text-default-600">
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                }
                isInvalid={!!errors.password}
                errorMessage={errors.password?.message}
                classNames={{ inputWrapper: "bg-default-50" }}
              />
              <Input
                {...register("confirmPassword")}
                label="Confirmar Contraseña"
                placeholder="Repite la contraseña"
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
                isLoading={mutation.isPending}
                className="font-semibold"
              >
                Actualizar Contraseña
              </Button>

              {mutation.isError && (
                <div className="rounded-lg bg-danger-50 px-4 py-3 text-center text-sm text-danger">
                  {(mutation.error as any)?.message || "Token inválido o expirado"}
                </div>
              )}
            </form>
          )}

          <p className="mt-6 text-center text-sm text-default-500">
            <Link href="/login" size="sm" className="text-primary">
              <ArrowLeft className="mr-1 inline h-3 w-3" />
              Volver al login
            </Link>
          </p>
        </CardBody>
      </Card>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<div className="flex min-h-screen items-center justify-center">Cargando...</div>}>
      <ResetPasswordContent />
    </Suspense>
  );
}
