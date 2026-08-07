"use client";

import { Card, CardBody, Link } from "@heroui/react";
import { HelpCircle, Mail, MessageCircle, FileText } from "lucide-react";

export default function SupportPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Ayuda y Soporte</h1>
        <p className="text-sm text-default-500 mt-1">¿Necesitas ayuda? Estamos aquí para ti</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Card className="border border-divider hover:border-primary/30 transition-colors">
          <CardBody className="flex flex-col items-center text-center p-6 gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10">
              <Mail className="h-6 w-6 text-primary" />
            </div>
            <h3 className="font-semibold">Contacto por Email</h3>
            <p className="text-xs text-default-500">Escríbenos y te responderemos en menos de 24 horas</p>
            <Link href="mailto:soporte@sportbooking.com" className="text-sm text-primary font-medium">
              soporte@sportbooking.com
            </Link>
          </CardBody>
        </Card>

        <Card className="border border-divider hover:border-primary/30 transition-colors">
          <CardBody className="flex flex-col items-center text-center p-6 gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-success/10">
              <MessageCircle className="h-6 w-6 text-success" />
            </div>
            <h3 className="font-semibold">Chat en vivo</h3>
            <p className="text-xs text-default-500">Disponible de lunes a viernes, 8am a 6pm</p>
            <span className="text-xs text-default-400">Próximamente</span>
          </CardBody>
        </Card>

        <Card className="border border-divider hover:border-primary/30 transition-colors">
          <CardBody className="flex flex-col items-center text-center p-6 gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-warning/10">
              <FileText className="h-6 w-6 text-warning" />
            </div>
            <h3 className="font-semibold">Documentación</h3>
            <p className="text-xs text-default-500">Guías, tutoriales y preguntas frecuentes</p>
            <span className="text-xs text-default-400">Próximamente</span>
          </CardBody>
        </Card>
      </div>

      <Card>
        <CardBody className="p-6">
          <h2 className="text-lg font-semibold mb-4">Preguntas Frecuentes</h2>
          <div className="space-y-4">
            <FaqItem
              question="¿Cómo creo una nueva instalación?"
              answer="Ve a Dashboard → Instalaciones → Nueva Instalación. Selecciona la sede, el deporte, define la superficie y las duraciones permitidas."
            />
            <FaqItem
              question="¿Cómo configuro los horarios de una cancha?"
              answer="Ve a Dashboard → Horarios, selecciona la instalación y agrega los horarios de apertura/cierre para cada día de la semana."
            />
            <FaqItem
              question="¿Cómo bloqueo un horario por mantenimiento?"
              answer="Ve a Dashboard → Bloqueos, selecciona la instalación, elige la fecha y el rango horario, y opcionalmente agrega un motivo."
            />
            <FaqItem
              question="¿Cómo cancelo una reserva?"
              answer="Ve a Dashboard → Reservas, busca la reserva y presiona el botón Cancelar. El horario se liberará automáticamente."
            />
          </div>
        </CardBody>
      </Card>
    </div>
  );
}

function FaqItem({ question, answer }: { question: string; answer: string }) {
  return (
    <div className="rounded-lg bg-default-50 p-4">
      <p className="text-sm font-semibold text-foreground">{question}</p>
      <p className="mt-1 text-xs text-default-500 leading-relaxed">{answer}</p>
    </div>
  );
}
