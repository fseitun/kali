import { ILLMClient } from './ILLMClient'
import { GameState, PrimitiveAction } from '../orchestrator/types'
import { CONFIG } from '../config'
import { Logger } from '../utils/logger'
import { Profiler } from '../utils/profiler'
import { buildSystemPrompt } from './system-prompt'

export class GeminiClient implements ILLMClient {
  private systemPrompt: string = ''

  setGameRules(rules: string): void {
    this.systemPrompt = buildSystemPrompt(rules)
    Logger.info('System prompt updated with game rules')
  }

  async getActions(transcript: string, state: GameState): Promise<PrimitiveAction[]> {
    if (!this.systemPrompt) {
      throw new Error('Game rules not set. Call setGameRules() first.')
    }

    if (!CONFIG.GEMINI.API_KEY) {
      throw new Error('VITE_GEMINI_API_KEY not set in environment')
    }

    try {
      const userMessage = `Current State: ${JSON.stringify(state)}\n\nUser Command: "${transcript}"`
      const fullPrompt = `${this.systemPrompt}\n\n${userMessage}`

      Profiler.start('llm.network')
      const response = await fetch(CONFIG.GEMINI.API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-goog-api-key': CONFIG.GEMINI.API_KEY,
        },
        body: JSON.stringify({
          contents: [{
            parts: [{
              text: fullPrompt
            }]
          }],
          generationConfig: {
            temperature: 0.7,
            maxOutputTokens: 1024,
          }
        })
      })

      if (!response.ok) {
        Profiler.end('llm.network')
        const errorText = await response.text()
        throw new Error(`Gemini API error: ${response.status} ${response.statusText}\n${errorText}`)
      }

      const data = await response.json()
      Profiler.end('llm.network')

      const content = data.candidates?.[0]?.content?.parts?.[0]?.text || ''

      if (!content) {
        Logger.error('No content in Gemini response:', data)
        return []
      }

      Profiler.start('llm.parsing')
      const actions = this.extractActions(content)
      Profiler.end('llm.parsing')

      return actions

    } catch (error) {
      Logger.error('GeminiClient error:', error)
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
