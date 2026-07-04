import { registerAs } from '@nestjs/config';

export default registerAs('app', () => ({
    port: parseInt(process.env.PORT, 10) || 3001,
    jwtSecret: process.env.JWT_SECRET || 'default-secret',
    jwtExpiration: process.env.JWT_EXPIRATION || '24h',
    jwtRefreshExpiration: process.env.JWT_REFRESH_EXPIRATION || '7d',
}));
