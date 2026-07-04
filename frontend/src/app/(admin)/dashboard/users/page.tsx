"use client";

import {
    Button,
    Chip,
    Spinner,
    Table,
    TableHeader,
    TableColumn,
    TableBody,
    TableRow,
    TableCell,
} from "@heroui/react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import { UserX } from "lucide-react";
import type { User, PaginatedResult } from "@/types";

export default function AdminUsersPage() {
    const queryClient = useQueryClient();

    const { data, isLoading } = useQuery({
        queryKey: ["admin-users"],
        queryFn: () => apiClient.get<PaginatedResult<User>>("/users"),
    });

    const deactivateMutation = useMutation({
        mutationFn: (id: string) => apiClient.delete(`/users/${id}`),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["admin-users"] });
        },
    });

    if (isLoading) {
        return (
            <div className="flex items-center justify-center py-12">
                <Spinner size="lg" />
            </div>
        );
    }

    const users = data?.data || [];

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-2xl font-bold">Usuarios</h1>
                <p className="text-sm text-default-500 mt-1">Gestiona los usuarios de la plataforma</p>
            </div>

            <Table aria-label="Usuarios">
                <TableHeader>
                    <TableColumn>NOMBRE</TableColumn>
                    <TableColumn>EMAIL</TableColumn>
                    <TableColumn>ROL</TableColumn>
                    <TableColumn>ESTADO</TableColumn>
                    <TableColumn>ACCIONES</TableColumn>
                </TableHeader>
                <TableBody emptyContent="No hay usuarios">
                    {users.map((user) => (
                        <TableRow key={user.id}>
                            <TableCell className="font-medium">
                                {user.firstName} {user.lastName}
                            </TableCell>
                            <TableCell>{user.email}</TableCell>
                            <TableCell>
                                <Chip color={user.role === "ADMIN" ? "secondary" : "default"} size="sm" variant="flat">
                                    {user.role}
                                </Chip>
                            </TableCell>
                            <TableCell>
                                <Chip color={user.isActive ? "success" : "danger"} size="sm" variant="dot">
                                    {user.isActive ? "Activo" : "Inactivo"}
                                </Chip>
                            </TableCell>
                            <TableCell>
                                {user.isActive && user.role !== "ADMIN" && (
                                    <Button
                                        size="sm"
                                        color="danger"
                                        variant="light"
                                        isIconOnly
                                        onPress={() => deactivateMutation.mutate(user.id)}
                                    >
                                        <UserX className="h-4 w-4" />
                                    </Button>
                                )}
                            </TableCell>
                        </TableRow>
                    ))}
                </TableBody>
            </Table>
        </div>
    );
}
