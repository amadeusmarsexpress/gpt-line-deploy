import axios from 'axios';
import FormData from 'form-data';
import config from '../config/index.js';
import { handleFulfilled, handleRejected, handleRequest } from './utils/index.js';

export const ROLE_SYSTEM = 'system';
export const ROLE_AI = 'assistant';
export const ROLE_HUMAN = 'user';

export const FINISH_REASON_STOP = 'stop';
export const FINISH_REASON_LENGTH = 'length';

export const IMAGE_SIZE_256 = '256x256';
export const IMAGE_SIZE_512 = '512x512';
export const IMAGE_SIZE_1024 = '1024x1024';

export const MODEL_GPT_3_5_TURBO = 'gpt-3.5-turbo';
export const MODEL_GPT_4_OMNI = 'gpt-4o';
export const MODEL_WHISPER_1 = 'whisper-1';
export const MODEL_DALL_E_3 = 'dall-e-3';

const client = axios.create({
  baseURL: config.OPENAI_BASE_URL,
  timeout: config.OPENAI_TIMEOUT,
  headers: {
    'Accept-Encoding': 'gzip, deflate, compress',
  },
});

client.interceptors.request.use((c) => {
  c.headers.Authorization = `Bearer ${config.OPENAI_API_KEY}`;
  return handleRequest(c);
});

client.interceptors.response.use(handleFulfilled, (err) => {
  if (err.response?.data?.error?.message) {
    err.message = err.response.data.error.message;
  }
  return handleRejected(err);
});

const hasImage = ({ messages }) => (
  messages.some(({ content }) => (
    Array.isArray(content) && content.some((item) => item.image_url)
  ))
);

const createChatCompletion = ({
  model = config.OPENAI_COMPLETION_MODEL,
  messages,
  temperature = config.OPENAI_COMPLETION_TEMPERATURE,
  maxTokens = config.OPENAI_COMPLETION_MAX_TOKENS,
  frequencyPenalty = config.OPENAI_COMPLETION_FREQUENCY_PENALTY,
  presencePenalty = config.OPENAI_COMPLETION_PRESENCE_PENALTY,
}) => {
  const body = {
    model: hasImage({ messages }) ? config.OPENAI_VISION_MODEL : model,
    messages,
    temperature,
    max_tokens: maxTokens,
    frequency_penalty: frequencyPenalty,
    presence_penalty: presencePenalty,
  };
  return client.post('/v1/chat/completions', body);
};

const createImage = ({
  model = config.OPENAI_IMAGE_GENERATION_MODEL,
  prompt,
  size = config.OPENAI_IMAGE_GENERATION_SIZE,
  quality = config.OPENAI_IMAGE_GENERATION_QUALITY,
  n = 1,
}) => {
  // set image size to 1024 when using the DALL-E 3 model and the requested size is 256 or 512.
  if (model === MODEL_DALL_E_3 && [IMAGE_SIZE_256, IMAGE_SIZE_512].includes(size)) {
    size = IMAGE_SIZE_1024;
  }

  return client.post('/v1/images/generations', {
    model,
    prompt,
    size,
    quality,
    n,
  });
};

const createAudioTranscriptions = ({
  buffer,
  file,
  model = MODEL_WHISPER_1,
}) => {
  const formData = new FormData();
  formData.append('file', buffer, file);
  formData.append('model', model);
  return client.post('/v1/audio/transcriptions', formData.getBuffer(), {
    headers: formData.getHeaders(),
  });
};

const createThreadAndSendMessage = async ({
  assistantId,
  initialMessage,
  stream = true,
}) => {
  const url = '/v1/threads/runs';
  const body = {
    assistant_id: assistantId,
    thread: {
      messages: [
        { role: ROLE_HUMAN, content: initialMessage },
      ],
    },
    stream,
  };

  client.headers["OpenAI-Beta"] = 'assistants=v2';
  const response = await client.post(url, body, { responseType: 'stream' });

  return new Promise((resolve, reject) => {
    let lastEvent = null;
    response.data.on('data', (chunk) => {
      try {
        const event = JSON.parse(chunk.toString());
        if (event.object === 'thread.message' && event.status === "completed") {
          lastEvent = event;
        }
      } catch (error) {
        reject(error);
      }
    });

    response.data.on('end', () => {
      if (lastEvent) {
        const messageContent = lastEvent.data.content
          .filter(part => part.type === 'text')
          .map(part => part.text.value)
          .join(' ');
        resolve(messageContent);
      } else {
        reject(new Error('No completed message event found'));
      }
    });

    response.data.on('error', (error) => {
      reject(error);
    });
  });
};

export {
  createAudioTranscriptions,
  createChatCompletion,
  createImage,
  createThreadAndSendMessage,
};
