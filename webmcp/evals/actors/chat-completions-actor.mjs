/*
 * A native-run actor: one real model choosing one WebMCP call per turn, or ending the task.
 *
 * The 94 records of 2026-09-13 were driven by a DeepSeek actor that was never committed, so that
 * evidence could not be reproduced from this repository. This is the actor, committed: it speaks the
 * OpenAI-compatible chat-completions protocol and defaults to the same model.
 *
 *   node webmcp/evals/native-run.mjs \
 *     --agent-command='node webmcp/evals/actors/chat-completions-actor.mjs' \
 *     --agent-name='BestPrice WebMCP native harness' --agent-model=deepseek-chat ...
 *
 * Contract (native-run.mjs): stdin carries {prompt, url, tools, transcript}; stdout answers either
 * {"tool": name, "arguments": {...}} or {"terminal": {"type": "answer"|"refusal"|"clarification",
 * "text": "..."}}. The actor never sees expected tools, grading rules or the other language's prompt.
 *
 * Environment: WEBMCP_ACTOR_API_KEY (or DEEPSEEK_API_KEY), WEBMCP_ACTOR_ENDPOINT, WEBMCP_ACTOR_MODEL.
 * The model named here must match --agent-model; native-run records the latter.
 */

const ENDPOINT = process.env.WEBMCP_ACTOR_ENDPOINT || 'https://api.deepseek.com/chat/completions';
const MODEL = process.env.WEBMCP_ACTOR_MODEL || 'deepseek-chat';
const API_KEY = process.env.WEBMCP_ACTOR_API_KEY || process.env.DEEPSEEK_API_KEY;
const TIMEOUT_MS = 90_000;
const MAX_RESULT_CHARS = 6000;
const FINISH = 'finish_task';

const SYSTEM = [
  'You operate the BestPrice web page that is open in the shopper’s browser, only through the tools that page registered.',
  'Call one tool per turn. When the task is done, cannot be done, or needs the shopper to decide, call finish_task.',
  'Do not change the page — navigate, filter, sort or mark an offer — unless the task asks for it, and finish as soon as the results answer the task.',
  'Base every statement on tool results you received; never invent prices, products, merchants or availability.',
  'If the page refused a call, or the request is outside what these tools can do, finish with a refusal that says why.',
  'If the request is ambiguous, finish with a clarification question.',
  'Answer in the language of the shopper’s task.',
].join(' ');

const readStdin = async () => {
  let text = '';
  for await (const chunk of process.stdin) text += chunk;
  return JSON.parse(text);
};

const finishTool = {
  type: 'function',
  function: {
    name: FINISH,
    description: 'End the task with a final answer, a refusal, or a clarification question for the shopper.',
    parameters: {
      type: 'object',
      properties: {
        type: { type: 'string', enum: ['answer', 'refusal', 'clarification'] },
        text: { type: 'string', minLength: 1 },
      },
      required: ['type', 'text'],
      additionalProperties: false,
    },
  },
};

const pageTool = tool => ({
  type: 'function',
  function: {
    name: tool.name,
    description: String(tool.description || '').slice(0, 1000),
    parameters:
      tool.inputSchema && typeof tool.inputSchema === 'object'
        ? tool.inputSchema
        : { type: 'object', properties: {}, additionalProperties: false },
  },
});

/* What each earlier call returned, including a navigation that replaced the page before it could. */
const observation = entry => {
  const body =
    entry.result ??
    (entry.payloadStatus === 'lost_to_navigation'
      ? {
          note: 'The page navigated before this call could return a result.',
          navigatedTo: entry.navigatedTo ?? null,
        }
      : { note: 'No result was returned.', error: entry.error ?? null });
  const text = JSON.stringify(body);
  return text.length > MAX_RESULT_CHARS
    ? `${text.slice(0, MAX_RESULT_CHARS)}…(truncated by the actor)`
    : text;
};

const messagesFor = request => {
  const messages = [
    { role: 'system', content: SYSTEM },
    { role: 'user', content: `Shopper task: ${request.prompt}\nThe browser is on: ${request.url}` },
  ];
  for (const entry of request.transcript ?? []) {
    const id = `call_${entry.step}`;
    messages.push({
      role: 'assistant',
      content: null,
      tool_calls: [
        {
          id,
          type: 'function',
          function: { name: entry.tool, arguments: JSON.stringify(entry.arguments ?? {}) },
        },
      ],
    });
    messages.push({ role: 'tool', tool_call_id: id, content: observation(entry) });
  }
  if ((request.transcript ?? []).length) {
    messages.push({ role: 'user', content: `The browser is now on: ${request.url}` });
  }
  return messages;
};

const main = async () => {
  if (!API_KEY) throw new Error('set WEBMCP_ACTOR_API_KEY or DEEPSEEK_API_KEY');
  const request = await readStdin();
  const response = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${API_KEY}` },
    body: JSON.stringify({
      model: MODEL,
      messages: messagesFor(request),
      tools: [...(request.tools ?? []).map(pageTool), finishTool],
      tool_choice: 'required',
    }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!response.ok)
    throw new Error(`model HTTP ${response.status}: ${(await response.text()).slice(0, 300)}`);
  const message = (await response.json())?.choices?.[0]?.message;
  const call = message?.tool_calls?.[0]?.function;
  if (!call) {
    const text = typeof message?.content === 'string' ? message.content.trim() : '';
    if (!text) throw new Error('the model answered with neither a tool call nor text');
    process.stdout.write(JSON.stringify({ terminal: { type: 'answer', text } }));
    return;
  }
  let args;
  try {
    args = call.arguments ? JSON.parse(call.arguments) : {};
  } catch {
    throw new Error(`the model sent unparseable arguments for ${call.name}`);
  }
  if (call.name === FINISH) {
    process.stdout.write(JSON.stringify({ terminal: { type: args.type, text: String(args.text ?? '') } }));
    return;
  }
  process.stdout.write(JSON.stringify({ tool: call.name, arguments: args }));
};

main().catch(error => {
  process.stderr.write(`${error.message}\n`);
  process.exit(1);
});
