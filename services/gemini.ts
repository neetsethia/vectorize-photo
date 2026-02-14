
import { GoogleGenAI, GenerateContentResponse } from "@google/genai";

const getAIClient = () => {
  return new GoogleGenAI({ apiKey: process.env.API_KEY });
};

export const convertToVector = async (
  base64Data: string,
  mimeType: string,
  simplification: number = 0
): Promise<string> => {
  const ai = getAIClient();
  
  const simplificationNote = simplification > 50 
    ? "EXTREMELY IMPORTANT: Keep the SVG extremely minimal. Use as few <path> nodes as possible. Use simple geometric primitives and broad shapes. Do not include fine details."
    : simplification > 20 
    ? "IMPORTANT: Simplify the paths. Avoid overly complex curves with too many points." 
    : "Maintain high precision and detail in the SVG paths.";

  const prompt = `Convert this image into a precise, high-quality SVG graphic. 
  ${simplificationNote}
  Use clean <path>, <circle>, and <rect> elements. Ensure the SVG is optimized, uses clean solid colors or gradients as appropriate, and fills the viewbox correctly. 
  Return ONLY the raw SVG code starting with <svg and ending with </svg>.`;

  const imagePart = {
    inlineData: {
      mimeType: mimeType,
      data: base64Data,
    },
  };

  const textPart = { text: prompt };

  try {
    const response: GenerateContentResponse = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: { parts: [imagePart, textPart] },
      config: {
        temperature: 0.1,
      }
    });

    const text = response.text || '';
    const svgMatch = text.match(/<svg[\s\S]*?<\/svg>/i);
    if (!svgMatch) {
      throw new Error("Failed to extract SVG from AI response.");
    }

    return svgMatch[0];
  } catch (error) {
    console.error("Gemini API Error:", error);
    throw error;
  }
};
