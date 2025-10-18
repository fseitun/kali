import { ILLMClient } from './ILLMClient'
import { GameState, PrimitiveAction } from '../orchestrator/types'

const SYSTEM_PROMPT = `You are Kali, a voice-controlled game moderator. Your job is to interpret voice commands and return primitive actions as JSON.

You must respond with a JSON array wrapped in markdown code blocks. Each action must be one of:

1. WRITE_STATE - Update game state
   { "action": "WRITE_STATE", "path": "game.counter", "value": 5 }

2. READ_STATE - Read game state (for reference)
   { "action": "READ_STATE", "path": "game.counter" }

3. NARRATE - Speak text to the user via TTS
   { "action": "NARRATE", "text": "The counter is now set to 5" }

Rules:
- Paths use dot notation: "game.counter", "player.health"
- Always NARRATE confirmation of actions
- Return ONLY the JSON array in markdown format
- Example response:

\`\`\`json
[
  { "action": "WRITE_STATE", "path": "game.counter", "value": 5 },
  { "action": "NARRATE", "text": "Counter set to 5" }
]
\`\`\`
`

export class OllamaClient implements ILLMClient {
  private readonly apiUrl = 'http://localhost:11434/api/chat'
  private readonly model = 'llama3.2:latest'

  async getActions(transcript: string, state: GameState): Promise<PrimitiveAction[]> {
    try {
      const userMessage = `Current State: ${JSON.stringify(state)}\n\nUser Command: "${transcript}"`

      const response = await fetch(this.apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: this.model,
          messages: [
            { role: 'system', content: SYSTEM_PROMPT },
            { role: 'user', content: userMessage }
          ],
          stream: false
        })
      })

      if (!response.ok) {
        throw new Error(`Ollama API error: ${response.status} ${response.statusText}`)
      }

      const data = await response.json()
      const content = data.message?.content || ''

      return this.extractActions(content)

    } catch (error) {
      console.error('OllamaClient error:', error)
      return []
    }
  }

  private extractActions(content: string): PrimitiveAction[] {
    try {
      const markdownMatch = content.match(/```json\n([\s\S]*?)\n```/)
      const jsonString = markdownMatch ? markdownMatch[1] : content

      const parsed = JSON.parse(jsonString)

      if (!Array.isArray(parsed)) {
        console.error('LLM response is not an array:', parsed)
        return []
      }

      return parsed as PrimitiveAction[]

    } catch (error) {
      console.error('Failed to parse LLM response:', error)
      console.error('Raw content:', content)
      return []
    }
  }
}
