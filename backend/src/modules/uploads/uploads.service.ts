import { Injectable, InternalServerErrorException, Logger } from '@nestjs/common';
import { v2 as cloudinary } from 'cloudinary';

@Injectable()
export class UploadsService {
    private readonly logger = new Logger(UploadsService.name);

    constructor() {
        cloudinary.config({
            cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
            api_key: process.env.CLOUDINARY_API_KEY,
            api_secret: process.env.CLOUDINARY_API_SECRET,
            secure: true,
        });
    }

    /**
     * Sube un buffer de imagen a Cloudinary y devuelve la URL pública (https).
     * @param folder carpeta lógica en Cloudinary (ej: "venues")
     */
    async uploadImage(file: Express.Multer.File, folder = 'venues'): Promise<string> {
        if (!process.env.CLOUDINARY_CLOUD_NAME) {
            throw new InternalServerErrorException('Cloudinary no está configurado');
        }
        return new Promise<string>((resolve, reject) => {
            const stream = cloudinary.uploader.upload_stream(
                {
                    folder: `sportbooking/${folder}`,
                    resource_type: 'image',
                    // Optimización: limita tamaño y deja que Cloudinary elija formato/calidad
                    transformation: [
                        { width: 1200, height: 800, crop: 'limit' },
                        { quality: 'auto', fetch_format: 'auto' },
                    ],
                },
                (error, result) => {
                    if (error || !result) {
                        this.logger.error('Error subiendo a Cloudinary', error as any);
                        return reject(new InternalServerErrorException('No se pudo subir la imagen'));
                    }
                    resolve(result.secure_url);
                },
            );
            stream.end(file.buffer);
        });
    }
}
