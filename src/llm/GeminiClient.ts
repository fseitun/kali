import { ILLMClient } from './ILLMClient'
import { GameState, PrimitiveAction } from '../orchestrator/types'
import { CONFIG } from '../config'
import { Logger } from '../utils/logger'
import { Profiler } from '../utils/profiler'
import { buildSystemPrompt, formatStateContext } from './system-prompt'

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
      const stateContext = formatStateContext(state)
      const userMessage = `${stateContext}\n\nUser Command: "${transcript}"`
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

  /**
   * Extracts a person's name from conversational text using Gemini LLM.
   * @param transcript - The transcribed user input
   * @returns The extracted name, or null if extraction fails or no valid name found
   */
  async extractName(transcript: string): Promise<string | null> {
    if (!CONFIG.GEMINI.API_KEY) {
      Logger.error('VITE_GEMINI_API_KEY not set')
      return null
    }

    try {
      const prompt = `Extract the person's name from this text. If someone says 'call me X', 'my name is X', 'llámame X', 'me llamo X', 'I am X', 'soy X', or similar, return ONLY the name X as plain text. If the text is just a name with no preamble, return that name. If unclear or no name present, return the word "null". Do not explain, just return the name or "null".

Text: "${transcript}"

Name:`

      const response = await fetch(CONFIG.GEMINI.API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-goog-api-key': CONFIG.GEMINI.API_KEY,
        },
        body: JSON.stringify({
          contents: [{
            parts: [{
              text: prompt
            }]
          }],
          generationConfig: {
            temperature: 0.3,
            maxOutputTokens: 50,
          }
        })
      })

      if (!response.ok) {
        Logger.error('Gemini API error in extractName:', response.status)
        return null
      }

      const data = await response.json()
      const content = data.candidates?.[0]?.content?.parts?.[0]?.text || ''
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
   * Analyzes if user response is on-topic using Gemini LLM.
   * @param transcript - The transcribed user input
   * @param expectedContext - Description of what response is expected
   * @returns Analysis result, defaults to on-topic if LLM call fails
   */
  async analyzeResponse(transcript: string, expectedContext: string): Promise<{isOnTopic: boolean, urgentMessage?: string}> {
    if (!CONFIG.GEMINI.API_KEY) {
      Logger.error('VITE_GEMINI_API_KEY not set')
      return { isOnTopic: true }
    }

    try {
      const prompt = `Context: ${expectedContext}

User said: "${transcript}"

Analyze if the user's response is on-topic for the context. If it expresses something urgent, unexpected, or off-topic (like an injury, emergency, complaint, request for help, or anything unrelated to the question), return JSON with isOnTopic=false and a brief urgentMessage summarizing what they said. If it's a reasonable response to the context (even if wrong), return isOnTopic=true.

Return ONLY valid JSON in this format:
{"isOnTopic": true}
or
{"isOnTopic": false, "urgentMessage": "brief summary"}

JSON:`

      const response = await fetch(CONFIG.GEMINI.API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-goog-api-key': CONFIG.GEMINI.API_KEY,
        },
        body: JSON.stringify({
          contents: [{
            parts: [{
              text: prompt
            }]
          }],
          generationConfig: {
            temperature: 0.3,
            maxOutputTokens: 100,
          }
        })
      })

      if (!response.ok) {
        Logger.error('Gemini API error in analyzeResponse:', response.status)
        return { isOnTopic: true }
      }

      const data = await response.json()
      const content = data.candidates?.[0]?.content?.parts?.[0]?.text || ''

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
