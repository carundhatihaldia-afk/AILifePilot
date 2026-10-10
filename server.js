require("dotenv").config();

const express = require("express");
const path = require("path");

const app = express();

app.use(express.json({ limit: "20kb" }));

// Serve the website from the main project folder
app.use(express.static(__dirname));

// Health-check endpoint
app.get("/api/health", (req, res) => {
  res.json({
    status: "ok",
    app: "LifePilot AI"
  });
});

// Generate a personalized action plan
app.post("/api/plan", async (req, res) => {
  try {
    const { category, problem } = req.body || {};

    if (
      !category ||
      typeof category !== "string" ||
      !problem ||
      typeof problem !== "string" ||
      !problem.trim() ||
      problem.length > 3000
    ) {
      return res.status(400).json({
        error:
          "Choose a category and describe your problem (up to 3000 characters)."
      });
    }

    // Read the Gemini API key from .env
    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
      return res.status(503).json({
        error: "Gemini API key is not configured on the server."
      });
    }

    const prompt = `
You are LifePilot AI, a practical everyday action-planning assistant.

Category: ${category}
User's problem: ${problem}

Create a realistic, supportive plan with 3 to 8 small, ordered tasks.
Each task must have:
- A short title
- An actionable description
- An estimated duration in minutes
- A priority: High, Medium, or Low

Return ONLY valid JSON in this format:
{
  "title": "Short plan title",
  "encouragement": "One encouraging sentence",
  "tasks": [
    {
      "title": "Task title",
      "description": "What to do",
      "minutes": 15,
      "priority": "High"
    }
  ]
}

Do not promise guaranteed results. For health, legal, financial,
or other high-stakes problems, keep advice appropriately cautious.
`;

    // Updated Gemini model
    const response = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": apiKey
        },
        body: JSON.stringify({
          contents: [
            {
              parts: [{ text: prompt }]
            }
          ],
          generationConfig: {
            responseMimeType: "application/json"
          }
        })
      }
    );

    const data = await response.json();

    if (!response.ok) {
      console.error("Gemini API error:", data);

      return res.status(502).json({
        error:
          data.error?.message ||
          `Gemini API error: ${response.status}`,
        code: data.error?.code || response.status
      });
    }

    const generatedText = data.candidates?.[0]?.content?.parts
      ?.map((part) => part.text || "")
      .join("");

    if (!generatedText) {
      return res.status(502).json({
        error: "Gemini returned an empty response. Please try again."
      });
    }

    const plan = JSON.parse(generatedText);

    if (
      !Array.isArray(plan.tasks) ||
      plan.tasks.length < 3 ||
      plan.tasks.length > 8
    ) {
      throw new Error("Invalid plan format");
    }

    plan.title = String(
      plan.title || "Your Action Plan"
    ).slice(0, 150);

    plan.encouragement = String(
      plan.encouragement || "Take one step at a time."
    ).slice(0, 300);

    plan.tasks = plan.tasks.map((task) => ({
      title: String(
        task.title || "Untitled task"
      ).slice(0, 150),

      description: String(
        task.description || ""
      ).slice(0, 500),

      minutes: Math.min(
        1440,
        Math.max(1, Number(task.minutes) || 15)
      ),

      priority: ["High", "Medium", "Low"].includes(task.priority)
        ? task.priority
        : "Medium"
    }));

    return res.json(plan);

  } catch (error) {
    console.error("Plan generation failed:", error.message);

    return res.status(502).json({
      error:
        "Unable to create the plan right now. Please try again."
    });
  }
});

// Start the server
const PORT = process.env.PORT || 3000;

app.listen(PORT, "0.0.0.0", () => {
  console.log(`LifePilot AI running on port ${PORT}`);
});