export async function queryAssistant(req, res) {
  const { message } = req.body;
  if (typeof message !== "string" || !message.trim() || message.length > 500) {
    return res.status(400).json({ error: "message (max 500 chars) is required" });
  }

  let aiResponse;
  try {
    aiResponse = await fetch(`${process.env.AI_SERVICE_URL}/assistant/query`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.AI_SERVICE_TOKEN}`,
      },
      body: JSON.stringify({ message }),
      signal: AbortSignal.timeout(30000),
    });
  } catch (err) {
    if (err.name === "TimeoutError" || err.name === "AbortError") {
      return res.status(504).json({ error: "AI service timed out" });
    }
    throw err;
  }

  if (!aiResponse.ok) {
    return res.status(502).json({ error: "AI service failed to parse the query" });
  }
  res.json(await aiResponse.json());
}
