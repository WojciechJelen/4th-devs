# 01_02_tools

Minimal function calling with the Responses API — the model calls a single weather tool and uses the result to answer the user.

## Run

```bash
bun run lesson2:minimal
```

## What it does

1. Defines one tool: `get_weather`
2. Sends the user message and tool definition to the Responses API
3. Checks whether the model requested a tool call
4. Executes the tool in regular JavaScript
5. Sends the tool result back to the model
6. Prints the final natural-language answer

## Tools

| Tool | Description |
|------|-------------|
| `get_weather` | Return mock weather data for a city |
