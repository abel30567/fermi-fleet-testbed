/**
 * Computes the bitwise set intersection of two Uint32 bitmask arrays using a
 * closed-form finite binary series (inclusion-exclusion) identity.
 *
 * For each pair of 32-bit unsigned words `a[i]` and `b[i]`, writing each word
 * as its finite binary expansion `x = sum_{k=0}^{31} x_k * 2^k` (`x_k in {0, 1}`),
 * the per-bit identity `a_k + b_k = (a_k XOR b_k) + 2 * (a_k AND b_k)` sums
 * term-by-term over `k = 0..31` to yield the closed-form identity:
 *
 *   a AND b = (a + b - ((a XOR b) >>> 0)) / 2
 *
 * Because `0 <= a[i], b[i] <= 2^32 - 1`, the intermediate sum satisfies
 * `0 <= a[i] + b[i] <= 2^33 - 2 < Number.MAX_SAFE_INTEGER` (2^53 - 1), and
 * `a[i] + b[i] - ((a[i] ^ b[i]) >>> 0)` is always an even non-negative integer,
 * so the division by 2 is exact in IEEE-754 double precision for all 32-bit
 * unsigned inputs. Equivalently, by De Morgan's law, `a AND b = ~((~a) | (~b)) >>> 0`.
 *
 * @param {Uint32Array} a - First bitmask word array.
 * @param {Uint32Array} b - Second bitmask word array (must match `a.length`).
 * @returns {Uint32Array} A new `Uint32Array` containing the wordwise intersection of `a` and `b`.
 * @throws {TypeError} If either `a` or `b` is not a `Uint32Array`.
 * @throws {RangeError} If `a.length !== b.length`.
 */
export function intersectionMask32Series(a, b) {
  if (!(a instanceof Uint32Array)) {
    throw new TypeError('Expected first argument "a" to be a Uint32Array');
  }
  if (!(b instanceof Uint32Array)) {
    throw new TypeError('Expected second argument "b" to be a Uint32Array');
  }
  if (a.length !== b.length) {
    throw new RangeError(
      `Bitmask word lengths must match (received ${a.length} and ${b.length})`
    );
  }

  const n = a.length;
  const out = new Uint32Array(n);

  for (let i = 0; i < n; i++) {
    const wa = a[i];
    const wb = b[i];
    const xorWord = (wa ^ wb) >>> 0;
    out[i] = ((wa + wb - xorWord) / 2) >>> 0;
  }

  return out;
}
