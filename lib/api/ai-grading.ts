import { answersMatchExactly } from "@/lib/math-answer";

export async function evaluateShortAnswerWithAI(
  prompt: string,
  answerKey: string,
  studentAnswer: string
): Promise<boolean> {
  // Fast path: if the answers match directly (including math normalization), no API call is needed
  if (answersMatchExactly(answerKey, studentAnswer)) {
    return true;
  }

  const apiKey = process.env.GROQ_API_KEY || process.env.GROK_API_KEY;
  if (!apiKey) {
    // Fallback to exact match if API key is not configured
    return answersMatchExactly(answerKey, studentAnswer);
  }

  const systemMessage = `Anda adalah asisten penilai ujian otomatis. Anda akan diberikan Soal, Kunci Jawaban, dan Jawaban Peserta.
Tugas Anda adalah menentukan apakah Jawaban Peserta BENAR atau SALAH berdasarkan Kunci Jawaban.
Jawaban Peserta dianggap BENAR jika memiliki makna yang sama, merupakan sinonim, atau merupakan variasi penulisan yang sah dari Kunci Jawaban, meskipun kata-katanya tidak persis sama.
Jawab HANYA dengan kata "CORRECT" jika benar, atau "INCORRECT" jika salah. Jangan berikan penjelasan tambahan apapun.`;

  const userMessage = `Soal: ${prompt}\nKunci Jawaban: ${answerKey}\nJawaban Peserta: ${studentAnswer}`;

  const isGroq = apiKey.startsWith("gsk_");
  const apiUrl = isGroq
    ? "https://api.groq.com/openai/v1/chat/completions"
    : "https://api.x.ai/v1/chat/completions";

  // Priority models list for Groq
  const modelsToTry = isGroq
    ? ["openai/gpt-oss-120b", "openai/gpt-oss-20b", "groq/compound"]
    : ["grok-2-latest"];

  for (const model of modelsToTry) {
    try {
      let res = await fetch(apiUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: "system", content: systemMessage },
            { role: "user", content: userMessage }
          ],
          temperature: 0,
          max_tokens: 200
        })
      });

      // Handle rate limit (429) with a short pause and retry
      if (res.status === 429) {
        console.warn(`AI model ${model} rate limited (429). Retrying after 1500ms...`);
        await new Promise((resolve) => setTimeout(resolve, 1500));
        res = await fetch(apiUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`
          },
          body: JSON.stringify({
            model,
            messages: [
              { role: "system", content: systemMessage },
              { role: "user", content: userMessage }
            ],
            temperature: 0,
            max_tokens: 200
          })
        });
      }

      if (!res.ok) {
        console.warn(`AI model ${model} returned ${res.status}:`, await res.text());
        continue; // Try next fallback model
      }

      const data = await res.json();
      const rawContent = data.choices?.[0]?.message?.content || "";
      // Strip any <think>...</think> reasoning tags if present
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
