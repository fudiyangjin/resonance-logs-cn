/**
 * @file Starting points for HTTP TTS providers. Each preset is a complete
 * `HttpProviderInput` the user then adjusts (endpoint, key, voices).
 */
import type { HttpLanguageParams, HttpProviderInput } from "$lib/bindings";

export type HttpProviderPresetId =
  | "openaiCompatible"
  | "googleCloud"
  | "customGet";

export const HTTP_PROVIDER_PRESET_IDS: readonly HttpProviderPresetId[] = [
  "openaiCompatible",
  "googleCloud",
  "customGet",
];

function languages(
  langs: [zh: string, en: string, ja: string],
  voices: [zh: string, en: string, ja: string],
): HttpLanguageParams {
  return {
    zhCn: { lang: langs[0], voice: voices[0] },
    enUs: { lang: langs[1], voice: voices[1] },
    jaJp: { lang: langs[2], voice: voices[2] },
  };
}

const jsonBody = (value: unknown) => ({
  encoding: "json" as const,
  template: JSON.stringify(value, null, 2),
});

export function createHttpProviderPreset(
  preset: HttpProviderPresetId,
  name: string,
): HttpProviderInput {
  const base = { id: null, name, secret: "", maxConcurrency: 2 };
  switch (preset) {
    // OpenAI's `/v1/audio/speech`, also served by many local TTS servers.
    case "openaiCompatible":
      return {
        ...base,
        request: {
          method: "post",
          url: "https://api.openai.com/v1/audio/speech",
          headers: [{ name: "Authorization", value: "Bearer {secret}" }],
          body: jsonBody({
            model: "tts-1",
            input: "{text}",
            voice: "{voice}",
            response_format: "wav",
          }),
          response: { kind: "audioBytes" },
          languages: languages(["zh", "en", "ja"], ["alloy", "alloy", "alloy"]),
        },
      };
    case "googleCloud":
      return {
        ...base,
        request: {
          method: "post",
          url: "https://texttospeech.googleapis.com/v1/text:synthesize",
          headers: [{ name: "x-goog-api-key", value: "{secret}" }],
          body: jsonBody({
            input: { text: "{text}" },
            voice: { languageCode: "{lang}", name: "{voice}" },
            audioConfig: { audioEncoding: "MP3" },
          }),
          response: { kind: "jsonBase64", pointer: "/audioContent" },
          languages: languages(
            ["cmn-CN", "en-US", "ja-JP"],
            ["cmn-CN-Wavenet-A", "en-US-Wavenet-D", "ja-JP-Wavenet-B"],
          ),
        },
      };
    // A plain GET for a local forwarder that wraps any other TTS.
    case "customGet":
      return {
        ...base,
        request: {
          method: "get",
          url: "http://127.0.0.1:9880/tts?text={text}&lang={lang}&voice={voice}",
          headers: [],
          body: null,
          response: { kind: "audioBytes" },
          languages: languages(["zh", "en", "ja"], ["", "", ""]),
        },
      };
  }
}
