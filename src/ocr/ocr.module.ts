// src/ocr/ocr.module.ts
import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MockOcrService } from './mock-ocr.service';
import { OcrService } from './ocr.service';

@Global()
@Module({
    providers: [
        OcrService,
        MockOcrService,
        {
            provide: 'OCR_SERVICE',
            useFactory: (
                configService: ConfigService,
                ocrService: OcrService,
                mockOcrService: MockOcrService,
            ) => {
                // Use mock service if MOCK_OCR is enabled in .env
                const useMock = configService.get<string>('MOCK_OCR') === 'true';
                return useMock ? mockOcrService : ocrService;
            },
            inject: [ConfigService, OcrService, MockOcrService],
        },
    ],
    exports: ['OCR_SERVICE'],
})
export class OcrModule { }