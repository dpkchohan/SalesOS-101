import { Router, type IRouter } from "express";
import { TranscribeAudioBody, SpeakTextBody } from "@workspace/api-zod";
import { requireAuth } from "../lib/auth";

const router: IRouter = Router();

const SARVAM_KEY = process.env.SARVAM_AI_API;

router.post("/voice/transcribe", requireAuth, async (req, res): Promise<void> => {
  const body = TranscribeAudioBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }
  if (!SARVAM_KEY) {
    res.status(500).json({ error: "SARVAM_AI_API is not configured" });
    return;
  }
  try {
    const audioBuffer = Buffer.from(body.data.audioBase64, "base64");
    const mimeType = body.data.mimeType ?? "audio/webm";
    const blob = new Blob([new Uint8Array(audioBuffer)], { type: mimeType });
    const form = new FormData();
    const ext = mimeType.includes("wav")
      ? "wav"
      : mimeType.includes("mp3") || mimeType.includes("mpeg")
        ? "mp3"
        : mimeType.includes("ogg")
          ? "ogg"
          : "webm";
    form.append("file", blob, `audio.${ext}`);
    form.append("model", "saaras:v2");
    if (body.data.languageCode && body.data.languageCode !== "unknown") {
      form.append("language_code", body.data.languageCode);
    }
    const resp = await fetch("https://api.sarvam.ai/speech-to-text-translate", {
      method: "POST",
      headers: { "api-subscription-key": SARVAM_KEY },
      body: form,
    });
    if (!resp.ok) {
      const errText = await resp.text();
      req.log.error({ status: resp.status, errText }, "Sarvam STT failed");
      res.status(502).json({ error: "Transcription failed" });
      return;
    }
    const json = (await resp.json()) as { transcript?: string; language_code?: string };
    res.json({ text: json.transcript ?? "", languageCode: json.language_code ?? null });
  } catch (err) {
    req.log.error({ err }, "Transcribe error");
    res.status(500).json({ error: "Transcribe failed" });
  }
});

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
