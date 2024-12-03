import config from '../config/index.js';
import { MOCK_TEXT_OK } from '../constants/mock.js';
import { createChatCompletion, createThreadAndSendMessage, FINISH_REASON_STOP } from '../services/openai.js';

class Completion {
  text;

  finishReason;

  constructor({
    text,
    finishReason,
  }) {
    this.text = text;
    this.finishReason = finishReason;
  }

  get isFinishReasonStop() {
    return this.finishReason === FINISH_REASON_STOP;
  }
}

/**
 * @param {Object} param
 * @param {Prompt} param.prompt
 * @returns {Promise<Completion>}
 */
const generateCompletion = async ({
  prompt, userId
}) => {
  if (config.APP_ENV !== 'production') return new Completion({ text: MOCK_TEXT_OK });
  //const { data } = await createChatCompletion({ messages: prompt.messages });
  //console.log(prompt)
  const responseText = await createThreadAndSendMessage({ assistantId: 'asst_IisJpT9OTQ1X5V9cGZVqlWRO', initialMessage: prompt, userId });
  //console.log(responseText);
  //const [choice] = data.choices;
  return new Completion({
    text: responseText.trim(),
    //finishReason: choice.finish_reason,
    finishReason: false,
  });
};

export default generateCompletion;
