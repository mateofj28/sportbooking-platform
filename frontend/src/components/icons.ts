// ============================================================
// components/icons.ts
// ÚNICA fuente de íconos de la app: Heroicons (@heroicons/react, versión outline 24 px).
//
// Cada pantalla importa desde acá con un nombre por concepto ("Calendar", "Wallet",
// "AlertTriangle"...), nunca directo de la librería. Así:
//   - cambiar el ícono de un concepto se hace en un solo lugar;
//   - todos tienen el mismo trazo y tamaño de caja (24 px, se escalan con h-4 w-4, etc.).
// lucide-react se desinstaló: si alguien lo importa, el build falla.
//
// Los marcados "≈" no tienen un equivalente exacto en Heroicons (324 íconos): se usa el
// más parecido. Para cambiar alguno, editar solo esta lista.
// ============================================================

import type { ComponentType, SVGProps } from "react";

/** Tipo de cualquier ícono de la app (acepta className, aria-hidden, etc.). */
export type IconComponent = ComponentType<SVGProps<SVGSVGElement> & { title?: string; titleId?: string }>;

export {
    // Navegación y acciones
    ArrowDownRightIcon as ArrowDownRight,
    ArrowLeftIcon as ArrowLeft,
    ArrowRightIcon as ArrowRight,
    ArrowUpRightIcon as ArrowUpRight,
    ChevronLeftIcon as ChevronLeft,
    ChevronRightIcon as ChevronRight,
    Bars3Icon as Menu,
    XMarkIcon as X,
    PlusIcon as Plus,
    PencilIcon as Pencil,
    TrashIcon as Trash2,
    ArrowDownOnSquareIcon as Save,
    ArrowPathIcon as RefreshCw,
    ArrowPathRoundedSquareIcon as Repeat,
    ArrowUturnLeftIcon as RotateCcw,
    MagnifyingGlassIcon as Search,
    FunnelIcon as Filter,
    AdjustmentsHorizontalIcon as SlidersHorizontal,
    PaperClipIcon as Paperclip,
    PhotoIcon as ImagePlus,                       // ≈ (sin "+")
    ArrowRightStartOnRectangleIcon as LogOut,
    EyeIcon as Eye,
    EyeSlashIcon as EyeOff,
    ViewfinderCircleIcon as LocateFixed,          // ≈ ubicar en el mapa

    // Estados y avisos
    CheckIcon as Check,
    CheckCircleIcon as CheckCheck,                // ≈ (doble tilde)
    CheckCircleIcon as CheckCircle2,
    XCircleIcon as XCircle,
    CheckBadgeIcon as BadgeCheck,
    ExclamationTriangleIcon as AlertTriangle,
    InformationCircleIcon as Info,
    QuestionMarkCircleIcon as HelpCircle,
    NoSymbolIcon as Ban,
    LockClosedIcon as Lock,
    ShieldCheckIcon as Shield,                    // ≈ (Heroicons no tiene escudo vacío)
    ShieldCheckIcon as ShieldCheck,
    StarIcon as Star,
    BoltIcon as Zap,
    LightBulbIcon as Lightbulb,

    // Panel y secciones
    Squares2X2Icon as LayoutDashboard,
    ChartBarIcon as BarChart3,
    PresentationChartLineIcon as Activity,        // ≈ (línea de pulso)
    ArrowTrendingUpIcon as TrendingUp,
    ArrowTrendingDownIcon as TrendingDown,
    BellIcon as Bell,
    MegaphoneIcon as Megaphone,
    ClipboardDocumentListIcon as History,         // ≈ historial
    DocumentTextIcon as FileText,
    ClipboardIcon as StickyNote,                  // ≈ nota
    TagIcon as Tag,
    TrophyIcon as Trophy,
    GlobeAltIcon as Globe,
    ComputerDesktopIcon as Monitor,
    SunIcon as Sun,
    MoonIcon as Moon,

    // Fechas y horas
    CalendarIcon as Calendar,
    CalendarDateRangeIcon as CalendarCheck,       // ≈ (sin tilde)
    CalendarDaysIcon as CalendarDays,
    ClockIcon as Clock,

    // Personas y contacto
    UserIcon as User,
    UserCircleIcon as UserCheck,                  // ≈ (sin tilde)
    UserPlusIcon as UserPlus,
    UserMinusIcon as UserX,                       // ≈ (menos en vez de cruz)
    UsersIcon as Users,
    IdentificationIcon as IdCard,
    EnvelopeIcon as Mail,
    PhoneIcon as Phone,
    ChatBubbleOvalLeftIcon as MessageCircle,
    MapPinIcon as MapPin,

    // Dinero y créditos
    WalletIcon as Wallet,
    CircleStackIcon as Coins,                     // pila de monedas
    BanknotesIcon as Banknote,
    BanknotesIcon as HandCoins,                   // ≈ cobrar / pagar
    CurrencyDollarIcon as DollarSign,
    CurrencyDollarIcon as BadgeDollarSign,        // ≈ (sin insignia)
    CreditCardIcon as CreditCard,
    ChartPieIcon as PiggyBank,                    // ≈ comisión (parte del total)
    PercentBadgeIcon as Percent,
    CalculatorIcon as Sigma,                      // ≈ total / suma
    BuildingLibraryIcon as Landmark,

    // Lugares y servicios (amenities)
    BuildingOffice2Icon as Building2,
    BuildingStorefrontIcon as Store,
    WifiIcon as Wifi,
    FireIcon as Flame,
    ArrowRightEndOnRectangleIcon as DoorOpen,     // ≈ vestuarios (puerta)
    SparklesIcon as ShowerHead,                   // ≈ duchas
    HomeIcon as Toilet,                           // ≈ baños
    TruckIcon as ParkingSquare,                   // ≈ estacionamiento
    CakeIcon as UtensilsCrossed,                  // ≈ buffet / comida
    BeakerIcon as Coffee,                         // ≈ cafetería (taza)
    SwatchIcon as Shirt,                          // ≈ alquiler de pecheras
    HomeModernIcon as Armchair,                   // ≈ tribunas
    CloudIcon as Snowflake,                       // ≈ aire acondicionado
    HandRaisedIcon as Accessibility,              // ≈ accesible
} from "@heroicons/react/24/outline";
