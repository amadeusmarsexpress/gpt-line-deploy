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
import { getThreads, setThreads } from '../app/prompt/index.js';
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

const getToday= ()=> {
  // Create a Date object representing the current time in UTC
  const now = new Date();

  // Convert the current time to Thailand's timezone (UTC+7)
  const thailandOffset = 7 * 60; // 7 hours * 60 minutes per hour
  const localOffset = now.getTimezoneOffset(); // Get local timezone offset in minutes
  const thTime = new Date(now.getTime() + (thailandOffset + localOffset) * 60000);

  // Extract year, month, and day in Thailand's timezone
  const year = thTime.getUTCFullYear();
  const month = String(thTime.getUTCMonth() + 1).padStart(2, '0'); // Months are zero-based
  const day = String(thTime.getUTCDate()).padStart(2, '0');

  // Format the date as 'YYYY-MM-DD'
  const formattedDate = `${year}-${month}-${day}`;

  // Return the formatted date
  return formattedDate;
}

const getCurrentWorkweek = ()=> {
  const today = new Date();
  const dayOfWeek = today.getDay(); // 0 = Sunday, 6 = Saturday
  const monday = new Date(today);
  monday.setDate(today.getDate() - (dayOfWeek - 1));
  
  const workweek = [];
  for (let i = 0; i < 5; i++) {
      const date = new Date(monday);
      date.setDate(monday.getDate() + i);
      workweek.push(String(date.getDate()).padStart(2, '0'));
  }
  return workweek;
}

  const wfa_data = [
    { Employee: 'Achi', 'WFA Dates': ['10', '31'] },
    { Employee: 'Pook', 'WFA Dates': ['10', '31'] },
    { Employee: 'Gun', 'WFA Dates': ['09', '22'] },
    { Employee: 'Nan', 'WFA Dates': ['17', '31'] },
    { Employee: 'Lookplue', 'WFA Dates': ['10', '22'] },
    { Employee: 'March', 'WFA Dates': ['24', '31'] },
    { Employee: 'Pompam', 'WFA Dates': ['17', '24'] },
    { Employee: 'Peary', 'WFA Dates': ['10', '31'] },
    { Employee: 'Bubble', 'WFA Dates': ['10', '31'] },
  ];

const capitalizeFirstLetter = (data) => {
    return data.charAt(0).toUpperCase() + data.slice(1);
}

const getWFAByDateAndNickName = (argsJson) => {
  console.log(argsJson);
  const { dates, nicknames } = argsJson;
 
  const result = wfa_data
    .filter(employee =>
      (nicknames === undefined || nicknames.length == 0 || nicknames.includes(capitalizeFirstLetter(employee.Employee.toLowerCase()))) &&
      employee['WFA Dates'].some(date => dates.includes(date))
    )
    .map(employee => ({
      Employee: employee.Employee,
      'WFA Dates': employee['WFA Dates'].filter(date => dates.includes(date))
    }));
  
  // ตรวจสอบว่ามีข้อมูลหรือไม่
  if (result.length === 0) {
        return `ไม่มีข้อมูล WFA สำหรับ ${nicknames.join(", ")}`;
  }
  
  return JSON.stringify(result, null, 2);
}


const getOfficeByDateAndNickName = (argsJson) => {
  console.log(argsJson);
  const { dates, nicknames } = argsJson;

  const officeData = getOfficeDateData();
 
  const result = officeData
    .filter(employee =>
      (nicknames === undefined || nicknames.length == 0 || nicknames.includes(employee.Employee)) &&
      employee['Office Dates'].some(date => dates.includes(date))
    )
    .map(employee => ({
      Employee: employee.Employee,
      'Office Dates': employee['Office Dates'].filter(date => dates.includes(date))
    }));

  return JSON.stringify(result, null, 2);
}

const getLeave = () => {
  // วันลา (เท่าที่รู้)
  const month = "January";
  const leaveDate = [
      { Employee: 'Achi', 'Leave Dates': []},
      { Employee: 'Pook', 'Leave Dates': []},
      { Employee: 'Gun', 'Leave Dates': []},
      { Employee: 'Nan', 'Leave Dates': []},
      { Employee: 'Lookplue', 'Leave Dates': []},
      { Employee: 'March', 'Leave Dates': []},
      { Employee: 'Pompam', 'Leave Dates': []},
      { Employee: 'Peary', 'Leave Dates': []},
      { Employee: 'Bubble', 'Leave Dates': ['02','13']},
    ];
  
  // กรองพนักงานที่มีข้อมูลวันลา
  const filteredLeave = leaveDate.filter(employee => employee['Leave Dates'].length > 0);

  // หากไม่มีข้อมูลวันลา
  if (filteredLeave.length === 0) {
    return "ไม่มีข้อมูลจ้า...";
  }

  // สร้างข้อความสำหรับข้อมูลวันลา
  const leaveList = filteredLeave
    .map(employee => `- ${employee.Employee} [${employee['Leave Dates'].join(", ")}]`)
    .join("\n");

  return `❌ วันลา (เท่าที่รู้) ❌\n🏝️ เดือน ${month}:\n${leaveList}`;
  // const result = leaveDate
  //   .filter(employee => employee['Leave Dates'].length > 0)
  //   .map(employee => `- ${employee.Employee} ${JSON.stringify(employee['Leave Dates'])}`)
  //   .join('\n');
  
  // return result.length > 0
  //   ? `${month}\n${result}`
  //   : "ไม่มีข้อมูลจ้า...";
}

const getOfficeDateData = () => {

// วันหยุดพิเศษ
const special_ = ['01'];
  
// ดึงเดือนและปีปัจจุบัน
const today = new Date();
const currentYear = today.getFullYear();
const currentMonth = today.getMonth(); // 0-11 (0 = มกราคม, 11 = ธันวาคม)

// หาจำนวนวันในเดือนปัจจุบัน
const daysInCurrentMonth = new Date(currentYear, currentMonth + 1, 0).getDate();

// สร้าง array ของทุกวันในเดือนปัจจุบันที่ไม่ใช่วันเสาร์อาทิตย์และวันหยุดพิเศษ
const allOfficeDaysInCurrentMonth = Array.from({ length: daysInCurrentMonth }, (_, i) => {
  const day = i + 1;
  const date = day.toString().padStart(2, '0');

  // สร้างวันใหม่สำหรับเดือนปัจจุบัน
  const dateObj = new Date(currentYear, currentMonth, day);
  const dayOfWeek = dateObj.getDay();

  // ยกเว้นวันเสาร์ (6), วันอาทิตย์ (0) และวันหยุดพิเศษ
  if (dayOfWeek !== 0 && dayOfWeek !== 6 && !special_.includes(date)) {
    return date;
  }
  return null;
}).filter(Boolean); // กรองค่า null ออกไป

const officeData = wfa_data.map(employee => {
  // หา Office Dates โดยการลบ WFA Dates ออกจากทุกวันที่มีในเดือน
  const officeDates = allOfficeDaysInCurrentMonth.filter(date => !employee['WFA Dates'].includes(date));

  return {
    Employee: employee.Employee,
    'Office Dates': officeDates
  };
})

return officeData;
}

const createThreadAndSendMessage = async ({ assistantId, initialMessage, userId, stream = true }) => {
  try {
    // Ensure clientO and beta are properly defined
    if (!clientO || !clientO.beta || !clientO.beta.threads || !clientO.beta.threads.messages) {
      throw new Error("clientO or its properties are not defined properly");
    }

    /*file = await clientO.files.create(
      file=open("./table.html", "rb"),
      purpose='assistants'
    )
    console.log("File created with ID2:", file.id);*/

    // Create a thread
    let myThread = getThreads(userId);
    
    if(myThread == null) {
      myThread = await clientO.beta.threads.create(
      );
      setThreads(userId, myThread);
    }
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
      max_completion_tokens: 10000,
    });
    console.log("Run created with ID:", myRun.id);

    let isComplete = false;

    // Function to retrieve the run status
    const retrieveRun = async () => {
      while (true) {
        const runStatus = await clientO.beta.threads.runs.retrieve(myThread.id, myRun.id);
        console.log(`Run status: ${runStatus.status}`);

        if (runStatus.status === "completed") {
          console.log("\n");
          isComplete = true;
          break;
        }
        
        if (runStatus.status === "incomplete") {
          console.log("\n");
          break;
        }

        if (runStatus.status === "requires_action") {
          const requiredAction = runStatus.required_action;

            if (requiredAction.type === 'submit_tool_outputs') {
                const toolCalls = requiredAction.submit_tool_outputs.tool_calls;
                const toolOutputs = [];

                for (const toolCall of toolCalls) {
                    // Extract the function name from the tool call
                    const functionName = toolCall.function.name;

                    // Parse the function arguments from the tool call
                    const functionArgs = JSON.parse(toolCall.function.arguments);

                    // Define the available functions
                    const availableFunctions = {
                      get_today: getToday,
                      get_current_work_week: getCurrentWorkweek,
                      get_WFA: getWFAByDateAndNickName,
                      get_Office: getOfficeByDateAndNickName,
                      get_Leave: getLeave
                    };
                    console.log("Function Name:", functionName);

                    // Look up the actual function to call based on the function name
                    const functionToCall = availableFunctions[functionName];

                    const functionResponse = await functionToCall(functionArgs);
                    console.log("Function Response:", functionResponse);

                    const outputString = JSON.stringify(functionResponse);

                    toolOutputs.push({
                        tool_call_id: toolCall.id,
                        output: outputString,
                    });
                }
                console.log("toolOutputs: ", toolOutputs);

                await clientO.beta.threads.runs.submitToolOutputs(
                  myThread.id,
                  myRun.id,
                    { tool_outputs: toolOutputs }
                );
            }
          //break;
        }


        await new Promise(resolve => setTimeout(resolve, 100)); // Wait for 1 second before checking again
      }
    };

    // Wait for the run to complete
    await retrieveRun();

    if(isComplete) {
      // Retrieve all messages in the thread
      const allMessages = await clientO.beta.threads.messages.list(myThread.id);
      //console.log("All messages retrieved:", allMessages);

      const userMessage = allMessages.data.find((msg) => msg.role === "user");
      const assistantMessage = allMessages.data.find(
        (msg) => msg.role === "assistant"
      );

      //console.log("User:", userMessage?.content[0]?.text?.value);
      //console.log("Assistant:", assistantMessage?.content[0]?.text?.value);

      return assistantMessage?.content[0]?.text?.value;
    } else {
      return "คำตอบยาวไปตอบมะได้จ้า";
    }
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
