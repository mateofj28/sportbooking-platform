"use client";

import { Button } from "@heroui/react";
import { Trophy, ArrowLeft } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";

const LAST_UPDATE = "26 de agosto de 2026";

export default function TermsPage() {
    const router = useRouter();

    return (
        <div className="flex min-h-screen flex-col bg-default-50">
            {/* Header */}
            <header className="bg-gradient-to-r from-blue-500 to-blue-800 px-6 py-5 text-white">
                <div className="mx-auto flex w-full max-w-3xl items-center gap-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/20">
                        <Trophy className="h-5 w-5" />
                    </div>
                    <span className="text-lg font-bold">SportBooking</span>
                </div>
            </header>

            <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-8">
                <Button
                    variant="light"
                    size="sm"
                    startContent={<ArrowLeft className="h-4 w-4" />}
                    onPress={() => router.back()}
                    className="mb-4"
                >
                    Volver
                </Button>

                <h1 className="text-3xl font-bold">Términos y Condiciones</h1>
                <p className="mt-1 text-sm text-default-500">Última actualización: {LAST_UPDATE}</p>

                <div className="mt-8 space-y-8 text-sm leading-relaxed text-default-700">
                    <Section title="1. Qué es SportBooking">
                        <p>
                            SportBooking es una plataforma que conecta a personas que quieren reservar
                            instalaciones deportivas (canchas de fútbol, pádel, tenis, básquet y otras
                            disciplinas) con los complejos deportivos que las ofrecen. A través de la
                            plataforma podés buscar complejos, consultar disponibilidad en tiempo real,
                            reservar turnos y gestionar tus reservas desde un solo lugar.
                        </p>
                        <p>
                            Al crear una cuenta y utilizar la plataforma, aceptás estos Términos y
                            Condiciones en su totalidad. Si no estás de acuerdo, por favor no utilices el
                            servicio.
                        </p>
                    </Section>

                    <Section title="2. Cuentas de usuario">
                        <p>
                            Para reservar necesitás crear una cuenta con datos reales y vigentes. Sos
                            responsable de mantener la confidencialidad de tu contraseña y de toda la
                            actividad que ocurra en tu cuenta. Debés notificarnos de inmediato ante
                            cualquier uso no autorizado.
                        </p>
                        <p>
                            Existen distintos tipos de cuenta: clientes (reservan turnos), administradores
                            de complejo (gestionan sus instalaciones, horarios y tarifas) y administración
                            general de la plataforma. Cada rol tiene permisos y responsabilidades acordes a
                            su función.
                        </p>
                    </Section>

                    <Section title="3. Reservas">
                        <p>
                            Una reserva confirma el uso de una instalación en una fecha y horario
                            determinados. La disponibilidad que se muestra es orientativa y se confirma al
                            momento de concretar la reserva. Una vez confirmada, el turno queda a tu nombre.
                        </p>
                        <p>
                            El precio de cada turno es definido por el complejo e incluye una comisión de
                            servicio de la plataforma, que se muestra de forma integrada en el precio final
                            antes de confirmar. El valor del turno es fijo por reserva, independientemente
                            de los minutos efectivamente utilizados dentro del horario reservado.
                        </p>
                        <p>
                            Los turnos fijos (reservas semanales recurrentes) generan varias reservas
                            individuales. Cada una se rige por las mismas reglas de pago y cancelación.
                        </p>
                    </Section>

                    <Section title="4. Pagos">
                        <p>
                            El pago de las reservas se realiza según los medios habilitados en la
                            plataforma. El monto abonado corresponde al precio del turno más la comisión de
                            servicio. Los comprobantes y el estado de pago quedan registrados en tu cuenta.
                        </p>
                        <p>
                            La administración de cada complejo es responsable de la prestación del servicio
                            en sus instalaciones. SportBooking actúa como intermediario tecnológico para la
                            reserva y el cobro.
                        </p>
                    </Section>

                    <Section title="5. Cancelaciones">
                        <p>
                            Como cliente podés cancelar una reserva hasta <strong>24 horas antes</strong>{" "}
                            del inicio del turno. Pasado ese plazo, la reserva no puede cancelarse desde la
                            plataforma. Por ejemplo, si tu turno es para mañana, tenés tiempo de cancelarlo;
                            si es para hoy, ya no es posible cancelarlo.
                        </p>
                        <p>
                            Las reservas de turnos fijos pendientes de pago pueden cancelarse
                            automáticamente si no se abonan dentro de las 24 horas previas al turno,
                            liberando el horario para otros usuarios.
                        </p>
                        <p>
                            La administración del complejo puede cancelar reservas por motivos de fuerza
                            mayor, mantenimiento u otras causas justificadas, informando al cliente.
                        </p>
                    </Section>

                    <Section title="6. Uso de la instalación y ausencias">
                        <p>
                            El horario reservado es de uso exclusivo del cliente durante la franja indicada.
                            Si no te presentás al turno (ausencia sin cancelación en tiempo y forma), la
                            reserva se considera utilizada y no genera derecho a reembolso.
                        </p>
                        <p>
                            Debés respetar las normas de convivencia, seguridad y uso de cada complejo, así
                            como las indicaciones de su personal.
                        </p>
                    </Section>

                    <Section title="7. Responsabilidades">
                        <p>
                            SportBooking facilita la conexión entre clientes y complejos, pero no es
                            propietaria ni operadora de las instalaciones. El estado, la seguridad y las
                            condiciones de las canchas son responsabilidad de cada complejo.
                        </p>
                        <p>
                            No nos responsabilizamos por lesiones, pérdidas o daños ocurridos durante el uso
                            de las instalaciones, ni por incumplimientos del complejo ajenos a la plataforma.
                        </p>
                    </Section>

                    <Section title="8. Datos personales">
                        <p>
                            Para funcionar, la plataforma recopila datos como nombre, correo electrónico y
                            teléfono. Esta información se utiliza para gestionar tus reservas, enviarte
                            confirmaciones, recordatorios y avisos relacionados con el servicio.
                        </p>
                        <p>
                            No compartimos tus datos con terceros ajenos a la operación del servicio sin tu
                            consentimiento, salvo obligación legal. Podés solicitar la actualización o baja
                            de tu cuenta en cualquier momento.
                        </p>
                    </Section>

                    <Section title="9. Notificaciones">
                        <p>
                            Al reservar, aceptás recibir comunicaciones por correo electrónico relacionadas
                            con tus reservas: confirmaciones, recordatorios de turno y avisos de
                            cancelación. Estas notificaciones son parte esencial del servicio.
                        </p>
                    </Section>

                    <Section title="10. Cambios en los términos">
                        <p>
                            Podemos actualizar estos Términos y Condiciones para reflejar mejoras del
                            servicio o cambios legales. Publicaremos la versión vigente en esta página con
                            su fecha de actualización. El uso continuado de la plataforma implica la
                            aceptación de los términos vigentes.
                        </p>
                    </Section>

                    <Section title="11. Contacto">
                        <p>
                            Ante cualquier duda sobre estos términos o sobre el funcionamiento de la
                            plataforma, podés escribirnos desde la sección de ayuda y soporte de tu cuenta.
                        </p>
                    </Section>
                </div>

                <div className="mt-10 border-t border-divider pt-6 text-center">
                    <Link href="/register" className="text-sm font-semibold text-primary hover:underline">
                        Volver al registro
                    </Link>
                </div>
            </main>

            <footer className="border-t border-divider px-6 py-4 text-center text-xs text-default-400">
                © {new Date().getFullYear()} SportBooking. Todos los derechos reservados.
            </footer>
        </div>
    );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
    return (
        <section>
            <h2 className="mb-2 text-lg font-semibold text-foreground">{title}</h2>
            <div className="space-y-3">{children}</div>
        </section>
    );
}
