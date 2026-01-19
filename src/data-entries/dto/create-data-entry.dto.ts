import { IsDateString, IsNotEmpty, IsNumber, IsOptional, IsString, IsUUID, Min } from 'class-validator';

export class CreateDataEntryDto {
    @IsUUID()
    @IsOptional()
    facilityId?: string;

    @IsUUID()
    @IsNotEmpty()
    categoryId: string;

    @IsDateString()
    @IsNotEmpty()
    entryDate: string;

    @IsNumber()
    @Min(0)
    quantity: number;

    @IsString()
    @IsNotEmpty()
    unit: string;

    @IsString()
    @IsOptional()
    vendorName?: string;

    @IsString()
    @IsOptional()
    invoiceNumber?: string;

    @IsNumber()
    @IsOptional()
    @Min(0)
    totalCost?: number;

    @IsString()
    @IsOptional()
    notes?: string;

    @IsString()
    @IsOptional()
    documentUrl?: string;

    @IsString()
    @IsOptional()
    documentFilename?: string;
}
