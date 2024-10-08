import config from '../config/index.js';
import en from './en.js';
import ja from './ja.js';
import zh from './zh.js';
import th from './th.js';

const locales = {
  th,
  en,
  ja,
  zh,
  zh_TW: zh,
  zh_CN: zh,
};

const t = (key) => locales[config.APP_LANG][key];

export {
  t,
};

export default null;
