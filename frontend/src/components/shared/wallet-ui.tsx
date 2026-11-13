"use client";

import { useState } from "react";
import { Button, Card, CardBody } from "@heroui/react";
import { FileText } from "lucide-react";
import { getReceiptUrl } from "@/hooks/use-wallet";
import { useToastStore } from "@/stores/toast-store";

/** Abre un comprobante privado de liquidación con una URL temporal (5 min). */
export function ReceiptButton({ path }: { path: string }) {
    const addToast = useToastStore((s) => s.addToast);
    const [loading, setLoading] = useState(false);
    return (
        <Button
            size="sm"
            variant="light"
            startContent={loading ? undefined : <FileText className="h-4 w-4" />}
            isLoading={loading}
            onPress={async () => {
                setLoading(true);
                try {
                    window.open(await getReceiptUrl(path), "_blank", "noopener,noreferrer");
                } catch (e) {
                    addToast((e as Error).message, "error");
                } finally {
                    setLoading(false);
                }
            }}
        >
            Ver comprobante
        </Button>
    );
}

/** Tarjeta de resumen (plana, sin sombra). */
export function SummaryCard({ icon, label, value, hint }: { icon: React.ReactNode; label: string; value: string; hint?: string }) {
    return (
        <Card shadow="none" className="bg-content1">
            <CardBody className="gap-1 p-5">
                <div className="flex items-center gap-2 text-sm text-default-500">{icon}{label}</div>
                <p className="text-2xl font-bold tabular-nums">{value}</p>
                {hint && <p className="text-xs text-default-400">{hint}</p>}
            </CardBody>
        </Card>
    );
}
