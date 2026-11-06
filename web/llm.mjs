// @ts-check
// Minimal DeepSeek client (OpenAI-compatible chat completions, JSON output).
// The key stays on the server: DEEPSEEK_API_KEY, from the environment or from
// web/.env (git-ignored), never in the repo. Read per call, so .env can load
// after this module is imported.

import { recordUsage } from './usage.mjs';

const TIMEOUT_MS = 60_000;

export function llmConfigured() {
  return Boolean(process.env.DEEPSEEK_API_KEY);
}

/**
 * Parse a model reply that should be one JSON object. Tolerates a ```json
 * fence around it; anything else is an error.
 * @param {string} reply
 * @returns {any}
 */
export function parseJsonReply(reply) {
  const body = reply.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  const parsed = JSON.parse(body);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('la respuesta del modelo no es un objeto JSON');
  }
  return parsed;
}

/**
 * One chat call that must answer with a JSON object. Its token use is
 * recorded in usage.jsonl under `tipo`.
 * @param {{ system: string, user: string, maxTokens?: number, tipo?: string }} req
 * @param {typeof fetch} [fetchImpl]
 */
export async function chatJson({ system, user, maxTokens = 4000, tipo = 'otro' }, fetchImpl = fetch) {
  const key = process.env.DEEPSEEK_API_KEY;
  if (!key) throw new Error('falta DEEPSEEK_API_KEY');
  const baseUrl = process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com';
  const res = await fetchImpl(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model: process.env.DEEPSEEK_MODEL || 'deepseek-flash',
      messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
      response_format: { type: 'json_object' },
      temperature: 0,
      max_tokens: maxTokens,
      // deepseek-flash reasons before answering unless told not to, and those
      // tokens bill as output: on a CV they used the whole budget and left an
      // empty answer. These calls are extraction and sorting; no reasoning.
      thinking: { type: process.env.DEEPSEEK_THINKING === 'enabled' ? 'enabled' : 'disabled' },
    }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) {
    const detail = (await res.text()).slice(0, 300);
    throw new Error(`DeepSeek respondió HTTP ${res.status}: ${detail}`);
  }
  const data = await res.json();
  if (data?.usage) recordUsage(tipo, data.usage);
  const content = data?.choices?.[0]?.message?.content;
  if (typeof content !== 'string') throw new Error('DeepSeek no devolvió contenido');
  return parseJsonReply(content);
}
