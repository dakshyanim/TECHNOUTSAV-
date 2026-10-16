export function validateRegistration(input: unknown):
  | { ok: true; name: string; rollNumber: string }
  | { ok: false; message: string } {
  if (!input || typeof input !== 'object') return { ok: false, message: 'Enter your name and roll number.' };
  const value = input as Record<string, unknown>;
  if (typeof value.name !== 'string' || typeof value.rollNumber !== 'string') {
    return { ok: false, message: 'Enter your name and roll number.' };
  }
  const name = value.name.trim().replace(/\s+/gu, ' ');
  const rollNumber = value.rollNumber.trim().toUpperCase();
  if (name.length < 2 || name.length > 100 || !/\p{L}/u.test(name) || /[\p{Cc}\p{Cf}]/u.test(name)) {
    return { ok: false, message: 'Enter a name of 2–100 characters containing letters.' };
  }
  if (!/^[A-Z0-9][A-Z0-9/_-]{1,49}$/.test(rollNumber)) {
    return { ok: false, message: 'Enter a roll number of 2–50 letters, numbers, slashes, underscores, or hyphens.' };
  }
  return { ok: true, name, rollNumber };
}
