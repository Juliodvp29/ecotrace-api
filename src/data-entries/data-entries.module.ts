import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { FirebaseModule } from '../firebase/firebase.module';
import { OcrModule } from '../ocr/ocr.module';
import { DataEntriesController } from './data-entries.controller';
import { DataEntriesService } from './data-entries.service';

@Module({
    imports: [AuthModule, OcrModule, FirebaseModule],
    controllers: [DataEntriesController],
    providers: [DataEntriesService],
    exports: [DataEntriesService],
})
export class DataEntriesModule { }