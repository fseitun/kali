/**
 * Appends a reward item/instrument to an inventory-like state value.
 *
 * @param current - Current inventory value from state
 * @param entry - New entry to append
 * @returns A normalized inventory array containing the appended entry
 */
export function appendInventoryEntry(current: unknown, entry: string): unknown[] {
  return Array.isArray(current) ? [...current, entry] : [entry];
}

/**
 * Removes the first matching protection item from an inventory value.
 *
 * @param current - Current inventory value from state
 * @param itemName - Item name to consume
 * @returns Result with updated inventory and whether an item was consumed
 */
export function consumeProtectionItem(
  current: unknown,
  itemName: string,
): { nextItems: unknown[]; consumed: boolean } {
  if (!Array.isArray(current)) {
    return { nextItems: [], consumed: false };
  }
  const index = current.indexOf(itemName);
  if (index < 0) {
    return { nextItems: [...current], consumed: false };
  }
  const nextItems = [...current];
  nextItems.splice(index, 1);
  return { nextItems, consumed: true };
}

/**
 * Increments a numeric counter-like value from state with fallback to zero.
 *
 * @param current - Current numeric-like value
 * @returns Incremented number
 */
export function incrementCounter(current: unknown): number {
  return (typeof current === "number" ? current : 0) + 1;
}
