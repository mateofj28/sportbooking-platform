import { Injectable, ExecutionContext } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

/**
 * Guard JWT opcional: si viene un token válido, adjunta el usuario a la request.
 * Si no hay token (o es inválido), permite continuar como anónimo en lugar de
 * lanzar 401. Útil para endpoints públicos que ajustan su respuesta según el rol.
 */
@Injectable()
export class OptionalJwtAuthGuard extends AuthGuard('jwt') {
    // No lanzar error cuando no hay usuario; simplemente devolver undefined.
    handleRequest(err: any, user: any) {
        return user || undefined;
    }
}
