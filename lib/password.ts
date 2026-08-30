// lib/password.ts

/**
 * Generates a secure, readable temporary password containing uppercase,
 * lowercase, numbers, and symbols, avoiding ambiguous characters (e.g. 0, O, 1, l).
 */
export function generateTemporaryPassword(length = 12): string {
  const minLength = Math.max(8, length);
  const lowercase = "abcdefghjkmnpqrstuvwxyz";
  const uppercase = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const numbers = "23456789";
  const symbols = "!@#$%&*";
  const all = lowercase + uppercase + numbers + symbols;

  const chars: string[] = [];

  if (typeof crypto !== "undefined" && crypto.getRandomValues) {
    const randomBuffer = new Uint32Array(minLength);
    crypto.getRandomValues(randomBuffer);

    chars.push(lowercase[randomBuffer[0] % lowercase.length]);
    chars.push(uppercase[randomBuffer[1] % uppercase.length]);
    chars.push(numbers[randomBuffer[2] % numbers.length]);
    chars.push(symbols[randomBuffer[3] % symbols.length]);

    for (let i = 4; i < minLength; i++) {
      chars.push(all[randomBuffer[i] % all.length]);
    }

    // Shuffle with remaining randomness
    const shuffleBuffer = new Uint32Array(chars.length);
    crypto.getRandomValues(shuffleBuffer);
    for (let i = chars.length - 1; i > 0; i--) {
      const j = shuffleBuffer[i] % (i + 1);
      [chars[i], chars[j]] = [chars[j], chars[i]];
    }
  } else {
    chars.push(lowercase[Math.floor(Math.random() * lowercase.length)]);
    chars.push(uppercase[Math.floor(Math.random() * uppercase.length)]);
    chars.push(numbers[Math.floor(Math.random() * numbers.length)]);
    chars.push(symbols[Math.floor(Math.random() * symbols.length)]);

    for (let i = 4; i < minLength; i++) {
      chars.push(all[Math.floor(Math.random() * all.length)]);
    }

    for (let i = chars.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [chars[i], chars[j]] = [chars[j], chars[i]];
    }
  }

  return chars.join("");
}
