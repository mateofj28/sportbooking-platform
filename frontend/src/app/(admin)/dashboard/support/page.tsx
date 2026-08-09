"use client";

import { Card, CardBody } from "@heroui/react";

const FAQ = [
  {
    question: "¿Cómo creo una nueva instalación?",
    answer: "Ve a Dashboard → Instalaciones → Nueva Instalación. Selecciona la sede, el deporte, define la superficie y las duraciones permitidas.",
  },
  {
    question: "¿Cómo configuro los horarios de una cancha?",
    answer: "Ve a Dashboard → Horarios, selecciona la instalación y agrega los horarios de apertura/cierre para cada día de la semana.",
  },
  {
    question: "¿Cómo bloqueo un horario por mantenimiento?",
    answer: "Ve a Dashboard → Bloqueos, selecciona la instalación, elige la fecha y el rango horario, y opcionalmente agrega un motivo.",
  },
  {
    question: "¿Cómo cancelo una reserva?",
    answer: "Ve a Dashboard → Reservas, busca la reserva y presiona el botón Cancelar. El horario se liberará automáticamente.",
  },
  {
    question: "¿Cómo creo una reserva manual para un cliente?",
    answer: "En Dashboard → Reservas, presiona 'Reserva Manual'. Selecciona la instalación, el usuario, fecha y horario. La reserva se confirma automáticamente.",
  },
  {
    question: "¿Cómo cambio el precio de una instalación?",
    answer: "Ve a Dashboard → Precios, selecciona la instalación, elimina la tarifa anterior y crea una nueva con el precio actualizado.",
  },
  {
    question: "¿Puedo tener diferentes precios por día?",
    answer: "Sí. Al crear una tarifa puedes seleccionar un día específico. Si dejas vacío el día, aplica para todos los días de la semana.",
  },
  {
    question: "¿Cómo agrego un nuevo deporte?",
    answer: "Ve a Dashboard → Deportes → Nuevo Deporte. Ingresa el nombre, slug (URL amigable) y un ícono opcional.",
  },
  {
    question: "¿Cómo desactivo una instalación temporalmente?",
    answer: "En Dashboard → Instalaciones, puedes eliminar (desactivar) una instalación. Los clientes no podrán reservarla hasta que se reactive.",
  },
  {
    question: "¿Los clientes pueden cancelar sus propias reservas?",
    answer: "Sí. Desde 'Mis Reservas', el cliente puede cancelar cualquier reserva pendiente o confirmada. El horario se libera al instante.",
  },
  {
    question: "¿Cómo veo las estadísticas de mi complejo?",
    answer: "Ve a Dashboard → Estadísticas. Ahí encontrarás gráficas de ingresos, reservas por deporte, demanda semanal y más indicadores clave.",
  },
  {
    question: "¿Cómo recupero mi contraseña?",
    answer: "En la pantalla de login, presiona '¿Olvidaste tu contraseña?'. Recibirás un email con un enlace para crear una nueva contraseña.",
  },
  {
    question: "¿Puedo tener múltiples sedes?",
    answer: "Sí. En Dashboard → Sedes puedes crear tantas sedes como necesites. Cada sede puede tener sus propias instalaciones y deportes.",
  },
  {
    question: "¿Qué pasa si un cliente reserva y no asiste?",
    answer: "Actualmente el sistema no tiene penalización automática por no-show. Puedes gestionar esto manualmente desde la sección de reservas.",
  },
];

export default function SupportPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Ayuda y Soporte</h1>
        <p className="text-sm text-default-500 mt-1">Preguntas frecuentes sobre el uso de la plataforma</p>
      </div>

      <Card>
        <CardBody className="p-6">
          <div className="space-y-4">
            {FAQ.map((item, i) => (
              <FaqItem key={i} question={item.question} answer={item.answer} />
            ))}
          </div>
        </CardBody>
      </Card>
    </div>
  );
}

function FaqItem({ question, answer }: { question: string; answer: string }) {
  return (
    <div className="rounded-lg bg-default-50 p-4">
      <p className="text-sm font-semibold">{question}</p>
      <p className="mt-1 text-xs text-default-500 leading-relaxed">{answer}</p>
    </div>
  );
}
