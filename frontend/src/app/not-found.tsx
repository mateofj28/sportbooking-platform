"use client";

import { Button, Link } from "@heroui/react";
import { Trophy, ArrowLeft, Search } from "lucide-react";

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-6 text-center bg-background">
      <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-primary/10 mb-6">
        <Trophy className="h-10 w-10 text-primary" />
      </div>

      <h1 className="text-8xl font-extrabold text-primary">404</h1>
      <h2 className="mt-4 text-2xl font-bold text-foreground">Página no encontrada</h2>
      <p className="mt-3 max-w-md text-default-500">
        La página que buscas no existe o fue movida. Vuelve al inicio y sigue reservando canchas.
      </p>

      <div className="mt-8 flex gap-3">
        <Button
          as={Link}
          href="/"
          color="primary"
          startContent={<ArrowLeft className="h-4 w-4" />}
        >
          Volver al inicio
        </Button>
        <Button
          as={Link}
          href="/facilities"
          variant="bordered"
          startContent={<Search className="h-4 w-4" />}
        >
          Ver instalaciones
        </Button>
      </div>
    </div>
  );
}
