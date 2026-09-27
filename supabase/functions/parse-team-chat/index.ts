import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*", // tighten to myclubhouse.org once this is working
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const TEAM_CHAT_PROMPT = `You are reading a chunk of a WhatsApp export from a football team's group chat.
The chunk runs from one fixture announcement up to just before the next one, so it should cover
exactly one game: the squad announcement, banter, live commentary, and the result, whatever mix
of those this particular chunk actually has.

You may reason through what you see first. Once you've worked out the values, respond with the
JSON object as the last thing in your response, with no other text after it.

Shape:
{
  "date": string or null,           // the fixture date, as "YYYY-MM-DD" if you can work it out from the message timestamps or an explicit date mentioned
  "opponent": string or null,
  "status": string or null,         // "played", "postponed", "cancelled", or "abandoned" — if the game was played, use "played" even if the score is unclear
  "isHome": boolean or null,
  "venue": string or null,
  "kit": string or null,
  "goalsFor": number or null,       // the team's own goals (the team is always referred to as "Grey" or "Grey College")
  "goalsAgainst": number or null,
  "squad": [string],                // names as announced in the squad/availability post, copied exactly as written — do not normalize or guess full names
  "goalEvents": [
    { "scorer": string, "assist": string, "ownGoal": boolean or null }   // one entry per goal, in the order scored, names copied exactly as written, goalscorer should be null if it was an own goal, assist should be null if there was no assist
  ],
  "motm": string or null,           // name copied exactly as written
  "dotd": string or null,           // name copied exactly as written
  "notes": string or null           // anything uncertain, contradictory, or worth a human double-checking (e.g. the game was postponed, the score was corrected later, two different scorelines were mentioned)
}

Rules:
- Copy every name exactly as it appears in the chat (e.g. "Luff", "Shep", "Jake Luff" are all valid as written — do not try to resolve them to a single canonical name, that happens later by a human).
- If a value isn't clearly stated anywhere in the chunk, use null (or [] for squad/goalEvents). Do NOT guess or infer beyond what's written.
- Live commentary often updates the score goal-by-goal (e.g. "68' GOAL GREY 4-0 Welsh") — use the last/highest score mentioned as the final score, and use "notes" to flag it if the final score is ambiguous.
- If the game appears to have been postponed, cancelled, or abandoned, say so in "notes" and leave goalsFor/goalsAgainst null.
- End your response with the JSON object, and nothing after it.`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing auth header" }), {
        status: 401,
        headers: { ...corsHeaders, "content-type": "application/json" },
      });
    }

    // Verify the caller is a real signed-in user (not just anyone with the anon key)
    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "content-type": "application/json" },
      });
    }

    const { transcriptChunk } = await req.json();
    if (!transcriptChunk) {
      return new Response(JSON.stringify({ error: "No transcript chunk provided" }), {
        status: 400,
        headers: { ...corsHeaders, "content-type": "application/json" },
      });
    }

    const anthropicRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 2000,
        messages: [{
          role: "user",
          content: [
            { type: "text", text: TEAM_CHAT_PROMPT + "\n\n--- CHAT CHUNK ---\n\n" + transcriptChunk },
          ],
        }],
      }),
    });

    if (!anthropicRes.ok) {
      const errText = await anthropicRes.text();
      console.error("Anthropic API error:", errText);
      return new Response(JSON.stringify({ error: "Extraction request failed" }), {
        status: 502,
        headers: { ...corsHeaders, "content-type": "application/json" },
      });
    }

    const data = await anthropicRes.json();
    const textBlock = data.content?.find((b: any) => b.type === "text");
    const raw = textBlock?.text ?? "{}";
    const firstBrace = raw.indexOf("{");
    const lastBrace = raw.lastIndexOf("}");
    const cleaned = firstBrace !== -1 && lastBrace !== -1
      ? raw.slice(firstBrace, lastBrace + 1)
      : raw.replace(/```json|```/g, "").trim();

    let parsed;
    try {
      parsed = JSON.parse(cleaned);
    } catch (e) {
      console.error("Failed to parse model output as JSON:", cleaned);
      return new Response(JSON.stringify({ error: "Could not parse this chunk — check it manually" }), {
        status: 502,
        headers: { ...corsHeaders, "content-type": "application/json" },
      });
    }

    return new Response(JSON.stringify(parsed), {
      headers: { ...corsHeaders, "content-type": "application/json" },
    });
  } catch (err) {
    console.error("Unhandled error in parse-team-chat:", err);
    return new Response(JSON.stringify({ error: "Unexpected server error" }), {
      status: 500,
      headers: { ...corsHeaders, "content-type": "application/json" },
    });
  }
});