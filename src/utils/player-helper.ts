export function getPlayerIndex(playerId: string): number {
  const match = playerId.match(/^p(\d+)$/)
  if (!match) {
    throw new Error(`Invalid player ID format: ${playerId}. Expected format: p1, p2, p3, etc.`)
  }

  const playerNumber = parseInt(match[1], 10)
  if (playerNumber < 1) {
    throw new Error(`Invalid player number: ${playerNumber}. Must be >= 1`)
  }

  return playerNumber - 1
}

export function getPlayerId(index: number): string {
  if (index < 0) {
    throw new Error(`Invalid player index: ${index}. Must be >= 0`)
  }

  return `p${index + 1}`
}

export function getPlayerPath(playerId: string, field: string): string {
  const index = getPlayerIndex(playerId)
  return `players.${index}.${field}`
}
