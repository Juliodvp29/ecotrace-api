import { IsNotEmpty, IsString } from 'class-validator';

export class JoinOrganizationDto {
    @IsString()
    @IsNotEmpty()
    inviteCode: string;
}