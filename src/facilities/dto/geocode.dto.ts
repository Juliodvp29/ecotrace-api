import { IsNotEmpty, IsString } from 'class-validator';

export class GeocodeDto {
    @IsString()
    @IsNotEmpty()
    address: string;
}