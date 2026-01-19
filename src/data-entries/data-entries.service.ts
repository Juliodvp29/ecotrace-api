// src/data-entries/data-entries.service.ts
import {
    BadRequestException,
    ForbiddenException,
    Inject,
    Injectable,
    NotFoundException,
} from '@nestjs/common';
import { Pool } from 'pg';
import { PG_CONNECTION } from '../database/database.module';
import { FirebaseService } from '../firebase/firebase.service';
import { OcrService } from '../ocr/ocr.service';
import { CreateDataEntryDto } from './dto/create-data-entry.dto';
import { UpdateDataEntryDto } from './dto/update-data-entry.dto';

@Injectable()
export class DataEntriesService {
    constructor(
        @Inject(PG_CONNECTION) private readonly pool: Pool,
        @Inject('OCR_SERVICE') private readonly ocrService: OcrService,
        private readonly firebaseService: FirebaseService,
    ) { }

    // ============================================================================
    // PROCESS DOCUMENT WITH OCR
    // ============================================================================

    async processDocument(
        userId: string,
        file: Express.Multer.File,
        category: string,
        facilityId?: string,
        notes?: string,
    ) {
        // Verify user has access to organization
        const user = await this.getUserWithOrg(userId);
        if (!user.organization_id) {
            throw new ForbiddenException('User must belong to an organization');
        }

        // Verify facility belongs to organization if provided
        if (facilityId) {
            await this.verifyFacilityAccess(facilityId, user.organization_id);
        }

        // Upload document to Firebase
        const { url, filename } = await this.firebaseService.uploadFile(
            file.buffer,
            file.originalname,
            'organizations', // Cambiar a la carpeta permitida por las reglas de seguridad
            user.organization_id, // Proporcionar el orgId requerido por las reglas
        );

        // Process with OCR
        const ocrResult = await this.ocrService.processDocument(
            file.buffer,
            file.mimetype,
            category,
        );

        // Get category ID from database
        const categoryResult = await this.pool.query(
            `SELECT id FROM emission_categories 
       WHERE LOWER(name) LIKE $1 
       ORDER BY created_at DESC 
       LIMIT 1`,
            [`%${category}%`],
        );

        if (categoryResult.rows.length === 0) {
            throw new BadRequestException(`Category not found for: ${category}`);
        }

        const categoryId = categoryResult.rows[0].id;

        // Get appropriate emission factor
        const emissionFactor = await this.getEmissionFactor(
            categoryId,
            ocrResult.unit,
        );

        // Calculate CO2e
        const co2eKg = emissionFactor
            ? ocrResult.consumption * emissionFactor.co2e_per_unit
            : null;

        // Create data entry
        const result = await this.pool.query(
            `INSERT INTO data_entries (
        organization_id, facility_id, category_id, created_by_user_id,
        entry_date, quantity, unit, emission_factor_id, co2e_kg,
        document_filename, document_url, vendor_name, invoice_number, 
        total_cost, notes, confidence_level, verification_status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
      RETURNING *`,
            [
                user.organization_id,
                facilityId || null,
                categoryId,
                userId,
                ocrResult.date,
                ocrResult.consumption,
                ocrResult.unit,
                emissionFactor?.id || null,
                co2eKg,
                filename,
                url,
                ocrResult.vendor,
                null, // invoice_number
                ocrResult.totalCost,
                ocrResult.notes || notes,
                ocrResult.confidence,
                ocrResult.confidence === 'high' ? 'pending' : 'action_required',
            ],
        );

        return {
            dataEntry: this.formatDataEntry(result.rows[0]),
            ocrResult,
            message: 'Document processed successfully',
        };
    }

    // ============================================================================
    // CRUD OPERATIONS
    // ============================================================================

    async create(userId: string, createDto: CreateDataEntryDto) {
        const user = await this.getUserWithOrg(userId);
        if (!user.organization_id) {
            throw new ForbiddenException('User must belong to an organization');
        }

        // Verify facility if provided
        if (createDto.facilityId) {
            await this.verifyFacilityAccess(createDto.facilityId, user.organization_id);
        }

        // Get emission factor
        const emissionFactor = await this.getEmissionFactor(
            createDto.categoryId,
            createDto.unit,
        );

        // Calculate CO2e
        const co2eKg = emissionFactor
            ? createDto.quantity * emissionFactor.co2e_per_unit
            : null;

        const result = await this.pool.query(
            `INSERT INTO data_entries (
        organization_id, facility_id, category_id, created_by_user_id,
        entry_date, quantity, unit, emission_factor_id, co2e_kg,
        vendor_name, invoice_number, total_cost, notes, document_url, document_filename
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
      RETURNING *`,
            [
                user.organization_id,
                createDto.facilityId || null,
                createDto.categoryId,
                userId,
                createDto.entryDate,
                createDto.quantity,
                createDto.unit,
                emissionFactor?.id || null,
                co2eKg,
                createDto.vendorName,
                createDto.invoiceNumber,
                createDto.totalCost,
                createDto.notes,
                createDto.documentUrl,
                createDto.documentFilename,
            ],
        );

        return {
            dataEntry: this.formatDataEntry(result.rows[0]),
            message: 'Data entry created successfully',
        };
    }

    async findAll(
        userId: string,
        filters?: {
            facilityId?: string;
            categoryId?: string;
            startDate?: string;
            endDate?: string;
            status?: string;
        },
    ) {
        const user = await this.getUserWithOrg(userId);
        if (!user.organization_id) {
            throw new ForbiddenException('User must belong to an organization');
        }

        let query = `
      SELECT de.*, 
        ec.name as category_name, ec.scope as category_scope,
        f.name as facility_name,
        u.full_name as created_by_name
      FROM data_entries de
      JOIN emission_categories ec ON de.category_id = ec.id
      LEFT JOIN facilities f ON de.facility_id = f.id
      LEFT JOIN users u ON de.created_by_user_id = u.id
      WHERE de.organization_id = $1
    `;

        const params: any[] = [user.organization_id];
        let paramCount = 2;

        if (filters?.facilityId) {
            query += ` AND de.facility_id = $${paramCount}`;
            params.push(filters.facilityId);
            paramCount++;
        }

        if (filters?.categoryId) {
            query += ` AND de.category_id = $${paramCount}`;
            params.push(filters.categoryId);
            paramCount++;
        }

        if (filters?.startDate) {
            query += ` AND de.entry_date >= $${paramCount}`;
            params.push(filters.startDate);
            paramCount++;
        }

        if (filters?.endDate) {
            query += ` AND de.entry_date <= $${paramCount}`;
            params.push(filters.endDate);
            paramCount++;
        }

        if (filters?.status) {
            query += ` AND de.verification_status = $${paramCount}`;
            params.push(filters.status);
            paramCount++;
        }

        query += ' ORDER BY de.entry_date DESC, de.created_at DESC';

        const result = await this.pool.query(query, params);

        return result.rows.map(row => this.formatDataEntry(row));
    }

    async findOne(userId: string, id: string) {
        const user = await this.getUserWithOrg(userId);

        const result = await this.pool.query(
            `SELECT de.*, 
        ec.name as category_name, ec.scope as category_scope, ec.icon as category_icon,
        f.name as facility_name,
        u.full_name as created_by_name,
        ef.co2e_per_unit, ef.source as emission_factor_source
      FROM data_entries de
      JOIN emission_categories ec ON de.category_id = ec.id
      LEFT JOIN facilities f ON de.facility_id = f.id
      LEFT JOIN users u ON de.created_by_user_id = u.id
      LEFT JOIN emission_factors ef ON de.emission_factor_id = ef.id
      WHERE de.id = $1 AND de.organization_id = $2`,
            [id, user.organization_id],
        );

        if (result.rows.length === 0) {
            throw new NotFoundException('Data entry not found');
        }

        return this.formatDataEntry(result.rows[0]);
    }

    async update(userId: string, id: string, updateDto: UpdateDataEntryDto) {
        const user = await this.getUserWithOrg(userId);

        // Verify entry exists and belongs to organization
        await this.findOne(userId, id);

        // Verify facility if provided
        if (updateDto.facilityId) {
            await this.verifyFacilityAccess(updateDto.facilityId, user.organization_id);
        }

        const updates: string[] = [];
        const values: any[] = [];
        let paramCount = 1;

        if (updateDto.facilityId !== undefined) {
            updates.push(`facility_id = $${paramCount++}`);
            values.push(updateDto.facilityId);
        }
        if (updateDto.categoryId) {
            updates.push(`category_id = $${paramCount++}`);
            values.push(updateDto.categoryId);
        }
        if (updateDto.entryDate) {
            updates.push(`entry_date = $${paramCount++}`);
            values.push(updateDto.entryDate);
        }
        if (updateDto.quantity !== undefined) {
            updates.push(`quantity = $${paramCount++}`);
            values.push(updateDto.quantity);
        }
        if (updateDto.unit) {
            updates.push(`unit = $${paramCount++}`);
            values.push(updateDto.unit);
        }
        if (updateDto.vendorName !== undefined) {
            updates.push(`vendor_name = $${paramCount++}`);
            values.push(updateDto.vendorName);
        }
        if (updateDto.invoiceNumber !== undefined) {
            updates.push(`invoice_number = $${paramCount++}`);
            values.push(updateDto.invoiceNumber);
        }
        if (updateDto.totalCost !== undefined) {
            updates.push(`total_cost = $${paramCount++}`);
            values.push(updateDto.totalCost);
        }
        if (updateDto.notes !== undefined) {
            updates.push(`notes = $${paramCount++}`);
            values.push(updateDto.notes);
        }
        if (updateDto.verificationStatus) {
            updates.push(`verification_status = $${paramCount++}`);
            values.push(updateDto.verificationStatus);

            if (updateDto.verificationStatus === 'verified') {
                updates.push(`verified_by_user_id = $${paramCount++}`);
                values.push(userId);
                updates.push(`verified_at = NOW()`);
            }
        }

        if (updates.length === 0) {
            throw new BadRequestException('No fields to update');
        }

        // Recalculate CO2e if quantity or unit changed
        if (updateDto.quantity !== undefined || updateDto.unit) {
            const entry = await this.pool.query(
                'SELECT category_id, quantity, unit FROM data_entries WHERE id = $1',
                [id],
            );
            const currentEntry = entry.rows[0];

            const emissionFactor = await this.getEmissionFactor(
                updateDto.categoryId || currentEntry.category_id,
                updateDto.unit || currentEntry.unit,
            );

            const newQuantity = updateDto.quantity ?? currentEntry.quantity;
            const co2eKg = emissionFactor
                ? newQuantity * emissionFactor.co2e_per_unit
                : null;

            if (co2eKg !== null) {
                updates.push(`co2e_kg = $${paramCount++}`);
                values.push(co2eKg);
                updates.push(`emission_factor_id = $${paramCount++}`);
                values.push(emissionFactor.id);
            }
        }

        values.push(id);
        const result = await this.pool.query(
            `UPDATE data_entries 
       SET ${updates.join(', ')}, updated_at = NOW()
       WHERE id = $${paramCount}
       RETURNING *`,
            values,
        );

        return {
            dataEntry: this.formatDataEntry(result.rows[0]),
            message: 'Data entry updated successfully',
        };
    }

    async remove(userId: string, id: string) {
        const user = await this.getUserWithOrg(userId);

        // Verify entry exists
        const entry = await this.findOne(userId, id);

        // Delete document from Firebase if exists
        if (entry.documentFilename) {
            try {
                await this.firebaseService.deleteFile(entry.documentFilename);
            } catch (error) {
                console.error('Failed to delete file from Firebase:', error);
            }
        }

        await this.pool.query(
            'DELETE FROM data_entries WHERE id = $1 AND organization_id = $2',
            [id, user.organization_id],
        );

        return { message: 'Data entry deleted successfully' };
    }

    // ============================================================================
    // STATISTICS
    // ============================================================================

    async getStats(userId: string, year?: number) {
        const user = await this.getUserWithOrg(userId);
        const targetYear = year || new Date().getFullYear();

        const result = await this.pool.query(
            `SELECT 
        COUNT(*) as total_entries,
        SUM(co2e_kg) as total_emissions,
        COUNT(DISTINCT facility_id) as facilities_with_data,
        COUNT(CASE WHEN verification_status = 'verified' THEN 1 END) as verified_entries,
        COUNT(CASE WHEN verification_status = 'action_required' THEN 1 END) as action_required_entries
      FROM data_entries
      WHERE organization_id = $1 
        AND EXTRACT(YEAR FROM entry_date) = $2`,
            [user.organization_id, targetYear],
        );

        return result.rows[0];
    }

    // ============================================================================
    // HELPER METHODS
    // ============================================================================

    private async getUserWithOrg(userId: string) {
        const result = await this.pool.query(
            'SELECT id, organization_id, role FROM users WHERE id = $1',
            [userId],
        );

        if (result.rows.length === 0) {
            throw new NotFoundException('User not found');
        }

        return result.rows[0];
    }

    private async verifyFacilityAccess(facilityId: string, organizationId: string) {
        const result = await this.pool.query(
            'SELECT id FROM facilities WHERE id = $1 AND organization_id = $2',
            [facilityId, organizationId],
        );

        if (result.rows.length === 0) {
            throw new ForbiddenException('Facility not found or access denied');
        }
    }

    private async getEmissionFactor(categoryId: string, unit: string) {
        const result = await this.pool.query(
            `SELECT * FROM emission_factors 
       WHERE category_id = $1 
         AND LOWER(unit) = LOWER($2)
         AND is_active = true
         AND (valid_until IS NULL OR valid_until >= CURRENT_DATE)
       ORDER BY year DESC, created_at DESC
       LIMIT 1`,
            [categoryId, unit],
        );

        return result.rows[0] || null;
    }

    private formatDataEntry(entry: any) {
        return {
            id: entry.id,
            organizationId: entry.organization_id,
            facilityId: entry.facility_id,
            facilityName: entry.facility_name,
            categoryId: entry.category_id,
            categoryName: entry.category_name,
            categoryScope: entry.category_scope,
            categoryIcon: entry.category_icon,
            createdByUserId: entry.created_by_user_id,
            createdByName: entry.created_by_name,
            entryDate: entry.entry_date,
            quantity: parseFloat(entry.quantity),
            unit: entry.unit,
            emissionFactorId: entry.emission_factor_id,
            co2eKg: entry.co2e_kg ? parseFloat(entry.co2e_kg) : null,
            emissionFactorSource: entry.emission_factor_source,
            documentFilename: entry.document_filename,
            documentUrl: entry.document_url,
            vendorName: entry.vendor_name,
            invoiceNumber: entry.invoice_number,
            totalCost: entry.total_cost ? parseFloat(entry.total_cost) : null,
            notes: entry.notes,
            confidenceLevel: entry.confidence_level,
            verificationStatus: entry.verification_status,
            verifiedByUserId: entry.verified_by_user_id,
            verifiedAt: entry.verified_at,
            createdAt: entry.created_at,
            updatedAt: entry.updated_at,
        };
    }
}