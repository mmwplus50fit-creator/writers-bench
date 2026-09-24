const MAX_TEXT = 24000;

function schema(properties) {
  return { type: "object", additionalProperties: false, properties,
    required: Object.keys(properties) };
}
const str = { type: "string" };

function requestFor(body) {
  const { mode, dayNumber, prompt, writing, minWords, maxWords, format, exercise } = body;
  if (mode === "prompt") return {
    system: "You are Writer's Bench, a precise private writing coach. Return only schema-valid JSON.",
    user: `Create Day ${Number(dayNumber) || 1} of a 30-day sequence. Ten minutes. Third-person objective by default. Develop visceral, visual storytelling using observable behavior, cause and effect, purposeful sensory detail, subtext, spatial control, precise sentences, and effective endings. Revisit prior skills while advancing one skill. Craft reminder: Actor → Action → Drill down on the action → Next action. Do not claim knowledge of earlier submissions. Return the six requested fields.`,
    output: schema({ title:str, prompt:str, constraint:str, time_target:str, suggested_word_count_range:str, what_to_submit:str })
  };
  if (mode === "feedback") return {
    system: "You are Writer's Bench, a candid, specific writing coach. Assess the unedited submission against its prompt. Cite actual evidence, avoid invented details, and return only schema-valid JSON.",
    user: `Day ${Number(dayNumber)||1}. Prompt:\n${prompt||"(none)"}\nSuggested word range: ${minWords||""}–${maxWords||""}\nSubmission:\n${writing}\nReturn the established five feedback fields. Attend to actor → action → drill down → next action.`,
    output: schema({ what_is_working:str, best_line_image_or_moment:str, what_feels_weak_vague_flat_or_overexplained:str, one_concrete_craft_note_for_next_time:str, optional_revision_challenge:str })
  };
  if (mode === "scene") return {
    system: "You assess scene construction for learning, not as an absolute formula. Cite brief exact excerpts as evidence. Distinguish an intentional quiet or observational scene from an incomplete one. For comics consider panel-readable actions and visual transitions. Return only schema-valid JSON.",
    user: `Format: ${format === "comic" ? "comic script" : "prose"}. Evaluate goal or immediate pressure, opposition, action and reaction, change, spatial and visual clarity, subtext, and ending. Identify one strongest moment, the most consequential revision, and a practical revision exercise. Do not rewrite the scene. Scene:\n${writing}`,
    output: schema({ scene_function:str, what_works:str, evidence:str, construction_gaps:str, spatial_and_visual_clarity:str, strongest_moment:str, priority_revision:str, revision_exercise:str })
  };
  if (mode === "grammar_review") return {
    system: "You are a careful grammar and punctuation tutor. Distinguish required corrections from stylistic options. Preserve the writer's voice and dialect. Semicolons are not mandatory when a period or conjunction is valid. Quote only short relevant excerpts. Return only schema-valid JSON.",
    user: `Review this text. Give up to five specific teachable points, or say plainly if no corrections are needed. Give a corrected version and a short practice prompt. Text:\n${writing}`,
    output: schema({ overview:str, required_corrections:str, optional_choices:str, corrected_text:str, practice_prompt:str })
  };
  if (mode === "grammar_generate") return {
    system: "You are a grammar and punctuation tutor. Return only schema-valid JSON.",
    user: `Generate a short original prose exercise of 2–4 sentences without punctuation or capitalization for the student to repair. Focus: ${exercise||"commas, sentence boundaries, and semicolons"}. Include a clearly punctuated answer and explanation. No copyrighted excerpts.`,
    output: schema({ exercise_text:str, answer:str, explanation:str })
  };
  if (mode === "grammar_grade") return {
    system: "You are a grammar tutor. Accept more than one grammatically sound punctuation solution; explain meaningful differences. Preserve the student's wording. Return only schema-valid JSON.",
    user: `Unpunctuated exercise:\n${exercise}\nStudent answer:\n${writing}\nAssess the punctuation and capitalization. Do not penalize a valid alternative to a model answer.`,
    output: schema({ assessment:str, what_is_correct:str, changes_to_consider:str, one_rule_to_remember:str, possible_answer:str })
  };
  return null;
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({error:"Method not allowed"});
  const body = req.body || {};
  const spec = requestFor(body);
  if (!spec) return res.status(400).json({error:"Invalid mode"});
  for (const key of ["writing", "prompt", "exercise"]) {
    if (body[key] != null && (typeof body[key] !== "string" || body[key].length > MAX_TEXT))
      return res.status(400).json({error:`Invalid or oversized ${key}`});
  }
  if (["feedback","scene","grammar_review","grammar_grade"].includes(body.mode) && !body.writing?.trim())
    return res.status(400).json({error:"Writing is required"});
  if (body.mode === "grammar_grade" && !body.exercise?.trim())
    return res.status(400).json({error:"Generate an exercise first"});
  if (!process.env.OPENAI_API_KEY) return res.status(500).json({error:"Missing OPENAI_API_KEY on server"});
  try {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method:"POST", headers:{"Content-Type":"application/json",Authorization:`Bearer ${process.env.OPENAI_API_KEY}`},
      body:JSON.stringify({model:process.env.OPENAI_MODEL || "gpt-5", input:[{role:"system",content:spec.system},{role:"user",content:spec.user}], text:{format:{type:"json_schema",name:"writers_bench_output",schema:spec.output,strict:true}}})
    });
    const data = await response.json();
    if (!response.ok) return res.status(response.status).json({error:data?.error?.message || "OpenAI request failed"});
    const raw = data.output_text || (data.output||[]).flatMap(item=>(item.content||[]).filter(c=>c.type==="output_text").map(c=>c.text)).join("");
    if (!raw) return res.status(502).json({error:"No response text returned by model"});
    return res.status(200).json(JSON.parse(raw));
  } catch (err) {
    return res.status(502).json({error:err.message || "AI request failed"});
  }
}
