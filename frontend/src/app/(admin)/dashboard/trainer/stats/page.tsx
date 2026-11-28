"use client";

// Estadísticas del entrenador (Req. 11.4): lo suyo, sin la comisión de la empresa.
import { TrainerStatsView } from "@/components/trainer/trainer-stats";

export default function TrainerStatsPage() {
    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-2xl font-bold">Estadísticas</h1>
                <p className="text-sm text-default-500 mt-1">Tus clases y lo que ganaste. Lo ganado se cuenta el día en que termina cada clase.</p>
            </div>
            <TrainerStatsView admin={false} />
        </div>
    );
}