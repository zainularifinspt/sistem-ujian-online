export async function evaluateShortAnswerWithAI(
  prompt: string,
  answerKey: string,
  studentAnswer: string
): Promise<boolean> {
  const apiKey = process.env.GROK_API_KEY;
  if (!apiKey) {
    // Fallback to exact match if API key is not configured
    return studentAnswer.trim().toLowerCase() === answerKey.trim().toLowerCase();
  }

  const systemMessage = `Anda adalah asisten penilai ujian otomatis. Anda akan diberikan Soal, Kunci Jawaban, dan Jawaban Peserta.
Tugas Anda adalah menentukan apakah Jawaban Peserta BENAR atau SALAH berdasarkan Kunci Jawaban.
Jawaban Peserta dianggap BENAR jika memiliki makna yang sama, merupakan sinonim, atau merupakan variasi penulisan yang sah dari Kunci Jawaban, meskipun kata-katanya tidak persis sama.
Jawab HANYA dengan kata "CORRECT" jika benar, atau "INCORRECT" jika salah. Jangan berikan penjelasan tambahan apapun.`;

  const userMessage = `Soal: ${prompt}\nKunci Jawaban: ${answerKey}\nJawaban Peserta: ${studentAnswer}`;

  try {
    const response = await fetch("https://api.x.ai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: "grok-2-latest",
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
      return studentAnswer.trim().toLowerCase() === answerKey.trim().toLowerCase();
    }

    const data = await response.json();
    const resultText = data.choices?.[0]?.message?.content?.trim().toUpperCase() || "";
    
    // Explicitly check if it returned CORRECT
    return resultText.includes("CORRECT") && !resultText.includes("INCORRECT");
  } catch (error) {
    console.error("Failed to evaluate with AI:", error);
    return studentAnswer.trim().toLowerCase() === answerKey.trim().toLowerCase();
  }
}
