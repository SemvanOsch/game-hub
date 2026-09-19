/** Generates short, human-readable room codes (e.g. "K7P4Q").
 *  Uses an unambiguous alphabet (no O/0, I/1) to reduce typos. */

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
const CODE_LENGTH = 5

export function generateRoomCode(): string {
  let code = ''
  for (let i = 0; i < CODE_LENGTH; i++) {
    code += ALPHABET[Math.floor(Math.random() * ALPHABET.length)]
  }
  return code
}

/** Generate a code not present in `taken`, giving up after many attempts. */
export function generateUniqueRoomCode(taken: Set<string>): string {
  for (let attempt = 0; attempt < 1000; attempt++) {
    const code = generateRoomCode()
    if (!taken.has(code)) return code
  }
  throw new Error('Unable to allocate a unique room code')
}

/** Normalize user-entered codes (trim, uppercase). */
export function normalizeCode(input: string): string {
  return input.trim().toUpperCase()
}
