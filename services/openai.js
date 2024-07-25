import axios from 'axios';
import FormData from 'form-data';
import config from '../config/index.js';
import { handleFulfilled, handleRejected, handleRequest } from './utils/index.js';
import { Readable } from 'stream';
import { count } from 'console';

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

import OpenAI from 'openai';
const clientO = new OpenAI({
  apiKey : config.OPENAI_API_KEY
});

const client = axios.create({
  baseURL: config.OPENAI_BASE_URL,
  timeout: config.OPENAI_TIMEOUT,
  headers: {
    'Accept-Encoding': 'gzip, deflate, compress',
    'OpenAI-Beta': 'assistants=v2',
  },
  responseType: 'stream'
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
const createThreadAndSendMessage = async ({ assistantId, initialMessage, stream = true }) => {
  try {
    // Ensure clientO and beta are properly defined
    if (!clientO || !clientO.beta || !clientO.beta.threads || !clientO.beta.threads.messages) {
      throw new Error("clientO or its properties are not defined properly");
    }

    // Create a thread
    const myThread = await clientO.beta.threads.create();
    console.log("Thread created with ID:", myThread.id);

    // Send an initial message
    const myThreadMessage = await clientO.beta.threads.messages.create(myThread.id, {
      role: "user",
      content: initialMessage,
    });
    console.log("Message sent with ID:", myThreadMessage.id);

    // Create a run
    const myRun = await clientO.beta.threads.runs.create(myThread.id, {
      assistant_id: assistantId,
    });
    console.log("Run created with ID:", myRun.id);

    // Function to retrieve the run status
    const retrieveRun = async () => {
      while (true) {
        const runStatus = await clientO.beta.threads.runs.retrieve(myThread.id, myRun.id);
        console.log(`Run status: ${runStatus.status}`);

        if (runStatus.status === "completed") {
          console.log("\n");
          break;
        }

        await new Promise(resolve => setTimeout(resolve, 1000)); // Wait for 1 second before checking again
      }
    };

    // Wait for the run to complete
    await retrieveRun();

    // Retrieve all messages in the thread
    const allMessages = await clientO.beta.threads.messages.list(myThread.id);
    console.log("All messages retrieved:", allMessages);

    const userMessage = allMessages.data.find(msg => msg.role === "user");
    const assistantMessage = allMessages.data.find(msg => msg.role === "assistant");

    console.log("User:", userMessage?.content[0]?.text?.value);
    console.log("Assistant:", assistantMessage?.content[0]?.text?.value);

    return assistantMessage?.content[0]?.text?.value;
  } catch (error) {
    console.error("Error in createThreadAndSendMessage:", error.message);
  }
};

export {
  createAudioTranscriptions,
  createChatCompletion,
  createImage,
  createThreadAndSendMessage,
};
