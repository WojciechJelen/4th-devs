import {
  AI_API_KEY,
  EXTRA_API_HEADERS,
  RESPONSES_API_ENDPOINT,
  resolveModelForProvider,
} from "../config.js";
import {
  buildNextConversation,
  getFinalText,
  getToolCalls,
  logAnswer,
  logQuestion,
} from "./helper.js";

const model = resolveModelForProvider("gpt-4.1-mini");

/*
  Step 1: Define tools the model can call.
  Each tool is a JSON Schema describing the function name, purpose, and expected arguments.
  The model never runs these — it only decides *when* to call them and *with what arguments*.
*/
const tools = [
  {
    type: "function",
    name: "get_weather",
    description: "Get current weather for a given location",
    parameters: {
      type: "object",
      properties: {
        location: { type: "string", description: "City name" },
      },
      required: ["location"],
      additionalProperties: false,
    },
    strict: true,
  },
];

/*
  Step 2: Implement the actual logic behind each tool.
  This is regular code — the model has no access to it.
  Here we just return hardcoded data; in a real app this would call an external API.
*/
const handlers = {
  get_weather({ location }) {
    const weather = {
      "Kraków": { temp: -2, conditions: "snow" },
      "London": { temp: 8, conditions: "rain" },
      "Tokyo": { temp: 15, conditions: "cloudy" },
    };
    return weather[location] ?? { temp: null, conditions: "unknown" };
  },
};

/* Step 3: Send messages + tool definitions to the Responses API */
const requestResponse = async (input) => {
  const response = await fetch(RESPONSES_API_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${AI_API_KEY}`,
      ...EXTRA_API_HEADERS,
    },
    body: JSON.stringify({ model, tools, input }),
  });

  const data = await response.json();
  if (!response.ok) throw new Error(data?.error?.message ?? `Request failed (${response.status})`);
  return data;
};

const MAX_TOOL_STEPS = 5;

/*
  Step 4: Run the tool-calling workflow.

  This is not a full autonomous agent.
  It is a small tool-using workflow:

  USER question → model response → optional tool call → tool result → model response

  If the model asks for tools, we execute them and continue.
  If the model answers normally, we return that final text.
*/
const chat = async (conversation) => {
  let currentConversation = conversation;
  let stepsRemaining = MAX_TOOL_STEPS;

  while (stepsRemaining > 0) {
    stepsRemaining -= 1;

    const response = await requestResponse(currentConversation);
    const toolCalls = getToolCalls(response);

    if (toolCalls.length === 0) {
      return getFinalText(response);
    }

    currentConversation = await buildNextConversation(currentConversation, toolCalls, handlers);
  }

  throw new Error(`Tool calling did not finish within ${MAX_TOOL_STEPS} steps.`);
};

const query = "What's the weather in Kraków?";
logQuestion(query);

const answer = await chat([{ role: "user", content: query }]);
logAnswer(answer);
