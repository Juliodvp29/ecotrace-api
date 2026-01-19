import Anthropic from '@anthropic-ai/sdk';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MockOcrService } from './mock-ocr.service';

export interface OcrResult {
    vendor: string;
    date: string;
    consumption: number;
    unit: string;
    totalCost: number;
    currency: string;
    notes?: string;
    confidence: 'high' | 'medium' | 'low';
    rawText?: string;
}

@Injectable()
export class OcrService {
    private anthropic: Anthropic;
    private useMock: boolean;
    private mockOcrService: MockOcrService;

    constructor(private readonly configService: ConfigService) {
        const apiKey = this.configService.get<string>('ANTHROPIC_API_KEY');
        this.useMock = this.configService.get<boolean>('MOCK_OCR') || false;

        if (!this.useMock && apiKey) {
            this.anthropic = new Anthropic({ apiKey });
        } else {
            this.mockOcrService = new MockOcrService();
        }
    }

    /**
     * Process document using Claude Vision API
     * @param fileBuffer - Document file buffer
     * @param mimeType - MIME type of the document
     * @param category - Expected category (electricity, water, fuel)
     * @returns Extracted data from the document
     */
    async processDocument(
        fileBuffer: Buffer,
        mimeType: string,
        category: string
    ): Promise<OcrResult> {
        if (this.useMock) {
            return this.mockOcrService.processDocument(fileBuffer, mimeType, category);
        }

        const base64Data = fileBuffer.toString('base64');

        const systemPrompt = this.buildSystemPrompt(category);

        const message = await this.anthropic.messages.create({
            model: this.configService.get<string>('CLAUDE_MODEL') || 'claude-3-5-sonnet-20241022',
            max_tokens: this.configService.get<number>('CLAUDE_MAX_TOKENS') || 1024,
            messages: [
                {
                    role: 'user',
                    content: [
                        {
                            type: 'image',
                            source: {
                                type: 'base64',
                                media_type: mimeType as any,
                                data: base64Data,
                            },
                        },
                        {
                            type: 'text',
                            text: systemPrompt,
                        },
                    ],
                },
            ],
        });

        const responseText = message.content[0].type === 'text'
            ? message.content[0].text
            : '';

        return this.parseClaudeResponse(responseText, category);
    }

    private buildSystemPrompt(category: string): string {
        const categoryInfo = {
            electricity: {
                name: 'factura de electricidad',
                units: 'kWh (kilowatt-hora)',
                fields: 'consumo en kWh, nombre del proveedor, fecha de factura',
            },
            water: {
                name: 'factura de agua',
                units: 'm³ (metros cúbicos) o litros',
                fields: 'consumo en m³ o litros, nombre del proveedor, fecha de factura',
            },
            fuel: {
                name: 'recibo de combustible',
                units: 'litros o galones',
                fields: 'cantidad en litros/galones, tipo de combustible, fecha de compra',
            },
        };

        const info = categoryInfo[category] || categoryInfo.electricity;

        return `Analiza esta ${info.name} y extrae la siguiente información en formato JSON:

{
  "vendor": "Nombre del proveedor/empresa",
  "date": "Fecha en formato YYYY-MM-DD",
  "consumption": número del consumo,
  "unit": "${info.units}",
  "totalCost": monto total a pagar (solo número),
  "currency": "USD, EUR, MXN, COP, etc.",
  "notes": "Cualquier nota relevante o advertencia",
  "confidence": "high, medium o low (según tu confianza en la extracción)"
}

IMPORTANTE:
- Extrae SOLO los ${info.fields}
- El campo "consumption" debe ser un número (sin unidades)
- El campo "totalCost" debe ser un número (sin símbolos de moneda)
- Si algún dato no está claro, márcalo con confidence "low"
- Si la imagen no es una factura válida, marca confidence como "low" y explica en notes

Responde SOLO con el JSON, sin texto adicional.`;
    }

    private parseClaudeResponse(response: string, category: string): OcrResult {
        try {
            // Clean response - remove markdown code blocks if present
            let cleanResponse = response.trim();
            if (cleanResponse.startsWith('```json')) {
                cleanResponse = cleanResponse.replace(/```json\n?/g, '').replace(/```\n?$/g, '');
            } else if (cleanResponse.startsWith('```')) {
                cleanResponse = cleanResponse.replace(/```\n?/g, '');
            }

            const parsed = JSON.parse(cleanResponse);

            return {
                vendor: parsed.vendor || 'Unknown',
                date: parsed.date || new Date().toISOString().split('T')[0],
                consumption: parseFloat(parsed.consumption) || 0,
                unit: parsed.unit || this.getDefaultUnit(category),
                totalCost: parseFloat(parsed.totalCost) || 0,
                currency: parsed.currency || 'USD',
                notes: parsed.notes,
                confidence: parsed.confidence || 'medium',
                rawText: response,
            };
        } catch (error) {
            // If parsing fails, return low confidence result
            return {
                vendor: 'Unknown',
                date: new Date().toISOString().split('T')[0],
                consumption: 0,
                unit: this.getDefaultUnit(category),
                totalCost: 0,
                currency: 'USD',
                notes: 'Error al procesar el documento. Por favor revise manualmente.',
                confidence: 'low',
                rawText: response,
            };
        }
    }

    private getDefaultUnit(category: string): string {
        const units = {
            electricity: 'kWh',
            water: 'm³',
            fuel: 'liters',
        };
        return units[category] || 'units';
    }
}