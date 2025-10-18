import { ILLMClient } from './ILLMClient'
import { GameState, PrimitiveAction } from '../orchestrator/types'
import { CONFIG } from '../config'
import { Logger } from '../utils/logger'
import { Profiler } from '../utils/profiler'
import { buildSystemPrompt, formatStateContext } from './system-prompt'

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
      const stateContext = formatStateContext(state)
      const userMessage = `${stateContext}\n\nUser Command: "${transcript}"`

      Profiler.start('llm.network')
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
        Profiler.end('llm.network')
        throw new Error(`Ollama API error: ${response.status} ${response.statusText}`)
      }

      const data = await response.json()
      Profiler.end('llm.network')

      const content = data.message?.content || ''

      Profiler.start('llm.parsing')
      const actions = this.extractActions(content)
      Profiler.end('llm.parsing')

      return actions

    } catch (error) {
      Logger.error('OllamaClient error:', error)
      return []
    }
  }

  /**
   * Extracts a person's name from conversational text using Ollama LLM.
   * @param transcript - The transcribed user input
   * @returns The extracted name, or null if extraction fails or no valid name found
   */
  async extractName(transcript: string): Promise<string | null> {
    try {
      const prompt = `Extract the person's name from this text. If someone says 'call me X', 'my name is X', 'llámame X', 'me llamo X', 'I am X', 'soy X', or similar, return ONLY the name X as plain text. If the text is just a name with no preamble, return that name. If unclear or no name present, return the word "null". Do not explain, just return the name or "null".

Text: "${transcript}"

Name:`

      const response = await fetch(CONFIG.OLLAMA.API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: CONFIG.OLLAMA.MODEL,
          messages: [
            { role: 'user', content: prompt }
          ],
          stream: false,
          options: {
            temperature: 0.3,
            num_predict: 50
          }
        })
      })

      if (!response.ok) {
        Logger.error('Ollama API error in extractName:', response.status)
        return null
      }

      const data = await response.json()
      const content = data.message?.content || ''
      const cleaned = content.trim().toLowerCase()

      if (cleaned === 'null' || cleaned === '' || cleaned.length > 50) {
        return null
      }

      return content.trim()

    } catch (error) {
      Logger.error('extractName error:', error)
      return null
    }
  }

  /**
   * Analyzes if user response is on-topic using Ollama LLM.
   * @param transcript - The transcribed user input
   * @param expectedContext - Description of what response is expected
   * @returns Analysis result, defaults to on-topic if LLM call fails
   */
  async analyzeResponse(transcript: string, expectedContext: string): Promise<{isOnTopic: boolean, urgentMessage?: string}> {
    try {
      const prompt = `Context: ${expectedContext}

User said: "${transcript}"

Analyze if the user's response is on-topic for the context. If it expresses something urgent, unexpected, or off-topic (like an injury, emergency, complaint, request for help, or anything unrelated to the question), return JSON with isOnTopic=false and a brief urgentMessage summarizing what they said. If it's a reasonable response to the context (even if wrong), return isOnTopic=true.

Return ONLY valid JSON in this format:
{"isOnTopic": true}
or
{"isOnTopic": false, "urgentMessage": "brief summary"}

JSON:`

      const response = await fetch(CONFIG.OLLAMA.API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: CONFIG.OLLAMA.MODEL,
          messages: [
            { role: 'user', content: prompt }
          ],
          stream: false,
          options: {
            temperature: 0.3,
            num_predict: 100
          }
        })
      })

      if (!response.ok) {
        Logger.error('Ollama API error in analyzeResponse:', response.status)
        return { isOnTopic: true }
      }

      const data = await response.json()
      const content = data.message?.content || ''

      const markdownMatch = content.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/)
      const jsonString = markdownMatch ? markdownMatch[1].trim() : content.trim()

      const parsed = JSON.parse(jsonString)

      return {
        isOnTopic: parsed.isOnTopic !== false,
        urgentMessage: parsed.urgentMessage
      }

    } catch (error) {
      Logger.error('analyzeResponse error:', error)
      return { isOnTopic: true }
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
