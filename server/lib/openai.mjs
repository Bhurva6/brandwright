// The three model clients, all OpenAI-compatible.
import 'dotenv/config';
import OpenAI from 'openai';

export const pro = new OpenAI({ baseURL: process.env.DEEPSEEK_PRO_BASE_URL, apiKey: process.env.DEEPSEEK_PRO_API_KEY });
export const flash = new OpenAI({ baseURL: process.env.DEEPSEEK_FLASH_BASE_URL, apiKey: process.env.DEEPSEEK_FLASH_API_KEY });
export const image = new OpenAI({ baseURL: process.env.IMAGE_BASE_URL || undefined, apiKey: process.env.OPENAI_API_KEY });

export const MODELS = {
  pro: process.env.DEEPSEEK_PRO_MODEL || 'DeepSeek-V4-Pro',
  flash: process.env.DEEPSEEK_FLASH_MODEL || 'DeepSeek-V4.1-Flash',
  image: process.env.IMAGE_MODEL || 'gpt-image-2.5-flare',
};
