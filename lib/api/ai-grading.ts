import { answersMatchExactly } from "@/lib/math-answer";

const SYSTEM_MESSAGE = `Anda adalah asisten penilai ujian otomatis. Anda akan diberikan Soal, Kunci Jawaban, dan Jawaban Peserta.
Tugas Anda adalah menentukan apakah Jawaban Peserta BENAR atau SALAH berdasarkan Kunci Jawaban.
Jawaban Peserta dianggap BENAR jika memiliki makna yang sama, merupakan sinonim, atau merupakan variasi penulisan yang sah dari Kunci Jawaban, meskipun kata-katanya tidak persis sama.
Jawab HANYA dengan kata "CORRECT" jika benar, atau "INCORRECT" jika salah. Jangan berikan penjelasan tambahan apapun.`;

async function evaluateWithGemini(
  apiKey: string,
  prompt: string,
  answerKey: string,
  studentAnswer: string
): Promise<boolean | null> {
  const userMessage = `Soal: ${prompt}\nKunci Jawaban: ${answerKey}\nJawaban Peserta: ${studentAnswer}`;
  const models = ["gemini-2.5-flash", "gemini-2.0-flash", "gemini-1.5-flash"];

  for (const model of models) {
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: AbortSignal.timeout(3500),
        body: JSON.stringify({
          systemInstruction: {
            parts: [{ text: SYSTEM_MESSAGE }]
          },
          contents: [
            {
              role: "user",
              parts: [{ text: userMessage }]
            }
          ],
          generationConfig: {
            temperature: 0,
            maxOutputTokens: 50
          }
        })
      });

      if (!res.ok) {
        console.warn(`Gemini model ${model} returned ${res.status}:`, await res.text());
        continue;
      }

      const data = await res.json();
      const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
      const cleaned = rawText.trim().toUpperCase();

      if (cleaned.includes("CORRECT") && !cleaned.includes("INCORRECT")) {
        return true;
      }
      if (cleaned.includes("INCORRECT")) {
        return false;
      }
    } catch (err) {
      console.error(`Gemini API error (${model}):`, err);
    }
  }

  return null;
}

export async function evaluateShortAnswerWithAI(
  prompt: string,
  answerKey: string,
  studentAnswer: string
): Promise<boolean> {
  // Fast path: if the answers match directly (including math normalization), no API call is needed
  if (answersMatchExactly(answerKey, studentAnswer)) {
    return true;
  }

  // 1. Try Google Gemini API first if configured
  const geminiApiKey =
    process.env.GEMINI_API_KEY ||
    process.env.GOOGLE_API_KEY ||
    process.env.GOOGLE_GENAI_API_KEY;

  if (geminiApiKey) {
    const geminiResult = await evaluateWithGemini(
      geminiApiKey,
      prompt,
      answerKey,
      studentAnswer
    );
    if (geminiResult !== null) {
      return geminiResult;
    }
  }

  // 2. Fallback to Groq / xAI if configured
  const fallbackApiKey = process.env.GROQ_API_KEY || process.env.GROK_API_KEY;
  if (!fallbackApiKey) {
    // Fallback to exact match if no API keys are configured
    return answersMatchExactly(answerKey, studentAnswer);
  }

  const userMessage = `Soal: ${prompt}\nKunci Jawaban: ${answerKey}\nJawaban Peserta: ${studentAnswer}`;
  const isGroq = fallbackApiKey.startsWith("gsk_");
  const apiUrl = isGroq
    ? "https://api.groq.com/openai/v1/chat/completions"
    : "https://api.x.ai/v1/chat/completions";

  const modelsToTry = isGroq
    ? ["openai/gpt-oss-120b", "openai/gpt-oss-20b", "groq/compound"]
    : ["grok-2-latest"];

  for (const model of modelsToTry) {
    try {
      let res = await fetch(apiUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${fallbackApiKey}`
        },
        signal: AbortSignal.timeout(3500),
        body: JSON.stringify({
          model,
          messages: [
            { role: "system", content: SYSTEM_MESSAGE },
            { role: "user", content: userMessage }
          ],
          temperature: 0,
          max_tokens: 200
        })
      });

      if (res.status === 429) {
        console.warn(`AI model ${model} rate limited (429). Retrying after 1500ms...`);
        await new Promise((resolve) => setTimeout(resolve, 1500));
        res = await fetch(apiUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${fallbackApiKey}`
          },
          signal: AbortSignal.timeout(3500),
          body: JSON.stringify({
            model,
            messages: [
              { role: "system", content: SYSTEM_MESSAGE },
              { role: "user", content: userMessage }
            ],
            temperature: 0,
            max_tokens: 200
          })
        });
      }

      if (!res.ok) {
        console.warn(`AI model ${model} returned ${res.status}:`, await res.text());
        continue;
      }

      const data = await res.json();
      const rawContent = data.choices?.[0]?.message?.content || "";
      const cleaned = rawContent.replace(/<think>[\s\S]*?<\/think>/gi, "").trim().toUpperCase();

      if (cleaned.includes("CORRECT") && !cleaned.includes("INCORRECT")) {
        return true;
      }
      if (cleaned.includes("INCORRECT")) {
        return false;
      }
    } catch (error) {
      console.error(`Failed to evaluate with AI model ${model}:`, error);
    }
  }

  // Fallback to exact match if all models fail
  return answersMatchExactly(answerKey, studentAnswer);
}
