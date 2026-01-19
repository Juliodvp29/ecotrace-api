import { Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as admin from 'firebase-admin';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class FirebaseService implements OnModuleInit {
    private storage: admin.storage.Storage;
    private bucket: any;

    constructor(private readonly configService: ConfigService) { }

    onModuleInit() {
        admin.initializeApp({
            credential: admin.credential.cert({
                projectId: this.configService.get<string>('FIREBASE_PROJECT_ID'),
                clientEmail: this.configService.get<string>('FIREBASE_CLIENT_EMAIL'),
                privateKey: this.configService
                    .get<string>('FIREBASE_PRIVATE_KEY')
                    ?.replace(/\\n/g, '\n'),
            }),
            storageBucket: this.configService.get<string>('FIREBASE_STORAGE_BUCKET'),
        });

        this.storage = admin.storage();
        this.bucket = this.storage.bucket();
    }

    /**
     * Upload a file to Firebase Storage
     * @param file - File buffer
     * @param originalName - Original filename
     * @param folder - Folder path in storage (e.g., 'documents', 'invoices')
     * @returns Public URL of uploaded file
     */
    async uploadFile(
        file: Buffer,
        originalName: string,
        folder: string = 'documents',
        orgId?: string,
        userId?: string
    ): Promise<{ url: string; filename: string }> {
        const fileExtension = originalName.split('.').pop() || 'bin';
        const filename = `${folder}/${uuidv4()}.${fileExtension}`;

        // Validar la ruta según las reglas de seguridad
        let filePath: string;
        if (folder === 'organizations' && orgId) {
            filePath = `organizations/${orgId}/documents/${filename}`;
        } else if (folder === 'temp' && userId) {
            filePath = `temp/${userId}/${filename}`;
        } else {
            throw new Error('Ruta no válida para las reglas de seguridad de Firebase Storage');
        }

        const fileUpload = this.bucket.file(filePath);

        await fileUpload.save(file, {
            metadata: {
                contentType: this.getContentType(fileExtension),
                metadata: {
                    originalName,
                    uploadedAt: new Date().toISOString(),
                },
            },
            public: true,
        });

        const publicUrl = `https://storage.googleapis.com/${this.bucket.name}/${filePath}`;

        return {
            url: publicUrl,
            filename: filePath,
        };
    }

    /**
     * Delete a file from Firebase Storage
     * @param filename - File path in storage
     */
    async deleteFile(filename: string): Promise<void> {
        const file = this.bucket.file(filename);
        await file.delete();
    }

    /**
     * Download a file from Firebase Storage
     * @param filename - File path in storage
     * @returns File buffer
     */
    async downloadFile(filename: string): Promise<Buffer> {
        const file = this.bucket.file(filename);
        const [buffer] = await file.download();
        return buffer;
    }

    /**
     * Get signed URL for temporary access
     * @param filename - File path in storage
     * @param expiresInMinutes - Expiration time in minutes
     */
    async getSignedUrl(
        filename: string,
        expiresInMinutes: number = 60
    ): Promise<string> {
        const file = this.bucket.file(filename);
        const [url] = await file.getSignedUrl({
            action: 'read',
            expires: Date.now() + expiresInMinutes * 60 * 1000,
        });
        return url;
    }

    private getContentType(extension: string): string {
        const contentTypes: Record<string, string> = {
            pdf: 'application/pdf',
            jpg: 'image/jpeg',
            jpeg: 'image/jpeg',
            png: 'image/png',
            doc: 'application/msword',
            docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            xls: 'application/vnd.ms-excel',
            xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        };

        return contentTypes[extension?.toLowerCase()] || 'application/octet-stream';
    }
}