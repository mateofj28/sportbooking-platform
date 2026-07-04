// Auth types
export interface User {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    phone?: string;
    avatarUrl?: string;
    role: "CLIENT" | "ADMIN";
    isActive?: boolean;
    createdAt?: string;
}

export interface AuthResponse {
    user: User;
    accessToken: string;
    refreshToken: string;
}

export interface LoginCredentials {
    email: string;
    password: string;
}

export interface RegisterData {
    email: string;
    password: string;
    firstName: string;
    lastName: string;
    phone?: string;
}

// Sport types
export interface Sport {
    id: string;
    name: string;
    slug: string;
    icon?: string;
    description?: string;
    isActive: boolean;
}

// Venue types
export interface Venue {
    id: string;
    name: string;
    slug: string;
    description?: string;
    address: string;
    city: string;
    state?: string;
    country: string;
    latitude?: number;
    longitude?: number;
    phone?: string;
    email?: string;
    imageUrl?: string;
    isActive: boolean;
    sports?: { sport: Sport }[];
    facilities?: Facility[];
}

// Facility types
export interface Facility {
    id: string;
    venueId: string;
    sportId: string;
    name: string;
    description?: string;
    imageUrl?: string;
    surfaceType?: string;
    isIndoor: boolean;
    capacity?: number;
    isActive: boolean;
    minBookingDuration: number;
    maxBookingDuration: number;
    sport: Sport;
    venue: Pick<Venue, "id" | "name" | "city" | "address">;
    schedules?: Schedule[];
    pricing?: Pricing[];
}

// Schedule types
export interface Schedule {
    id: string;
    facilityId: string;
    dayOfWeek: number;
    openTime: string;
    closeTime: string;
    isActive: boolean;
}

// Pricing types
export interface Pricing {
    id: string;
    facilityId: string;
    dayOfWeek?: number;
    startTime: string;
    endTime: string;
    pricePerHour: number;
    currency: string;
    isActive: boolean;
}

// Booking types
export type BookingStatus = "PENDING" | "CONFIRMED" | "CANCELLED" | "COMPLETED";

export interface Booking {
    id: string;
    facilityId: string;
    userId: string;
    startDatetime: string;
    endDatetime: string;
    status: BookingStatus;
    totalPrice: number;
    currency: string;
    notes?: string;
    cancelledAt?: string;
    cancellationReason?: string;
    facility: Facility;
    user: Pick<User, "id" | "firstName" | "lastName" | "email">;
    createdAt: string;
}

export interface CreateBookingData {
    facilityId: string;
    startDatetime: string;
    endDatetime: string;
    notes?: string;
}

// Pagination
export interface PaginatedResult<T> {
    data: T[];
    meta: {
        total: number;
        page: number;
        limit: number;
        totalPages: number;
    };
}

// API Error
export interface ApiError {
    statusCode: number;
    message: string;
    errors?: string[];
}
