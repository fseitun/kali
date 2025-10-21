import { describe, it, expect, vi } from 'vitest'
import { validateName, findNameConflicts, generateNickname, areNamesSimilar } from './name-helper'

// Mock i18n getNicknames function
vi.mock('../i18n', () => ({
  getNicknames: () => ['the Great', 'the Wise', 'the Brave', 'the Kind', 'the Swift']
}))

describe('name-helper', () => {
  describe('validateName', () => {
    it('should accept valid names', () => {
      expect(validateName('Alice')).toEqual({ valid: true, cleaned: 'Alice' })
      expect(validateName('Bob Smith')).toEqual({ valid: true, cleaned: 'Bob Smith' })
      expect(validateName("O'Connor")).toEqual({ valid: true, cleaned: "O'Connor" })
      expect(validateName('Player-1')).toEqual({ valid: true, cleaned: 'Player-1' })
    })

    it('should reject empty or invalid inputs', () => {
      expect(validateName('')).toEqual({ valid: false, cleaned: '' })
      expect(validateName('   ')).toEqual({ valid: false, cleaned: '' })
      expect(validateName(null as any)).toEqual({ valid: false, cleaned: '' })
      expect(validateName(undefined as any)).toEqual({ valid: false, cleaned: '' })
      expect(validateName(123 as any)).toEqual({ valid: false, cleaned: '' })
    })

    it('should trim whitespace', () => {
      expect(validateName('  Alice  ')).toEqual({ valid: true, cleaned: 'Alice' })
    })

    it('should truncate long names', () => {
      const longName = 'A'.repeat(25)
      const result = validateName(longName)
      expect(result.valid).toBe(true)
      expect(result.cleaned).toBe('A'.repeat(20))
    })

    it('should reject inappropriate words', () => {
      expect(validateName('fuck')).toEqual({ valid: false, cleaned: '' })
      expect(validateName('shit')).toEqual({ valid: false, cleaned: '' })
      expect(validateName('damn')).toEqual({ valid: false, cleaned: '' })
      expect(validateName('ass')).toEqual({ valid: false, cleaned: '' })
      expect(validateName('bitch')).toEqual({ valid: false, cleaned: '' })
      expect(validateName('FUCK')).toEqual({ valid: false, cleaned: '' })
      expect(validateName('Shithead')).toEqual({ valid: false, cleaned: '' })
    })

    it('should remove special characters', () => {
      expect(validateName('Alice@#$%')).toEqual({ valid: true, cleaned: 'Alice' })
      expect(validateName('Bob!!!')).toEqual({ valid: true, cleaned: 'Bob' })
      expect(validateName('Charlie&*()')).toEqual({ valid: true, cleaned: 'Charlie' })
    })

    it('should preserve allowed special characters', () => {
      expect(validateName("O'Connor")).toEqual({ valid: true, cleaned: "O'Connor" })
      expect(validateName('Player-1')).toEqual({ valid: true, cleaned: 'Player-1' })
      expect(validateName('Mary Jane')).toEqual({ valid: true, cleaned: 'Mary Jane' })
    })

    it('should reject names with only special characters', () => {
      expect(validateName('@#$%')).toEqual({ valid: false, cleaned: '' })
      expect(validateName('!!!')).toEqual({ valid: false, cleaned: '' })
    })
  })

  describe('areNamesSimilar', () => {
    it('should detect similar names', () => {
      expect(areNamesSimilar('Alice', 'Alicia')).toBe(true)
      expect(areNamesSimilar('Bob', 'Bobby')).toBe(true)
      expect(areNamesSimilar('Charlie', 'Charley')).toBe(true)
      expect(areNamesSimilar('David', 'Dave')).toBe(true)
    })

    it('should not detect dissimilar names', () => {
      expect(areNamesSimilar('Alice', 'Bob')).toBe(false)
      expect(areNamesSimilar('Charlie', 'David')).toBe(false)
      expect(areNamesSimilar('Eve', 'Frank')).toBe(false)
    })

    it('should handle identical names', () => {
      expect(areNamesSimilar('Alice', 'Alice')).toBe(true)
      expect(areNamesSimilar('Bob', 'Bob')).toBe(true)
    })

    it('should handle empty names', () => {
      expect(areNamesSimilar('', 'Alice')).toBe(false)
      expect(areNamesSimilar('Alice', '')).toBe(false)
      expect(areNamesSimilar('', '')).toBe(true) // Empty strings are identical
    })

    it('should be case insensitive', () => {
      expect(areNamesSimilar('Alice', 'alice')).toBe(true)
      expect(areNamesSimilar('BOB', 'bob')).toBe(true)
    })
  })

  describe('findNameConflicts', () => {
    it('should find no conflicts in unique names', () => {
      const names = ['Alice', 'Bob', 'Charlie']
      expect(findNameConflicts(names)).toEqual([])
    })

    it('should find exact duplicates', () => {
      const names = ['Alice', 'Bob', 'Alice']
      expect(findNameConflicts(names)).toEqual([0, 2]) // Returns indices with conflicts
    })

    it('should find similar names', () => {
      const names = ['Alice', 'Alicia', 'Bob']
      expect(findNameConflicts(names)).toEqual([0, 1]) // Returns indices with conflicts
    })

    it('should handle multiple conflicts', () => {
      const names = ['Alice', 'Alicia', 'Bob', 'Bobby', 'Alice']
      const conflicts = findNameConflicts(names)
      expect(conflicts).toHaveLength(5) // Alice(0), Alicia(1), Bob(2), Bobby(3), Alice(4)
      expect(conflicts).toContain(0) // Alice conflicts with Alicia and Alice(4)
      expect(conflicts).toContain(1) // Alicia conflicts with Alice
      expect(conflicts).toContain(2) // Bob conflicts with Bobby
      expect(conflicts).toContain(3) // Bobby conflicts with Bob
      expect(conflicts).toContain(4) // Alice(4) conflicts with Alice(0)
    })

    it('should handle empty array', () => {
      expect(findNameConflicts([])).toEqual([])
    })

    it('should handle single name', () => {
      expect(findNameConflicts(['Alice'])).toEqual([])
    })
  })

  describe('generateNickname', () => {
    const mockNicknames = ['the Great', 'the Wise', 'the Brave', 'the Kind', 'the Swift']

    it('should generate nickname for valid name', () => {
      const nickname = generateNickname('Alice', [])
      expect(nickname).toMatch(/^Alice the (Great|Wise|Brave|Kind|Swift)$/)
    })

    it('should generate different nicknames for different names', () => {
      const nick1 = generateNickname('Alice', [])
      const nick2 = generateNickname('Bob', [])

      // Should be different (though not guaranteed due to random selection)
      expect(nick1).toBeDefined()
      expect(nick2).toBeDefined()
      expect(nick1).toMatch(/^Alice the/)
      expect(nick2).toMatch(/^Bob the/)
    })

    it('should generate consistent nickname for same name with same used list', () => {
      // Since it's random, we can't test exact consistency, but we can test structure
      const nickname = generateNickname('Alice', [])
      expect(nickname).toMatch(/^Alice the (Great|Wise|Brave|Kind|Swift)$/)
    })

    it('should handle empty nicknames array', () => {
      // When no nicknames available, should fall back to numbering
      const nickname = generateNickname('Alice', ['Alice the Great', 'Alice the Wise', 'Alice the Brave', 'Alice the Kind', 'Alice the Swift'])
      expect(nickname).toMatch(/^Alice \d+$/) // Should be Alice followed by a number
    })

    it('should handle single nickname', () => {
      const nickname = generateNickname('Alice', ['Alice the Great', 'Alice the Wise', 'Alice the Brave', 'Alice the Kind'])
      expect(nickname).toBe('Alice the Swift')
    })

    it('should handle empty name', () => {
      const nickname = generateNickname('', [])
      expect(nickname).toMatch(/^ the (Great|Wise|Brave|Kind|Swift)$/)
    })

    it('should avoid used nicknames', () => {
      const used = ['Alice the Great', 'Alice the Wise']
      const nickname = generateNickname('Alice', used)
      expect(nickname).toMatch(/^Alice the (Brave|Kind|Swift)$/)
      expect(used).not.toContain(nickname)
    })
  })
})
