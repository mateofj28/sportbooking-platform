import type { ApiError } from "@/types";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001/api";

class ApiClient {
    private baseUrl: string;

    constructor(baseUrl: string) {
        this.baseUrl = baseUrl;
    }

    private getToken(): string | null {
        if (typeof window === "undefined") return null;
        return localStorage.getItem("accessToken");
    }

    private async handleResponse<T>(response: Response): Promise<T> {
        if (!response.ok) {
            const error: ApiError = await response.json().catch(() => ({
                statusCode: response.status,
                message: response.statusText,
            }));
            throw error;
        }
        return response.json();
    }

    async get<T>(endpoint: string, params?: Record<string, string>): Promise<T> {
        const url = new URL(`${this.baseUrl}${endpoint}`);
        if (params) {
            Object.entries(params).forEach(([key, value]) => {
                if (value) url.searchParams.append(key, value);
            });
        }

        const response = await fetch(url.toString(), {
            headers: {
                Authorization: `Bearer ${this.getToken()}`,
            },
        });

        return this.handleResponse<T>(response);
    }

    async post<T>(endpoint: string, body?: unknown): Promise<T> {
        const response = await fetch(`${this.baseUrl}${endpoint}`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${this.getToken()}`,
            },
            body: body ? JSON.stringify(body) : undefined,
        });

        return this.handleResponse<T>(response);
    }

    async patch<T>(endpoint: string, body?: unknown): Promise<T> {
        const response = await fetch(`${this.baseUrl}${endpoint}`, {
            method: "PATCH",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${this.getToken()}`,
            },
            body: body ? JSON.stringify(body) : undefined,
        });

        return this.handleResponse<T>(response);
    }

    async delete<T>(endpoint: string): Promise<T> {
        const response = await fetch(`${this.baseUrl}${endpoint}`, {
            method: "DELETE",
            headers: {
                Authorization: `Bearer ${this.getToken()}`,
            },
        });

        return this.handleResponse<T>(response);
    }
}

export const apiClient = new ApiClient(API_URL);
