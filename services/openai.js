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

const createThreadAndSendMessage = async ({
  assistantId,
  initialMessage,
  stream = true,
}) => {
  /*const url = '/v1/threads/runs';
  const body = {
    assistant_id: assistantId,
    thread: {
      messages: [
        { role: ROLE_HUMAN, content: initialMessage },
      ],
    },
    "stream" : true,
  };*/


  const thread = clientO.beta.threads.create(
    messages=[
      {
        "role": "user",
        "content": initialMessage
      }
    ]
  )

  const myRun = clientO.beta.threads.runs.create(
    thread.id,
    {
      assistant_id: assistantId,
    }
  )

  const retrieveRun = async () => {
    let keepRetrievingRun;

    while (myRun.status !== "completed") {
      keepRetrievingRun = await client.beta.threads.runs.retrieve(
        thread.id, // Use the stored thread ID for this user
        myRun.id
      );

      console.log(`Run status: ${keepRetrievingRun.status}`);

      if (keepRetrievingRun.status === "completed") {
        console.log("\n");
        break;
      }
    }
  };
  //await retrieveRun();

  
  const waitForAssistantMessage = async () => {
    await retrieveRun();

    const allMessages = await clientO.beta.threads.messages.list(
      thread.id // Use the stored thread ID for this user
    );

    console.log("User: ", myThreadMessage.content[0].text.value);
    console.log("Assistant: ", allMessages.data[0].content[0].text.value);

    return allMessages.data[0].content[0].text.value;

  };
  return await waitForAssistantMessage();  

  /*const response = await client.post(url, body);
  const readable = Readable.from(response.data);
  return new Promise((resolve, reject) => {
    let lastEvent = null;

    let count = 0;
    readable.on('data', (chunk) => {
      count++
      //dataBuffer += chunk.toString();
      //const events = dataBuffer.split("\n\n").filter(Boolean);
      //console.log("============================START\n");
      //console.log(chunk.toString());
      //console.log("============================END\n");

    });

    readable.on('end', () => {
      console.log(`message count : ${count}`);
      if (lastEvent) {
        const messageContent = lastEvent.content
          .filter((part) => part.type === 'text')
          .map((part) => part.text.value)
          .join(' ');
        resolve(messageContent);
      } else {
        reject(new Error('No completed message event found'));
      }
    });

    readable.on('error', (error) => {
      reject(error);
    });
  });*/
};

export {
  createAudioTranscriptions,
  createChatCompletion,
  createImage,
  createThreadAndSendMessage,
};
