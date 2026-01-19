import { IsIn, IsNotEmpty, IsOptional, IsString, IsUUID } from 'class-validator';

export class ProcessDocumentDto {
    @IsString()
    @IsNotEmpty()
    @IsIn(['electricity', 'water', 'fuel', 'natural_gas', 'diesel'])
    category: string;

    @IsUUID()
    @IsOptional()
    facilityId?: string;

    @IsString()
    @IsOptional()
    notes?: string;
}