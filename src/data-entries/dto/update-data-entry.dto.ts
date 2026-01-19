import { IsDateString, IsIn, IsNumber, IsOptional, IsString, IsUUID, Min } from 'class-validator';

export class UpdateDataEntryDto {
    @IsUUID()
    @IsOptional()
    facilityId?: string;

    @IsUUID()
    @IsOptional()
    categoryId?: string;

    @IsDateString()
    @IsOptional()
    entryDate?: string;

    @IsNumber()
    @IsOptional()
    @Min(0)
    quantity?: number;

    @IsString()
    @IsOptional()
    unit?: string;

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
    @IsIn(['pending', 'verified', 'action_required'])
    verificationStatus?: string;
}