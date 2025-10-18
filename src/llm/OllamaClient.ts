import { ILLMClient } from './ILLMClient'
import { GameState, PrimitiveAction } from '../orchestrator/types'
import { CONFIG } from '../config'
import { Logger } from '../utils/logger'
import { buildSystemPrompt } from './system-prompt'

/**
 * Ollama LLM client implementation that communicates with a local Ollama instance.
 */
export class OllamaClient implements ILLMClient {
  private systemPrompt: string = ''

  setGameRules(rules: string): void {
    this.systemPrompt = buildSystemPrompt(rules)
    Logger.info('System prompt updated with game rules')
  }

  async getActions(transcript: string, state: GameState): Promise<PrimitiveAction[]> {
    if (!this.systemPrompt) {
      throw new Error('Game rules not set. Call setGameRules() first.')
    }

    try {
      const userMessage = `Current State: ${JSON.stringify(state)}\n\nUser Command: "${transcript}"`

      const response = await fetch(CONFIG.OLLAMA.API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: CONFIG.OLLAMA.MODEL,
          messages: [
            { role: 'system', content: this.systemPrompt },
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
      Logger.error('OllamaClient error:', error)
      return []
    }
  }

  private extractActions(content: string): PrimitiveAction[] {
    try {
      const markdownMatch = content.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/)
      const jsonString = markdownMatch ? markdownMatch[1].trim() : content.trim()

      const parsed = JSON.parse(jsonString)

      if (!Array.isArray(parsed)) {
        Logger.error('LLM response is not an array:', parsed)
        return []
      }

      return parsed as PrimitiveAction[]

    } catch (error) {
      Logger.error('Failed to parse LLM response:', error)
      Logger.error('Raw content:', content)
      return []
    }
  }
}
