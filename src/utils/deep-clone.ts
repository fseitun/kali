/**
 * Creates a deep clone of an object, handling nested objects, arrays, and dates.
 * @param obj - The object to clone
 * @returns A deep copy of the object
 */
export function deepClone<T>(obj: T): T {
  if (obj === null || typeof obj !== 'object') {
    return obj
  }

  if (obj instanceof Date) {
    return new Date(obj.getTime()) as T
  }

  if (obj instanceof Array) {
    const clonedArr: unknown[] = []
    for (const item of obj) {
      clonedArr.push(deepClone(item))
    }
    return clonedArr as T
  }

  if (obj instanceof Object) {
    const clonedObj: Record<string, unknown> = {}
    for (const key in obj) {
      if (Object.prototype.hasOwnProperty.call(obj, key)) {
        clonedObj[key] = deepClone(obj[key])
      }
    }
    return clonedObj as T
  }

  return obj
}
