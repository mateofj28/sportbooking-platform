import {
    Injectable,
    ConflictException,
    UnauthorizedException,
    NotFoundException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { v4 as uuidv4 } from 'uuid';
import { PrismaService } from '../../prisma/prisma.service';
import { MailService } from '../mail/mail.service';
import { RegisterDto, LoginDto, ForgotPasswordDto, ResetPasswordDto } from './dto';

@Injectable()
export class AuthService {
    constructor(
        private prisma: PrismaService,
        private jwtService: JwtService,
        private configService: ConfigService,
        private mailService: MailService,
    ) { }

    async register(dto: RegisterDto) {
        const existingUser = await this.prisma.user.findUnique({
            where: { email: dto.email },
        });

        if (existingUser) {
            throw new ConflictException('Este email ya está registrado');
        }

        const passwordHash = await bcrypt.hash(dto.password, 12);

        const user = await this.prisma.user.create({
            data: {
                email: dto.email,
                passwordHash,
                firstName: dto.firstName,
                lastName: dto.lastName,
                phone: dto.phone,
            },
        });

        const tokens = await this.generateTokens(user.id, user.email, user.role);

        return {
            user: {
                id: user.id,
                email: user.email,
                firstName: user.firstName,
                lastName: user.lastName,
                role: user.role,
            },
            ...tokens,
        };
    }

    async login(dto: LoginDto) {
        const user = await this.prisma.user.findUnique({
            where: { email: dto.email },
        });

        if (!user) {
            throw new UnauthorizedException('Credenciales inválidas');
        }

        if (!user.isActive) {
            throw new UnauthorizedException('La cuenta está desactivada');
        }

        const isPasswordValid = await bcrypt.compare(dto.password, user.passwordHash);

        if (!isPasswordValid) {
            throw new UnauthorizedException('Credenciales inválidas');
        }

        const tokens = await this.generateTokens(user.id, user.email, user.role);

        return {
            user: {
                id: user.id,
                email: user.email,
                firstName: user.firstName,
                lastName: user.lastName,
                role: user.role,
                avatarUrl: user.avatarUrl,
            },
            ...tokens,
        };
    }

    async forgotPassword(dto: ForgotPasswordDto) {
        const user = await this.prisma.user.findUnique({
            where: { email: dto.email },
        });

        if (!user) {
            // Don't reveal if user exists
            return { message: 'Se ha enviado un enlace de recuperación a tu email' };
        }

        const resetToken = uuidv4();
        const resetTokenExpires = new Date(Date.now() + 3600000); // 1 hour

        await this.prisma.user.update({
            where: { id: user.id },
            data: { resetToken, resetTokenExpires },
        });

        // Send reset email
        await this.mailService.sendPasswordReset(user.email, resetToken, user.firstName);

        return { message: 'Se ha enviado un enlace de recuperación a tu email' };
    }

    async resetPassword(dto: ResetPasswordDto) {
        const user = await this.prisma.user.findFirst({
            where: {
                resetToken: dto.token,
                resetTokenExpires: { gte: new Date() },
            },
        });

        if (!user) {
            throw new NotFoundException('Token inválido o expirado');
        }

        const passwordHash = await bcrypt.hash(dto.password, 12);

        await this.prisma.user.update({
            where: { id: user.id },
            data: {
                passwordHash,
                resetToken: null,
                resetTokenExpires: null,
            },
        });

        return { message: 'Password reset successfully' };
    }

    async getProfile(userId: string) {
        const user = await this.prisma.user.findUnique({
            where: { id: userId },
            select: {
                id: true,
                email: true,
                firstName: true,
                lastName: true,
                phone: true,
                avatarUrl: true,
                role: true,
                createdAt: true,
            },
        });

        if (!user) {
            throw new NotFoundException('User not found');
        }

        return user;
    }

    private async generateTokens(userId: string, email: string, role: string) {
        const payload = { sub: userId, email, role };

        const accessToken = this.jwtService.sign(payload, {
            expiresIn: this.configService.get<string>('app.jwtExpiration') as any,
        });

        const refreshToken = this.jwtService.sign(payload, {
            expiresIn: this.configService.get<string>('app.jwtRefreshExpiration') as any,
        });

        return { accessToken, refreshToken };
    }

    async refreshToken(token: string) {
        try {
            const payload = this.jwtService.verify(token);
            const tokens = await this.generateTokens(payload.sub, payload.email, payload.role);
            return tokens;
        } catch {
            throw new UnauthorizedException('Token de refresco inválido');
        }
    }
}
