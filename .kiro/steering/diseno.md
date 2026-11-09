# Diseño de interfaz — SportBooking

Frontend Next.js + HeroUI + Tailwind. Todo el texto de la interfaz va en español (Argentina).
Estas reglas aplican a cualquier pantalla o componente nuevo y a las correcciones de los existentes.

## Campos numéricos

- **Los campos numéricos NO muestran las flechas de aumentar/disminuir** (spinners).
- Está resuelto globalmente en `globals.css` para cualquier `input[type="number"]` (también los de HeroUI),
  así que no hace falta repetirlo por pantalla. No agregar steppers ni botones +/- en campos numéricos.
- Validar rango con `min`/`max` y con Zod; el usuario escribe el número, no lo "gira".

## Campos de fecha y hora

- **Prohibido usar los controles nativos del navegador**: `<input type="date">`, `type="datetime-local"`,
  `type="time"`, `type="month"`, `type="week"`. Cada navegador los dibuja distinto y no respetan el tema.
- Usar los componentes de HeroUI:
  - Fecha: `DatePicker` (con `showMonthAndYearPickers` si el rango es amplio).
  - Fecha y hora: **dos controles independientes**, nunca un solo campo combinado.
    `DateTimeField` (`components/shared/date-time-field.tsx`) ya lo resuelve: `DatePicker` para el día y
    `TimeInput` para la hora, y entrega el valor como texto `YYYY-MM-DDTHH:mm`.
  - Solo hora: `TimeInput`. Rango de fechas: `DateRangePicker`.
- UX de fecha + hora:
  - La fecha manda: la hora está deshabilitada hasta elegir el día, y quitar el día quita la hora
    (nunca queda un estado a medias).
  - Al elegir el día, la hora se completa con un valor por defecto **visible** y editable
    (inicio `00:00`, fin `23:59`). Nada de comportamiento oculto.
  - El selector de "fin" no permite días anteriores al "inicio" (`minDate`).
  - Cada par es un grupo accesible (`role="group"`) con el error anunciado como alerta.
- Las fechas de negocio se interpretan en **hora de Argentina (UTC-3)**. Ver `lib/ads.ts`
  (`arLocalToIso` / `isoToArLocal`) y `lib/datetime.ts`.

## Tema y colores

- Modo claro: fondo de página `#ffffff`, tarjetas `#f8f8f8` (token `content1`).
- Modo oscuro: fondo `#1f1f21`.
- Los colores salen de los tokens del tema (`bg-background`, `bg-content1`, `text-foreground`, `text-default-*`),
  definidos en `tailwind.config.ts`. No hardcodear hex en componentes salvo casos puntuales.
- Cuidado con `globals.css`: fuerza `color` en `h1–h6`, `.font-bold` y `.font-semibold`. Si ese texto va sobre un
  fondo de color (banners, etiquetas sobre imágenes), forzar el color con `!` (ej. `text-white!`).

## Tarjetas y movimiento

- Tarjetas **planas**: sin sombra y sin efecto hover (elevación, escala u opacidad).
- Sin animaciones: `HeroUIProvider` usa `disableAnimation`. No agregar transiciones llamativas.

## Desplegables (Select, Dropdown, Autocomplete)

- Panel en **blanco** (`#ffffff`) con borde fino y sombra suave, en modo claro.
- Item en hover/foco: `#f0f1f2` (oscuro: `#2e2e32`). Está resuelto globalmente por rol ARIA en `globals.css`.
- Los filtros con "todos" ofrecen una primera opción explícita ("Todos los deportes", "Todos los complejos")
  y no permiten quedar sin selección (`disallowEmptySelection`).

## Tablas, estados y avatares

- Tablas del panel: siempre `DataTable` (`components/shared/data-table.tsx`), filas compactas.
- Badges de estado: `Chip` con `variant="flat"`.
- El avatar del usuario no lleva borde.
- Notificaciones sin leer: punto azul pequeño, sin número.

## Imágenes

- Sin fotos de stock ni URLs externas fijas. Usar `MediaImage` (`components/shared/media-image.tsx`): muestra la foto
  real si existe y, si falta o falla, un fondo por defecto dibujado en SVG.

## Formularios

- Los formularios validan con Zod y los límites replican los `CHECK` de la base (la base es la que garantiza).
- Modales largos: `scrollBehavior="inside"`.
- Teléfono, DNI y provincia usan los componentes compartidos (`PhoneInput`, `DniInput`, `ProvinceSelect`),
  nunca un input suelto.
