import { GoogleGenerativeAI } from '@google/generative-ai';
import type { Part } from '@google/generative-ai';

export interface CarrierEvent {
  code: string;
  description: string;
}

export interface MappedEvent extends CarrierEvent {
  internalEvent: string;
  internalReturnEvent: string;
  confidence: 'high' | 'medium' | 'low';
}

export async function parseCarrierPdf(
  apiKey: string,
  pdfBase64: string,
  codeFormat: 'concat' | 'single' | 'custom',
  internalEvents: string[]
): Promise<MappedEvent[]> {
  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: 'gemini-flash-latest' });

  const prompt = `
You are an expert logistics data parser. I am providing you with a PDF document from a carrier containing their tracking event codes.
Your task is to extract all the event codes and their descriptions, and then map them to our internal event codes.

Configuration:
- Code Format: ${codeFormat === 'concat' ? 'Concatenate Code 1 and Code 2 into a single string (e.g., if Code1 is AAR and Code2 is CFM, the final code is AARCFM)' : 'Use the single event code provided'}.
- Internal Events Available:
${internalEvents.join(', ')}

Please extract every unique tracking event from the PDF.
For each event, provide:
1. The extracted "code" (formatted according to the Configuration).
2. The extracted "description" (in English if available, otherwise in the original language).
3. The most appropriate "internalEvent" from the list of Internal Events Available. Match based on the meaning of the description. If none fit perfectly, use INCIDENT_OTHER or leave it blank.
4. The "internalReturnEvent". In most cases, this is exactly the same as the "internalEvent".
5. A "confidence" score for your mapping: 'high', 'medium', or 'low'.

Return the result STRICTLY as a JSON array of objects with the following schema:
[
  {
    "code": "AARCFM",
    "description": "Received compliant on Agency",
    "internalEvent": "IN_TRANSIT_AT_DEPOT",
    "internalReturnEvent": "IN_TRANSIT_AT_DEPOT",
    "confidence": "high"
  }
]
Do not include any markdown formatting like \`\`\`json in your response. Just return the raw JSON array.
`;

  const pdfPart: Part = {
    inlineData: {
      data: pdfBase64,
      mimeType: 'application/pdf',
    },
  };

  try {
    const result = await model.generateContent([prompt, pdfPart]);
    const responseText = result.response.text().trim();
    
    // Clean up potential markdown blocks if the model still includes them
    let jsonString = responseText;
    if (jsonString.startsWith('\`\`\`json')) {
      jsonString = jsonString.replace(/^\`\`\`json\n?/, '').replace(/\n?\`\`\`$/, '');
    } else if (jsonString.startsWith('\`\`\`')) {
      jsonString = jsonString.replace(/^\`\`\`\n?/, '').replace(/\n?\`\`\`$/, '');
    }

    const parsed = JSON.parse(jsonString);
    return parsed as MappedEvent[];
  } catch (error) {
    console.error('Error parsing PDF with Gemini:', error);
    throw error;
  }
}
