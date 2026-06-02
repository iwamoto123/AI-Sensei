#!/usr/bin/env node

import { execFile } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";

const DEFAULT_PROVIDER = "macos-say";
const DEFAULT_ELEVENLABS_VOICE = "21m00Tcm4TlvDq8ikWAM";
const DEFAULT_OPENAI_VOICE = "alloy";

async function main() {
  loadDotEnv(".env.local");
  loadDotEnv(".env");

  const args = parseArgs(process.argv.slice(2));
  const narrationPath = resolveNarrationPath(args);
  const timeline = JSON.parse(await readFile(narrationPath, "utf8"));
  const provider = args.provider ?? DEFAULT_PROVIDER;
  const audioSettings = resolveAudioSettings(provider, args);
  const outDir = resolve(args.out ?? join(dirname(narrationPath), "audio"));
  await mkdir(outDir, { recursive: true });

  const speechText = buildSpeechText(timeline);
  const scriptPath = join(outDir, "voice-script.txt");
  await writeFile(scriptPath, `${speechText}\n`, "utf8");

  const manifest = {
    generated_at: new Date().toISOString(),
    provider,
    model: audioSettings.model,
    voice: audioSettings.voice,
    voice_id: audioSettings.voice_id,
    format: audioSettings.format,
    audio_settings: audioSettings,
    narration_json: narrationPath,
    script: scriptPath,
    character_count: speechText.replace(/\s+/g, "").length,
    estimated_duration_sec: timeline.estimated_duration_sec ?? estimateSpeechSeconds(speechText),
    cost_estimates_usd: estimateCosts(speechText, timeline.estimated_duration_sec),
    output_audio: null,
    status: "estimated",
    notes: [],
  };

  if (provider !== "estimate") {
    const audioPath = await generateAudio(provider, speechText, outDir, args);
    manifest.output_audio = audioPath;
    manifest.status = "generated";
  }

  const manifestPath = join(outDir, "audio-manifest.json");
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  console.log(`Wrote ${manifestPath}`);
  if (manifest.output_audio) console.log(`Audio: ${manifest.output_audio}`);
}

function resolveNarrationPath(args) {
  if (args.narration) return resolve(args.narration);
  if (args.slidesDir && args.case) {
    const caseId = String(args.case).padStart(2, "0");
    return resolve(args.slidesDir, `case-${caseId}`, "narration.json");
  }
  throw new Error("Specify --narration path or --slides-dir dir --case n.");
}

async function generateAudio(provider, text, outDir, args) {
  if (provider === "macos-say") return generateMacOsSay(text, outDir, args);
  if (provider === "voicevox") return generateVoicevox(text, outDir, args);
  if (provider === "elevenlabs") return generateElevenLabs(text, outDir, args);
  if (provider === "mistral") return generateMistral(text, outDir, args);
  if (provider === "openai") return generateOpenAI(text, outDir, args);
  if (provider === "local-openai") return generateLocalOpenAI(text, outDir, args);
  throw new Error(`Unknown provider: ${provider}`);
}

function resolveAudioSettings(provider, args) {
  if (provider === "macos-say") {
    return {
      provider,
      model: "macos-say",
      voice: args.voice ?? "Kyoko",
      voice_id: null,
      format: args.format ?? "m4a",
    };
  }
  if (provider === "voicevox") {
    return {
      provider,
      model: "voicevox-engine",
      voice: args.speaker ?? "3",
      voice_id: args.speaker ?? "3",
      format: args.format ?? "wav",
      base_url: args.baseUrl ?? process.env.VOICEVOX_BASE_URL ?? "http://127.0.0.1:50021",
    };
  }
  if (provider === "elevenlabs") {
    return {
      provider,
      model: args.model ?? "eleven_flash_v2_5",
      voice: null,
      voice_id: args.voiceId ?? DEFAULT_ELEVENLABS_VOICE,
      format: args.format ?? "mp3_44100_128",
    };
  }
  if (provider === "mistral") {
    return {
      provider,
      model: args.model ?? "voxtral-mini-tts-2603",
      voice: args.voice ?? "casual_male",
      voice_id: args.voiceId ?? null,
      format: args.format ?? "mp3",
    };
  }
  if (provider === "openai") {
    return {
      provider,
      model: args.model ?? "gpt-4o-mini-tts",
      voice: args.voice ?? DEFAULT_OPENAI_VOICE,
      voice_id: null,
      format: args.format ?? "mp3",
      instructions: args.instructions ?? null,
    };
  }
  if (provider === "local-openai") {
    return {
      provider,
      model: args.model ?? "local-tts",
      voice: args.voice ?? "default",
      voice_id: null,
      format: args.format ?? "mp3",
      base_url: args.baseUrl ?? "http://127.0.0.1:8000/v1",
    };
  }
  return {
    provider,
    model: args.model ?? null,
    voice: args.voice ?? null,
    voice_id: args.voiceId ?? null,
    format: args.format ?? null,
  };
}

async function generateMacOsSay(text, outDir, args) {
  const rawOutput = join(outDir, "narration.aiff");
  const output = join(outDir, args.format === "aiff" ? "narration.aiff" : "narration.m4a");
  const voice = args.voice ?? "Kyoko";
  const commandArgs = ["-v", voice, "-o", rawOutput, "--data-format=LEF32@22050", text];
  const basicArgs = ["-v", voice, "-o", rawOutput, text];
  try {
    await execFilePromise("say", commandArgs, { timeout: 120_000 });
  } catch {
    try {
      await execFilePromise("say", basicArgs, { timeout: 120_000 });
    } catch (fallbackError) {
      if (args.voice) throw fallbackError;
      await execFilePromise("say", ["-o", rawOutput, text], { timeout: 120_000 });
    }
  }
  if (output !== rawOutput) {
    try {
      await execFilePromise("ffmpeg", ["-y", "-i", rawOutput, "-c:a", "aac", "-b:a", "96k", output], { timeout: 120_000 });
    } catch {
      await execFilePromise("afconvert", ["-f", "m4af", "-d", "aac ", rawOutput, output], { timeout: 120_000 });
    }
  }
  return output;
}

async function generateVoicevox(text, outDir, args) {
  const baseUrl = args.baseUrl ?? process.env.VOICEVOX_BASE_URL ?? "http://127.0.0.1:50021";
  const speaker = args.speaker ?? "3";
  const queryResponse = await fetch(`${baseUrl}/audio_query?text=${encodeURIComponent(text)}&speaker=${speaker}`, {
    method: "POST",
  });
  if (!queryResponse.ok) throw new Error(`VOICEVOX audio_query failed: ${queryResponse.status} ${await queryResponse.text()}`);
  const query = await queryResponse.json();
  const synthResponse = await fetch(`${baseUrl}/synthesis?speaker=${speaker}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(query),
  });
  if (!synthResponse.ok) throw new Error(`VOICEVOX synthesis failed: ${synthResponse.status} ${await synthResponse.text()}`);
  const output = join(outDir, "narration.wav");
  await writeFile(output, Buffer.from(await synthResponse.arrayBuffer()));
  return output;
}

async function generateElevenLabs(text, outDir, args) {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) throw new Error("ELEVENLABS_API_KEY is missing.");
  const voiceId = args.voiceId ?? DEFAULT_ELEVENLABS_VOICE;
  const modelId = args.model ?? "eleven_flash_v2_5";
  const format = args.format ?? "mp3_44100_128";
  const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}?output_format=${format}`, {
    method: "POST",
    headers: {
      "xi-api-key": apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      text,
      model_id: modelId,
      voice_settings: { stability: 0.55, similarity_boost: 0.75 },
    }),
  });
  if (!response.ok) throw new Error(`ElevenLabs TTS failed: ${response.status} ${await response.text()}`);
  const output = join(outDir, format.startsWith("wav") ? "narration.wav" : "narration.mp3");
  await writeFile(output, Buffer.from(await response.arrayBuffer()));
  return output;
}

async function generateMistral(text, outDir, args) {
  const apiKey = process.env.MISTRAL_API_KEY;
  if (!apiKey) throw new Error("MISTRAL_API_KEY is missing.");
  const model = args.model ?? "voxtral-mini-tts-2603";
  const format = args.format ?? "mp3";
  const body = {
    model,
    input: text,
    response_format: format,
    voice: args.voice ?? "casual_male",
  };
  if (args.voiceId) body.voice_id = args.voiceId;
  if (args.refAudio) body.ref_audio = await base64Audio(args.refAudio);
  const response = await fetch("https://api.mistral.ai/v1/audio/speech", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(`Mistral TTS failed: ${response.status} ${await response.text()}`);
  const output = join(outDir, `narration.${format === "wav" ? "wav" : "mp3"}`);
  const contentType = response.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    const json = await response.json();
    const raw = json.audio_data ?? json.data?.audio_data;
    if (!raw) throw new Error("Mistral response did not include audio_data.");
    await writeFile(output, Buffer.from(raw, "base64"));
  } else {
    await writeFile(output, Buffer.from(await response.arrayBuffer()));
  }
  return output;
}

async function generateOpenAI(text, outDir, args) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY is missing.");
  const model = args.model ?? "gpt-4o-mini-tts";
  const voice = args.voice ?? DEFAULT_OPENAI_VOICE;
  const format = args.format ?? "mp3";
  const body = {
    model,
    voice,
    input: text,
    response_format: format,
  };
  if (args.instructions) body.instructions = args.instructions;
  const response = await fetch("https://api.openai.com/v1/audio/speech", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(`OpenAI TTS failed: ${response.status} ${await response.text()}`);
  const output = join(outDir, `narration.${format === "wav" ? "wav" : "mp3"}`);
  await writeFile(output, Buffer.from(await response.arrayBuffer()));
  return output;
}

async function generateLocalOpenAI(text, outDir, args) {
  const baseUrl = args.baseUrl ?? "http://127.0.0.1:8000/v1";
  const model = args.model ?? "local-tts";
  const voice = args.voice ?? "default";
  const format = args.format ?? "mp3";
  const response = await fetch(`${baseUrl.replace(/\/$/, "")}/audio/speech`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model, voice, input: text, response_format: format }),
  });
  if (!response.ok) throw new Error(`Local OpenAI-compatible TTS failed: ${response.status} ${await response.text()}`);
  const output = join(outDir, `narration.${format === "wav" ? "wav" : "mp3"}`);
  const contentType = response.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    const json = await response.json();
    const raw = json.audio_data ?? json.data?.audio_data;
    if (!raw) throw new Error("Local TTS response did not include audio_data.");
    await writeFile(output, Buffer.from(raw, "base64"));
  } else {
    await writeFile(output, Buffer.from(await response.arrayBuffer()));
  }
  return output;
}

async function base64Audio(path) {
  const data = await readFile(resolve(path));
  return data.toString("base64");
}

function buildSpeechText(timeline) {
  const lines = [];
  for (const scene of timeline.scenes ?? []) {
    lines.push(`${scene.title}。`);
    for (const segment of scene.segments ?? []) {
      lines.push(segment.text);
    }
  }
  return lines.join("\n").replace(/\s+\n/g, "\n").trim();
}

function estimateCosts(text, estimatedDurationSec) {
  const chars = text.replace(/\s+/g, "").length;
  const minutes = Math.max(estimatedDurationSec ?? estimateSpeechSeconds(text), 1) / 60;
  return {
    macos_say: 0,
    voicevox_local: 0,
    local_openai_compatible: 0,
    elevenlabs_flash_estimate: roundUsd(chars * 0.00005),
    elevenlabs_multilingual_estimate: roundUsd(chars * 0.0001),
    mistral_voxtral_tts_estimate: roundUsd(chars * 0.000016),
    openai_tts_legacy_estimate: roundUsd(chars * 0.000015),
    openai_gpt_4o_mini_tts_estimate: roundUsd(minutes * 0.015),
  };
}

function estimateSpeechSeconds(text) {
  const length = String(text).replace(/\s+/g, "").length;
  return Math.max(4, Math.ceil(length / 12));
}

function roundUsd(value) {
  return Math.round(value * 100_000) / 100_000;
}

function execFilePromise(command, args, options) {
  return new Promise((resolvePromise, reject) => {
    execFile(command, args, options, (error, stdout, stderr) => {
      if (error) {
        reject(new Error(`${command} failed: ${stderr || error.message}`));
        return;
      }
      resolvePromise({ stdout, stderr });
    });
  });
}

function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--narration") args.narration = argv[++index];
    else if (arg === "--slides-dir") args.slidesDir = argv[++index];
    else if (arg === "--case") args.case = argv[++index];
    else if (arg === "--out") args.out = argv[++index];
    else if (arg === "--provider") args.provider = argv[++index];
    else if (arg === "--voice") args.voice = argv[++index];
    else if (arg === "--voice-id") args.voiceId = argv[++index];
    else if (arg === "--speaker") args.speaker = argv[++index];
    else if (arg === "--model") args.model = argv[++index];
    else if (arg === "--format") args.format = argv[++index];
    else if (arg === "--ref-audio") args.refAudio = argv[++index];
    else if (arg === "--base-url") args.baseUrl = argv[++index];
    else if (arg === "--instructions") args.instructions = argv[++index];
    else if (arg === "--help") {
      console.log("usage: npm run audio:narration -- --narration path [--provider macos-say|voicevox|elevenlabs|mistral|openai|local-openai|estimate]");
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return args;
}

function loadDotEnv(path) {
  try {
    if (!existsSync(path)) return;
    const content = readFileSync(path, "utf8");
    for (const line of content.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
      if (!match || process.env[match[1]]) continue;
      process.env[match[1]] = match[2].replace(/^['"]|['"]$/g, "");
    }
  } catch {
    // Optional dotenv loading.
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
