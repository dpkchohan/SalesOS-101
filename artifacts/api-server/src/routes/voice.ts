import { Router, type IRouter } from "express";
import multer from "multer";
import { SpeakTextBody } from "@workspace/api-zod";
import { requireAuth } from "../lib/auth";

const router: IRouter = Router();

const SARVAM_KEY = process.env.SARVAM_AI_API;
const OPENAI_KEY = process.env.AI_INTEGRATIONS_OPENAI_API_KEY;
const OPENAI_BASE = process.env.AI_INTEGRATIONS_OPENAI_BASE_URL;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 7 * 1024 * 1024 },
});

router.post(
  "/voice/transcribe",
  requireAuth,
  upload.single("audio"),
  async (req, res): Promise<void> => {
    if (!OPENAI_KEY || !OPENAI_BASE) {
      res.status(500).json({ error: "OpenAI integration is not configured" });
      return;
    }

    const file = req.file;
    if (!file || file.size === 0) {
      res.status(400).json({ error: "No audio received" });
      return;
    }
    if (file.size > 7 * 1024 * 1024) {
      res.status(413).json({ error: "Audio exceeds 7 MB limit" });
      return;
    }

    const mimeType = file.mimetype || "audio/webm";
    const ext = mimeType.includes("wav")
      ? "wav"
      : mimeType.includes("mp3") || mimeType.includes("mpeg")
        ? "mp3"
        : mimeType.includes("ogg")
          ? "ogg"
          : mimeType.includes("mp4") || mimeType.includes("m4a")
            ? "m4a"
            : "webm";

    try {
      const blob = new Blob([file.buffer], { type: mimeType });
      const form = new FormData();
      form.append("file", blob, `audio.${ext}`);
      form.append("model", "gpt-4o-mini-transcribe");

      const body = req.body as { language?: string };
      if (body.language && body.language !== "unknown") {
        const lang = body.language.split("-")[0];
        if (lang) form.append("language", lang);
      }

      const resp = await fetch(`${OPENAI_BASE}/audio/transcriptions`, {
        method: "POST",
        headers: { Authorization: `Bearer ${OPENAI_KEY}` },
        body: form,
      });
      if (!resp.ok) {
        const errText = await resp.text();
        req.log.error({ status: resp.status, errText }, "OpenAI STT failed");
        res.status(502).json({ error: "Transcription failed" });
        return;
      }
      const json = (await resp.json()) as { text?: string; language?: string };
      res.json({ text: json.text ?? "", languageCode: json.language ?? null });
    } catch (err) {
      req.log.error({ err }, "Transcribe error");
      res.status(500).json({ error: "Transcribe failed" });
    }
  },
);

router.post("/voice/speak", requireAuth, async (req, res): Promise<void> => {
  const body = SpeakTextBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }
  if (!SARVAM_KEY) {
    res.status(500).json({ error: "SARVAM_AI_API is not configured" });
    return;
  }
  try {
    const resp = await fetch("https://api.sarvam.ai/text-to-speech", {
      method: "POST",
      headers: {
        "api-subscription-key": SARVAM_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        text: body.data.text.slice(0, 1500),
        target_language_code: body.data.languageCode,
        speaker: body.data.speaker,
        model: "bulbul:v2",
      }),
    });
    if (!resp.ok) {
      const errText = await resp.text();
      req.log.error({ status: resp.status, errText }, "Sarvam TTS failed");
      res.status(502).json({ error: "Speech synthesis failed" });
      return;
    }
    const json = (await resp.json()) as { audios?: string[] };
    const audio = json.audios?.[0] ?? "";
    res.json({ audioBase64: audio, mimeType: "audio/wav" });
  } catch (err) {
    req.log.error({ err }, "Speak error");
    res.status(500).json({ error: "Speak failed" });
  }
});

export default router;
