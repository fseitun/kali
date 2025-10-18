/**
 * Utility functions for player name validation, conflict detection, and nickname generation.
 */

const KIND_NICKNAMES = [
  'the Great',
  'the Wise',
  'the Brave',
  'the Kind',
  'the Swift',
  'the Clever',
  'the Bold',
  'the Mighty',
  'the Brilliant',
  'the Awesome',
  'the Cool',
  'the Amazing',
  'Junior',
  'Senior',
  'Big',
  'Little'
]

/**
 * Validates a player name for acceptability.
 * @param name - The name to validate
 * @returns Object with valid flag and cleaned name
 */
export function validateName(name: string): { valid: boolean; cleaned: string } {
  if (!name || typeof name !== 'string') {
    return { valid: false, cleaned: '' }
  }

  let cleaned = name.trim()

  if (cleaned.length === 0) {
    return { valid: false, cleaned: '' }
  }

  if (cleaned.length > 20) {
    cleaned = cleaned.substring(0, 20)
  }

  const lowerName = cleaned.toLowerCase()
  const inappropriateWords = ['fuck', 'shit', 'damn', 'ass', 'bitch']
  for (const word of inappropriateWords) {
    if (lowerName.includes(word)) {
      return { valid: false, cleaned: '' }
    }
  }

  cleaned = cleaned.replace(/[^a-zA-Z0-9\s\-']/g, '')

  if (cleaned.length === 0) {
    return { valid: false, cleaned: '' }
  }

  return { valid: true, cleaned }
}

/**
 * Calculates Levenshtein distance between two strings.
 * @param str1 - First string
 * @param str2 - Second string
 * @returns Edit distance
 */
function levenshteinDistance(str1: string, str2: string): number {
  const m = str1.length
  const n = str2.length
  const dp: number[][] = Array(m + 1).fill(null).map(() => Array(n + 1).fill(0))

  for (let i = 0; i <= m; i++) dp[i][0] = i
  for (let j = 0; j <= n; j++) dp[0][j] = j

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (str1[i - 1] === str2[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1]
      } else {
        dp[i][j] = Math.min(
          dp[i - 1][j] + 1,
          dp[i][j - 1] + 1,
          dp[i - 1][j - 1] + 1
        )
      }
    }
  }

  return dp[m][n]
}

/**
 * Checks if two names are too similar.
 * @param name1 - First name
 * @param name2 - Second name
 * @returns True if names are similar
 */
export function areNamesSimilar(name1: string, name2: string): boolean {
  const lower1 = name1.toLowerCase()
  const lower2 = name2.toLowerCase()

  if (lower1 === lower2) {
    return true
  }

  const distance = levenshteinDistance(lower1, lower2)
  const maxLength = Math.max(lower1.length, lower2.length)

  return distance <= 2 || distance / maxLength < 0.3
}

/**
 * Generates a kind nickname for a player.
 * @param baseName - The base name to build on
 * @param usedNicknames - Already used nicknames to avoid duplicates
 * @returns A unique nickname
 */
export function generateNickname(baseName: string, usedNicknames: string[]): string {
  const availableNicknames = KIND_NICKNAMES.filter(
    suffix => !usedNicknames.includes(`${baseName} ${suffix}`)
  )

  if (availableNicknames.length > 0) {
    const randomIndex = Math.floor(Math.random() * availableNicknames.length)
    return `${baseName} ${availableNicknames[randomIndex]}`
  }

  const number = usedNicknames.filter(n => n.startsWith(baseName)).length + 1
  return `${baseName} ${number}`
}

/**
 * Finds conflicts in a list of names.
 * @param names - Array of player names
 * @returns Array of indices that have conflicts
 */
export function findNameConflicts(names: string[]): number[] {
  const conflicts: number[] = []

  for (let i = 0; i < names.length; i++) {
    for (let j = i + 1; j < names.length; j++) {
      if (areNamesSimilar(names[i], names[j])) {
        if (!conflicts.includes(i)) conflicts.push(i)
        if (!conflicts.includes(j)) conflicts.push(j)
      }
    }
  }

  return conflicts
}
