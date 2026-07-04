"use client";

import { Link } from "@heroui/react";
import { Trophy } from "lucide-react";

export function Footer() {
    return (
        <footer className="w-full border-t border-divider bg-background py-8">
            <div className="mx-auto max-w-7xl px-6">
                <div className="flex flex-col items-center justify-between gap-4 md:flex-row">
                    <div className="flex items-center gap-2">
                        <Trophy className="h-5 w-5 text-primary" />
                        <span className="font-semibold">SportBooking</span>
                    </div>
                    <p className="text-sm text-default-500">
                        © {new Date().getFullYear()} SportBooking. Todos los derechos
                        reservados.
                    </p>
                    <div className="flex gap-4">
                        <Link size="sm" color="foreground" href="#">
                            Términos
                        </Link>
                        <Link size="sm" color="foreground" href="#">
                            Privacidad
                        </Link>
                    </div>
                </div>
            </div>
        </footer>
    );
}
