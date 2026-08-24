import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Role } from '@prisma/client';
import { ROLES_KEY } from '../decorators/roles.decorator';

@Injectable()
export class RolesGuard implements CanActivate {
    constructor(private reflector: Reflector) { }

    canActivate(context: ExecutionContext): boolean {
        const requiredRoles = this.reflector.getAllAndOverride<Role[]>(ROLES_KEY, [
            context.getHandler(),
            context.getClass(),
        ]);

      if (!requiredRoles) {
          return true;
      }

      const { user } = context.switchToHttp().getRequest();

      // VENUE_ADMIN has access to ADMIN-protected routes (filtered by venue in services)
      if (requiredRoles.includes(Role.ADMIN) && user?.role === Role.VENUE_ADMIN) {
          return true;
      }

      return requiredRoles.some((role) => user?.role === role);
  }
}
