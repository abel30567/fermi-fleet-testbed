/**
 * Arbitrary-precision decimal string cube root (`cbrt`) with configurable
 * fractional decimal precision and exact round-half-to-even semantics.
 *
 * Numerical robustness guarantees:
 * - Zero IEEE-754 overflow/underflow: parses decimal strings directly into
 *   exact BigInt mantissa and exponent, using bit-length scaling for initial
 *   approximations so arbitrarily large (> 1e308) or tiny (< 1e-308) inputs
 *   never lose precision or overflow to Infinity.
 * - Provably exact error bounds: Newton-Raphson iteration starts from a
 *   guaranteed upper bound and finishes with an explicit exact integer bracket
 *   check (`q^3 <= N < (q + 1)^3`).
 * - Immune to the table-maker's dilemma: rounding compares exact scaled cubes
 *   (`8 * M * 10^S` vs `(2q + 1)^3` or `8 * M` vs `10^(-S) * (2q + 1)^3`),
 *   guaranteeing `|result - cbrt(value)| <= 0.5 * 10^(-precision)` with exact
 *   round-half-to-even tie-breaking.
 *
 * @module ops/powers-roots/cbrtDecimalStable
 */

const DECIMAL_RE = /^([+-])?(?:(\d+)(?:\.(\d*))?|\.(\d+))(?:[eE]([+-]?\d+))?$/;

/**
 * Safety limit on the scaled radicand decimal digit count (`mDigits + E + 3p`),
 * capping result magnitude around 1,000,000 digits to prevent runaway memory
 * allocation on astronomical exponents such as `"1e1000000000"`.
 */
const MAX_SCALED_DIGITS = 3_000_000n;

/**
 * Computes the exact binary bit length of a non-negative BigInt.
 *
 * @param {bigint} n - Non-negative BigInt.
 * @returns {number} Number of bits required to represent `n` (`0` for `0n`).
 */
function bitLength(n) {
  if (n === 0n) {
    return 0;
  }
  const hex = n.toString(16);
  const leadNibble = parseInt(hex[0], 16);
  return (hex.length - 1) * 4 + (32 - Math.clz32(leadNibble));
}

/**
 * Computes the exact floor integer cube root `floor(n^(1/3))` for `n >= 0n`
 * using bit-length-scaled IEEE-754 seeding, monotone integer Newton-Raphson
 * iteration, and formal bracket verification (`q^3 <= n < (q + 1)^3`).
 *
 * @param {bigint} n - Non-negative BigInt radicand.
 * @returns {bigint} Exact floor integer cube root.
 */
function icbrt(n) {
  if (n === 0n) {
    return 0n;
  }
  if (n < 8n) {
    return 1n;
  }

  const bits = bitLength(n);
  let x;

  if (bits <= 53) {
    // Number(n) is exact in IEEE-754 double; adding 1 guarantees an upper bound.
    x = BigInt(Math.ceil(Math.cbrt(Number(n)))) + 1n;
  } else {
    // Shift right by a multiple of 3 bits so the top chunk has 51..53 bits
    // (fits exactly in IEEE-754 safe integer range).
    const s = Math.floor((bits - 51) / 3);
    const top = Number(n >> BigInt(3 * s));
    // Since n < (top + 1) * 2^(3s), cbrt(top + 1) * 2^s strictly bounds n^(1/3).
    // Preserve up to 32 fractional bits of cbrt(top + 1) for ~49-bit seeding.
    const rootTop = Math.cbrt(top + 1);
    const fracBits = Math.min(s, 32);
    const scaled = Math.ceil(rootTop * (2 ** fracBits)) + 1;
    x = BigInt(scaled) << BigInt(s - fracBits);
  }

  // Monotone Newton-Raphson from upper bound x >= ceil(n^(1/3)).
  while (true) {
    const next = (2n * x + n / (x * x)) / 3n;
    if (next >= x) {
      break;
    }
    x = next;
  }

  // Formal error-bound bracket verification: guarantee x^3 <= n < (x + 1)^3.
  while ((x + 1n) * (x + 1n) * (x + 1n) <= n) {
    x += 1n;
  }
  while (x * x * x > n) {
    x -= 1n;
  }

  return x;
}

/**
 * Formats a non-negative scaled integer `q` representing `q * 10^(-precision)`
 * into a canonical decimal string (no trailing fractional zeros, never `"-0"`).
 *
 * @param {bigint} q - Non-negative rounded scaled magnitude.
 * @param {number} precision - Number of fractional decimal places.
 * @param {boolean} negative - Whether the original value was negative.
 * @returns {string} Canonical decimal string.
 */
function formatScaledDecimal(q, precision, negative) {
  if (q === 0n) {
    return '0';
  }

  const digits = q.toString();
  const sign = negative ? '-' : '';

  if (precision === 0) {
    return sign + digits;
  }

  if (digits.length <= precision) {
    const padded = '0'.repeat(precision - digits.length) + digits;
    const frac = padded.replace(/0+$/, '');
    return `${sign}0.${frac}`;
  }

  const splitIndex = digits.length - precision;
  const intPart = digits.slice(0, splitIndex);
  const fracPart = digits.slice(splitIndex).replace(/0+$/, '');

  return fracPart.length > 0 ? `${sign}${intPart}.${fracPart}` : `${sign}${intPart}`;
}

/**
 * Computes the cube root of an arbitrary-precision decimal string with exact
 * round-half-to-even rounding to `precision` fractional decimal digits.
 *
 * Supports optional leading/trailing whitespace, optional `+`/`-` sign,
 * integer or fractional forms (including `.5` and `5.`), and scientific
 * notation (`e`/`E`). Trailing fractional zeros are stripped from the returned
 * canonical decimal string, and zero is always returned as `"0"`.
 *
 * @param {string} value - Arbitrary-precision decimal string.
 * @param {number} [precision=20] - Non-negative integer number of fractional decimal places.
 * @returns {string} Canonical decimal string of `cbrt(value)` rounded half-to-even to `precision` fractional digits.
 * @throws {TypeError} If `value` is not a string or `precision` is not a number.
 * @throws {RangeError} If `value` is not a valid decimal string, `precision` is not a non-negative safe integer, or the scaled magnitude exceeds safe computation bounds.
 */
export function cbrtDecimalStable(value, precision = 20) {
  if (typeof value !== 'string') {
    throw new TypeError('value must be a decimal string');
  }
  if (typeof precision !== 'number') {
    throw new TypeError('precision must be a non-negative integer');
  }
  if (!Number.isInteger(precision) || precision < 0 || !Number.isSafeInteger(precision)) {
    throw new RangeError('precision must be a non-negative safe integer');
  }

  const trimmedInput = value.trim();
  const match = DECIMAL_RE.exec(trimmedInput);
  if (!match) {
    throw new RangeError(`Invalid decimal string: "${value}"`);
  }

  const [, signStr, intPart = '', fracPartAfterInt, fracPartOnly, expStr] = match;
  const fracPart = fracPartAfterInt ?? fracPartOnly ?? '';
  const negative = signStr === '-';

  const strippedLead = (intPart + fracPart).replace(/^0+/, '');
  if (strippedLead.length === 0) {
    return '0';
  }

  // Absorb trailing zeros into the base-10 exponent to keep mantissa minimal.
  const significantDigits = strippedLead.replace(/0+$/, '');
  const trailingZeros = BigInt(strippedLead.length - significantDigits.length);
  const exp = expStr !== undefined ? BigInt(expStr) : 0n;

  // Exact representation: |value| = M * 10^E, with M > 0.
  const M = BigInt(significantDigits);
  const E = exp - BigInt(fracPart.length) + trailingZeros;
  const mDigits = BigInt(significantDigits.length);

  // Target scaled value: |value|^(1/3) * 10^precision = (M * 10^S)^(1/3).
  const S = E + 3n * BigInt(precision);

  // Guaranteed underflow shortcut:
  // |value|^(1/3) * 10^precision < 0.5  <=>  8 * M < 10^(-S).
  // Since M < 10^mDigits, 8 * M < 10^(mDigits + 1).
  if (S < 0n) {
    const k = -S;
    if (k > mDigits + 1n) {
      return '0';
    }

    const D = 10n ** k;
    // Exact integer floor: floor((M / D)^(1/3)) === floor(floor(M / D)^(1/3)).
    let q = icbrt(M / D);

    // Exact midpoint comparison against (q + 1/2):
    // M / D  <=>  (2q + 1)^3 / 8   <=>   8 * M  <=>  D * (2q + 1)^3.
    const lhs = 8n * M;
    const odd = 2n * q + 1n;
    const rhs = D * odd * odd * odd;

    if (lhs > rhs || (lhs === rhs && (q & 1n) === 1n)) {
      q += 1n;
    }

    return formatScaledDecimal(q, precision, negative);
  }

  if (mDigits + S > MAX_SCALED_DIGITS) {
    throw new RangeError('Scaled radicand exceeds maximum supported precision/magnitude');
  }

  const N = M * (10n ** S);
  let q = icbrt(N);

  // Exact midpoint comparison against (q + 1/2):
  // N^(1/3)  <=>  q + 1/2   <=>   8 * N  <=>  (2q + 1)^3.
  const lhs = 8n * N;
  const odd = 2n * q + 1n;
  const rhs = odd * odd * odd;

  if (lhs > rhs || (lhs === rhs && (q & 1n) === 1n)) {
    q += 1n;
  }

  return formatScaledDecimal(q, precision, negative);
}
