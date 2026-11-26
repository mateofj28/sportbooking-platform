# Diseño de interfaz — SportBooking

Frontend Next.js + HeroUI + Tailwind. Todo el texto de la interfaz va en español (Argentina).
Estas reglas aplican a cualquier pantalla o componente nuevo y a las correcciones de los existentes.

## Campos numéricos

- **Los campos numéricos NO muestran las flechas de aumentar/disminuir** (spinners).
- Está resuelto globalmente en `globals.css` para cualquier `input[type="number"]` (también los de HeroUI),
  así que no hace falta repetirlo por pantalla. No agregar steppers ni botones +/- en campos numéricos.
- Validar rango con `min`/`max` y con Zod; el usuario escribe el número, no lo "gira".
- Si el valor es **discreto y de pocas opciones** (ej. prioridad 0 a 100 de 10 en 10), no usar un campo para
  tipear: usar un `Select` con las opciones. Si el registro ya tiene un valor fuera de esos pasos, se conserva
  como opción extra para no cambiarlo en silencio.

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
- **Todo selector de fecha tiene límites** (`minValue`/`maxValue`, o `minDate`/`maxDate` en `DateTimeField`):
  - No se ofrecen fechas que no tienen sentido para el caso (ej. programar algo en el pasado) ni años absurdos
    (1900, 2222). Si no hay una regla de negocio distinta, el tope hacia adelante es de 2 años.
  - "Hoy" y los límites se calculan en hora de Argentina (`todayAr()` en `lib/ads.ts`), nunca con la zona del navegador.
- **Reloj**: nunca usar `Date.now()` ni `new Date()` para decidir algo (pasado/futuro, pagar, cancelar, "hoy").
  Usar `lib/clock.ts`: `serverNow()` / `serverDate()` (hora del servidor, corrige PCs con la hora mal),
  `arTodayStr()`, `arTodayLocalDate()`, `isArToday()`, `arNowMinutes()` (día y hora de Argentina).
  `ClockSync` (providers) sincroniza con la RPC `server_now` al abrir la app y cada 10 min.
  `Date.now()` solo para cosas sin significado de negocio (nombres de archivo, ids, cachés).
  - Los límites se repiten en la validación Zod (el usuario puede escribir el año a mano) y en la base
    (trigger o CHECK). Ver `createAdvertisementSchema` y la migración 019 como ejemplo.
  - Las reglas "no en el pasado" se exigen solo sobre valores **nuevos o modificados**: al editar un registro
    con una fecha vieja que no se toca, no se debe bloquear el guardado.
- Las fechas de negocio se interpretan en **hora de Argentina (UTC-3)**. Ver `lib/ads.ts`
  (`arLocalToIso` / `isoToArLocal`) y `lib/datetime.ts`.

## Formato de fecha, hora y montos (al mostrar)

- **Fecha y hora**: `13 nov 2026, 8:45 pm` — en tablas, historiales, vigencias y detalles. Usar `formatDateTimeAr(iso)`.
- **Fecha sola**: `13 nov 2026` → `formatDateShortAr(iso)`.
- **Hora sola**: `8:45 pm` (12 h, sin cero adelante, `am`/`pm` en minúscula, sin puntos) → `formatTimeAr(iso)` para un
  instante, `formatClock("20:45")` para horas de reloj (horarios, tarifas, slots, opciones de selectores).
- Todo sale de `lib/datetime.ts`, siempre en hora de Argentina. **No armar fechas ni horas a mano** en las pantallas
  (`toLocaleString`, `"AM"/"PM"`, `"a. m."`): si hace falta un formato nuevo, se agrega ahí.
- **La moneda interna se llama "créditos"** (1 crédito = $1), nunca "puntos".
- **Montos**: miles con coma. Precios `$63,000` (`formatPrice`), créditos `63,000 créditos` (`formatPoints`), y cuando
  ayude, el equivalente en pesos `$63,000 ARS` (`formatPesos`). Campos de cantidad de créditos: `PointsInput`.

## Tema y colores

- Paleta del **modo claro** (definida en `tailwind.config.ts` y `globals.css`):

  | Color | Uso | Token |
  |---|---|---|
  | `#2F54D6` | Botones principales | `primary` |
  | `#FFFFFF` | Fondo general de la página | `background` |
  | `#F6F6F6` (= `lab(97 0.02 0)`) | Fondo de las tarjetas | `content1` |
  | `#111111` | Títulos y texto principal | `foreground` (y `h1–h6`, `.font-bold`, `.font-semibold` en `globals.css`) |
  | `#6B6B6B` | Texto secundario (descripciones, subtítulos) | `text-default-500` |
  | `#FFFFFF` | Texto sobre botones y sobre el banner azul | `primary-foreground` |
  | `#E5E5E5` | Líneas divisorias y bordes de botones secundarios | `divider` y `.border-default` |

- **Barra superior** (navbar), en modo claro: fondo `#2F54D6` (el azul de los botones primarios), textos e
  íconos `#FFFFFF`. En modo oscuro mantiene el degradado azul con texto blanco.
- **Menú lateral del panel** (sidebar de escritorio y drawer de móvil), en modo claro: fondo `#2F54D6`,
  íconos y textos `#FFFFFF`. El ítem activo se marca con `bg-white/20` y el hover con `bg-white/10`.
  "Cerrar sesión" también va en blanco (el rojo no se lee sobre el azul).
- Modo oscuro: fondo `#1f1f21`; el menú lateral usa `content1` y los colores de siempre.
- Los colores salen de los tokens del tema (`bg-background`, `bg-content1`, `text-foreground`, `text-default-*`),
  definidos en `tailwind.config.ts`. No hardcodear hex en componentes salvo casos puntuales.
- Cuidado con `globals.css`: fuerza `color` en `h1–h6`, `.font-bold` y `.font-semibold`. Si ese texto va sobre un
  fondo de color (banners, etiquetas sobre imágenes), forzar el color con `!` (ej. `text-white!`).

## Navegación

- **Celular (< 640 px), vista de cliente con sesión**: barra fija abajo (`components/layout/bottom-nav.tsx`) con
  Inicio · Canchas · Mis reservas · Billetera · Perfil. La sección actual va en `primary` con ícono relleno.
  "Perfil" abre una hoja desde abajo con Mi Perfil, Panel de administración (admins), Tema y Cerrar sesión.
  La monta el `Navbar`; el espacio se reserva en `globals.css` (`body:has([data-bottom-nav])`).
- En celular, fuera del panel, el avatar de arriba no se muestra (lo reemplaza "Perfil").
- **No hay menú hamburguesa** en la vista de cliente. En el panel (`/dashboard`) el botón de arriba abre el menú lateral.
- **Escritorio**: links arriba (Inicio, Instalaciones, Mis Reservas) y menú del avatar.
- Navegar siempre con `next/link` (sin recargar la página), nunca con `<a href>` para rutas internas.
- La barra superior no puede desbordar en 360 px. Orden a la derecha: **saldo y después la campana**.
  En celular el saldo va con el **número completo** sin la palabra ("98,764,000"); solo desde mil millones se
  acorta ("1.2B"). Desde 640 px: "98,764,000 créditos". El nombre de la marca se oculta por debajo de 420 px.

## Botones

Resuelto globalmente en `globals.css` (no repetir clases en cada pantalla). Aplica a los `Button` de HeroUI
de tamaño `md` (por defecto) y `lg`. Los `size="sm"` (filas de tabla, barras compactas) y los `isIconOnly`
conservan su tamaño.

- **Primario** = `color="primary"` (variant `solid`): alto 44 px (`h-11`), padding horizontal 20 px (`px-5`),
  borde 1 px transparente, radio 12 px, texto 14 px peso 500. Fondo `#2F54D6`, texto blanco.
- **Secundario** = `variant="bordered"` (color `default`): mismas medidas; borde 1 px `#E5E5E5`, fondo `#FFFFFF`
  (`background-clip: padding-box`) en modo claro.
- **Ancho**: en móvil (< 640 px) ocupan el 100% del contenedor; desde 640 px se ajustan al contenido.
- Para que un botón tome este estilo, usar esas props. Otras variantes (`flat`, `light`, `bordered` con color)
  no son primario ni secundario y mantienen el estilo de HeroUI.

## Tarjetas y movimiento

- Tarjetas **planas**: sin sombra y sin efecto hover (elevación, escala u opacidad).
- Borde de las tarjetas en modo claro: **1 px `#E5E5E5`**, en todas. Resuelto globalmente en `globals.css`, así
  que no hace falta poner `border border-divider` en cada `Card`. Para marcar un estado se puede usar un borde de
  color (`border-warning/40`, `border-danger-200`, `border-success/30`, `border-primary…`), y `border-0` o
  `border-none` lo quitan.
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

## Íconos

- Librería única: **Heroicons** (`@heroicons/react`, outline 24 px). `lucide-react` no está instalado.
- Importar directo de `@heroicons/react/24/outline` con el nombre real (`CalendarIcon`, `WalletIcon`,
  `ExclamationTriangleIcon`…). No usar nombres ni alias de otras librerías.
- El tipo de un ícono pasado como prop o valor es `IconComponent` (`@/lib/icon-type`).
- Tamaño con clases (`h-4 w-4`, `h-5 w-5`); íconos decorativos con `aria-hidden="true"`.

## Imágenes

- Sin fotos de stock ni URLs externas fijas. Usar `MediaImage` (`components/shared/media-image.tsx`): muestra la foto
  real si existe y, si falta o falla, un fondo por defecto dibujado en SVG.
- **Publicidad = imagen** (banner diseñado por el anunciante), no texto. Dos imágenes: computadora 1920×400
  (obligatoria) y celular 1080×540 (opcional; si falta se usa la de computadora). JPG/PNG/WebP hasta 2 MB, bucket
  `ads`. Se sube con `AdImageUpload`, que valida proporción y ancho mínimo; la base solo acepta URLs de ese bucket
  (migración 042). Cada publicidad lleva un texto alternativo ("¿Qué dice la imagen?").

## Formularios

- Los formularios validan con Zod y los límites replican los `CHECK` de la base (la base es la que garantiza).
- Modales largos: `scrollBehavior="inside"`.
- Teléfono, DNI y provincia usan los componentes compartidos (`PhoneInput`, `DniInput`, `ProvinceSelect`),
  nunca un input suelto.

## Mensajes de error

- Todo error que ve el usuario va en **español**. Los de Supabase (Auth, Postgres, Storage, Edge Functions) y del
  navegador vienen en inglés: se traducen en `lib/error-messages.ts` (`translateError`, `toAppError`).
- En los hooks, lanzar `throw toAppError(error)`, nunca `throw new Error(error.message)`.
- Hay redes de seguridad globales (React Query `MutationCache`/`QueryCache`, `addToast`, `invokeFunction`, `callRpc`),
  pero un error nuevo con texto en inglés se agrega a las reglas de `error-messages.ts`.
- Los mensajes de Zod sin `message` propio salen en español (`lib/zod-es.ts`).
- Los `RAISE EXCEPTION` de la base y los `err()` de las Edge Functions se escriben en español.
