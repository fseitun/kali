import { LLMClient } from './LLMClient'
import { GameState, PrimitiveAction } from '../orchestrator/types'
import { Logger } from '../utils/logger'
import { Profiler } from '../utils/profiler'
import { buildSystemPrompt, formatStateContext } from './system-prompt'

export interface ApiCallOptions {
  temperature?: number
  maxTokens?: number
}

export interface ApiCallResult {
  content: string
}

export abstract class BaseLLMClient implements LLMClient {
  protected systemPrompt: string = ''
  private lastTranscript: string = ''
  private lastTranscriptTime: number = 0
  private readonly deduplicationWindowMs = 2000

  abstract makeApiCall(prompt: string, options: ApiCallOptions): Promise<ApiCallResult>

  setGameRules(rules: string): void {
    this.systemPrompt = buildSystemPrompt(rules)
    Logger.info('System prompt updated with game rules')
  }

  async getActions(transcript: string, state: GameState): Promise<PrimitiveAction[]> {
    if (!this.systemPrompt) {
      throw new Error('Game rules not set. Call setGameRules() first.')
    }

    if (this.isDuplicate(transcript)) {
      Logger.debug('Duplicate request detected, ignoring')
      return []
    }

    const maxRetries = 3
    const retryDelays = [500, 1000, 2000]

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        const actions = await this.attemptLLMCall(transcript, state)

        if (actions.length > 0) {
          this.recordTranscript(transcript)
          return actions
        }

        if (attempt < maxRetries - 1) {
          Logger.info(`LLM returned empty actions, retrying (attempt ${attempt + 1}/${maxRetries})`)
          await this.sleep(retryDelays[attempt])
        }
      } catch (error) {
        const willRetry = attempt < maxRetries - 1
        Logger.error(`LLM attempt ${attempt + 1} failed:`, error)

        if (willRetry) {
          Logger.info(`Retrying in ${retryDelays[attempt]}ms...`)
          await this.sleep(retryDelays[attempt])
        }
      }
    }

    Logger.warn('All LLM retries exhausted')
    return []
  }

  private async attemptLLMCall(transcript: string, state: GameState): Promise<PrimitiveAction[]> {
    const stateContext = formatStateContext(state)
    const userMessage = `${stateContext}\n\nUser Command: "${transcript}"`
    const fullPrompt = `${this.systemPrompt}\n\n${userMessage}`

    Profiler.start('llm.network')
    const result = await this.makeApiCall(fullPrompt, {
      temperature: 0.7,
      maxTokens: 1024,
    })
    Profiler.end('llm.network')

    const content = result.content

    if (!content) {
      Logger.error('No content in LLM response')
      return []
    }

    Profiler.start('llm.parsing')
    const actions = this.extractActions(content)
    Profiler.end('llm.parsing')

    return actions
  }

  async extractName(transcript: string): Promise<string | null> {
    try {
      const prompt = `Extract the person's name from this text. If someone says 'call me X', 'my name is X', 'llámame X', 'me llamo X', 'I am X', 'soy X', or similar, return ONLY the name X as plain text. If the text is just a name with no preamble, return that name. If unclear or no name present, return the word "null". Do not explain, just return the name or "null".

Text: "${transcript}"

Name:`

      const result = await this.makeApiCall(prompt, {
        temperature: 0.3,
        maxTokens: 50,
      })

      const content = result.content
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

      const result = await this.makeApiCall(prompt, {
        temperature: 0.3,
        maxTokens: 100,
      })

      const content = result.content

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

  protected extractActions(content: string): PrimitiveAction[] {
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

  private isDuplicate(transcript: string): boolean {
    const now = Date.now()
    const timeSinceLastRequest = now - this.lastTranscriptTime

    if (
      transcript.toLowerCase() === this.lastTranscript.toLowerCase() &&
      timeSinceLastRequest < this.deduplicationWindowMs
    ) {
      return true
    }

    return false
  }

  private recordTranscript(transcript: string): void {
    this.lastTranscript = transcript
    this.lastTranscriptTime = Date.now()
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms))
  }
}
