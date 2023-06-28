import { z } from 'zod';

import { createTRPCRouter, publicProcedure } from '~/modules/trpc/trpc.server';


export const speechInputSchema = z.object({
  elevenKey: z.string().optional(),
  text: z.string(),
  voiceId: z.string().optional(),
  nonEnglish: z.boolean(),
});

export type SpeechInputSchema = z.infer<typeof speechInputSchema>;

const voicesInputSchema = z.object({
  elevenKey: z.string().optional(),
});


export const elevenlabsRouter = createTRPCRouter({

  /**
   * List Voices available to this api key
   */
  listVoices: publicProcedure
    .input(voicesInputSchema)
    .query(async ({ input }) => {

      const { elevenKey } = input;
      const { headers, url } = elevenlabsAccess(elevenKey, '/v1/voices');

      const response = await fetch(url, { headers });
      await rethrowElevenLabsError(response);
      const voicesList = await response.json() as ElevenlabsWire.VoicesList;

      // bring category != 'premade' to the top
      voicesList.voices.sort((a, b) => {
        if (a.category === 'premade' && b.category !== 'premade') return 1;
        if (a.category !== 'premade' && b.category === 'premade') return -1;
        return 0;
      });

      return {
        voices: voicesList.voices.map((voice, idx) => ({
          id: voice.voice_id,
          name: voice.name,
          description: voice.description,
          previewUrl: voice.preview_url,
          category: voice.category,
          default: idx === 0,
        })),
      };

    }),

  /**
   * Text to Speech: NOTE: we cannot use this until tRPC will support ArrayBuffers
   * So for the speech synthesis, we unfortunately have to use the NextJS API route,
   * but at least we recycle the data types and helpers.
   */
  /*speech: publicProcedure
    .input(speechInputSchema)
    .mutation(async ({ input }) => {

      const { elevenKey, text, voiceId: _voiceId, nonEnglish } = input;
      const { headers, url } = elevenlabsAccess(elevenKey, `/v1/text-to-speech/${elevenlabsVoiceId(_voiceId)}`);
      const body: ElevenlabsWire.TTSRequest = {
        text: text,
        ...(nonEnglish && { model_id: 'eleven_multilingual_v1' }),
      };

      const response = await fetch(url, { headers, method: 'POST', body: JSON.stringify(body) });
      await rethrowElevenLabsError(response);
      return await response.arrayBuffer();
    }),*/

});


export function elevenlabsAccess(elevenKey: string | undefined, apiPath: string): { headers: HeadersInit, url: string } {
  // API key
  elevenKey = (elevenKey || process.env.ELEVENLABS_API_KEY || '').trim();
  if (!elevenKey)
    throw new Error('Missing ElevenLabs API key.');

  // API host
  let host = (process.env.ELEVENLABS_API_HOST || 'api.elevenlabs.io').trim();
  if (!host.startsWith('http'))
    host = `https://${host}`;
  if (host.endsWith('/') && apiPath.startsWith('/'))
    host = host.slice(0, -1);

  return {
    headers: {
      'Content-Type': 'application/json',
      'xi-api-key': elevenKey,
    },
    url: host + apiPath,
  };
}

export function elevenlabsVoiceId(voiceId?: string): string {
  return voiceId?.trim() || process.env.ELEVENLABS_VOICE_ID || '21m00Tcm4TlvDq8ikWAM';
}

async function rethrowElevenLabsError(response: Response) {
  if (!response.ok) {
    let errorPayload: object | null = null;
    try {
      errorPayload = await response.json();
    } catch (e) {
      // ignore
    }
    // console.error('Error in ElevenLabs API:', errorPayload);
    throw new Error('ElevenLabs error: ' + JSON.stringify(errorPayload));
  }
}


/// This is the upstream API [rev-eng on 2023-04-12]
export namespace ElevenlabsWire {
  export interface TTSRequest {
    text: string;
    model_id?: 'eleven_monolingual_v1' | string;
    voice_settings?: {
      stability: number;
      similarity_boost: number;
    };
  }

  export interface VoicesList {
    voices: Voice[];
  }

  interface Voice {
    voice_id: string;
    name: string;
    //samples: Sample[];
    category: string;
    // fine_tuning: FineTuning;
    labels: Record<string, string>;
    description: string;
    preview_url: string;
    // available_for_tiers: string[];
    settings: {
      stability: number;
      similarity_boost: number;
    };
  }
}