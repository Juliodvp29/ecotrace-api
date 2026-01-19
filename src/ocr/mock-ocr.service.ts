import { Injectable } from '@nestjs/common';
import { OcrResult } from './ocr.service';

@Injectable()
export class MockOcrService {
    /**
     * Mock OCR processing - returns simulated data without calling Claude API
     * Perfect for testing without incurring API costs
     */
    async processDocument(
        fileBuffer: Buffer,
        mimeType: string,
        category: string
    ): Promise<OcrResult> {
        // Simulate processing delay
        await this.delay(1500);

        // Return mock data based on category
        return this.getMockDataByCategory(category);
    }

    private getMockDataByCategory(category: string): OcrResult {
        const mockData = {
            electricity: {
                vendor: 'Green Energy Corp',
                date: new Date().toISOString().split('T')[0],
                consumption: 450,
                unit: 'kWh',
                totalCost: 120.50,
                currency: 'USD',
                notes: 'Quarterly sustainability check required.',
                confidence: 'high' as const,
            },
            water: {
                vendor: 'AquaServe Municipal',
                date: new Date().toISOString().split('T')[0],
                consumption: 35.4,
                unit: 'm³',
                totalCost: 45.30,
                currency: 'USD',
                notes: 'Normal consumption for the period.',
                confidence: 'high' as const,
            },
            fuel: {
                vendor: 'Shell Gas Station',
                date: new Date().toISOString().split('T')[0],
                consumption: 85.5,
                unit: 'liters',
                totalCost: 95.75,
                currency: 'USD',
                notes: 'Regular diesel fuel.',
                confidence: 'medium' as const,
            },
        };

        return mockData[category] || mockData.electricity;
    }

    private delay(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}