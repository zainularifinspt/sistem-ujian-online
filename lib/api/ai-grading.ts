import { answersMatchExactly } from "@/lib/math-answer";

export async function evaluateShortAnswerWithAI(
  prompt: string,
  answerKey: string,
  studentAnswer: string
): Promise<boolean> {
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

  try {
    const isGroq = apiKey.startsWith("gsk_");
    const apiUrl = isGroq 
      ? "https://api.groq.com/openai/v1/chat/completions" 
      : "https://api.x.ai/v1/chat/completions";
    const model = isGroq 
      ? "llama-3.3-70b-versatile" 
      : "grok-2-latest";

    const response = await fetch(apiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: model,
        messages: [
          { role: "system", content: systemMessage },
          { role: "user", content: userMessage }
        ],
        temperature: 0,
        max_tokens: 10
      })
    });

    if (!response.ok) {
      console.error("GROK API error:", await response.text());
      return answersMatchExactly(answerKey, studentAnswer);
    }

    const data = await response.json();
    const resultText = data.choices?.[0]?.message?.content?.trim().toUpperCase() || "";
    
    // Explicitly check if it returned CORRECT
    return resultText.includes("CORRECT") && !resultText.includes("INCORRECT");
  } catch (error) {
    console.error("Failed to evaluate with AI:", error);
    return answersMatchExactly(answerKey, studentAnswer);
  }
}
