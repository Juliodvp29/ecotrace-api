import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { FacilitiesController } from './facilities.controller';
import { FacilitiesService } from './facilities.service';

@Module({
    imports: [AuthModule],
    controllers: [FacilitiesController],
    providers: [FacilitiesService],
    exports: [FacilitiesService],
})
export class FacilitiesModule { }