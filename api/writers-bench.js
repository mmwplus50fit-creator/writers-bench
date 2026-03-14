export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const {
      mode,
      dayNumber,
      prompt,
      writing,
      minWords,
      maxWords
    } = req.body || {};

    if (!mode) {
      return res.status(400).json({ error: "Missing mode" });
    }

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: "Missing OPENAI_API_KEY on server" });
    }

    const model = process.env.OPENAI_MODEL || "gpt-5";

    let systemPrompt = "";
    let userPrompt = "";
    let schema = null;

    if (mode === "prompt") {
      systemPrompt = `
You are Writer's Bench, a private daily writing coach.
Create one deliberate-practice writing session.
Avoid random novelty for its own sake.
Keep the session concise, clear, and useful.
Return only valid JSON that matches the schema exactly. Do not include markdown, code fences, or explanatory text.
`.trim();

      userPrompt = `
Generate Day ${dayNumber || 1} of writing practice.

Requirements:
- Keep it to a 10-minute exercise.
- Focus on craft improvement through deliberate practice.
- Return exactly these fields:
  1. title
  2. prompt
  3. constraint
  4. time_target
  5. suggested_word_count_range
  6. what_to_submit
`.trim();

      schema = {
        type: "object",
        additionalProperties: false,
        properties: {
          title: { type: "string" },
          prompt: { type: "string" },
          constraint: { type: "string" },
          time_target: { type: "string" },
          suggested_word_count_range: { type: "string" },
          what_to_submit: { type: "string" }
        },
        required: [
          "title",
          "prompt",
          "constraint",
          "time_target",
          "suggested_word_count_range",
          "what_to_submit"
        ]
      };
    } else if (mode === "feedback") {
      systemPrompt = `
You are Writer's Bench, a calm, encouraging, honest writing coach.
Give brief, concrete craft feedback.
Do not be gushy.
Do not be cruel.
Return only valid JSON that matches the schema exactly. Do not include markdown, code fences, or explanatory text.
`.trim();

      userPrompt = `
This is Day ${dayNumber || 1} of my writing practice.

Prompt:
${prompt || "[No prompt provided]"}

Suggested word count range:
${minWords || ""}${maxWords ? "–" + maxWords : ""}

Submission:
${writing || "[No writing provided]"}

Return exactly these fields:
1. what_is_working
2. best_line_image_or_moment
3. what_feels_weak_vague_flat_or_overexplained
4. one_concrete_craft_note_for_next_time
5. optional_revision_challenge
`.trim();

      schema = {
        type: "object",
        additionalProperties: false,
        properties: {
          what_is_working: { type: "string" },
          best_line_image_or_moment: { type: "string" },
          what_feels_weak_vague_flat_or_overexplained: { type: "string" },
          one_concrete_craft_note_for_next_time: { type: "string" },
          optional_revision_challenge: { type: "string" }
        },
        required: [
          "what_is_working",
          "best_line_image_or_moment",
          "what_feels_weak_vague_flat_or_overexplained",
          "one_concrete_craft_note_for_next_time",
          "optional_revision_challenge"
        ]
      };
    } else {
      return res.status(400).json({ error: "Invalid mode" });
    }

    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model,
        input: [
          {
            role: "system",
            content: systemPrompt
          },
          {
            role: "user",
            content: userPrompt
          }
        ],
        text: {
          format: {
            type: "json_schema",
            name: "writers_bench_output",
            schema
          }
        }
      })
    });

    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json({
        error: data?.error?.message || "OpenAI request failed",
        raw: data
      });
    }

    let parsed = null;

try {
  if (typeof data.output_text === "string" && data.output_text.trim()) {
    parsed = JSON.parse(data.output_text);
  } else {
    const textParts = [];

    for (const item of data.output || []) {
      for (const content of item.content || []) {
        if (content.type === "output_text" && typeof content.text === "string") {
          textParts.push(content.text);
        }
      }
    }

    const combined = textParts.join("").trim();

    if (!combined) {
      return res.status(500).json({
        error: "No JSON text returned by model",
        raw: data
      });
    }

    parsed = JSON.parse(combined);
  }
} catch (err) {
  return res.status(500).json({
    error: "Could not parse model JSON output",
    detail: err.message,
    raw_text: data.output_text || null
  });
}

    return res.status(200).json(parsed);
  } catch (err) {
    return res.status(500).json({
      error: err.message || "Unknown server error"
    });
  }
}
