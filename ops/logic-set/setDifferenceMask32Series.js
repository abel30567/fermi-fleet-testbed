/**
 * Computes the set difference `A \ B` over multi-word 32-bit bitmasks
 * represented as `Uint32Array` instances, returning a new `Uint32Array`.
 *
 * Mathematical basis (closed-form Boolean-ring / inclusion-exclusion identity):
 * For every bit index `k`, let `1_A(k), 1_B(k) ∈ {0, 1}` be the indicator
 * functions of sets `A` and `B`. By the finite inclusion-exclusion (Möbius)
 * series on the Boolean lattice and its exact reduction modulo 2 in the
 * Boolean ring `(GF(2)^32, ^, &)`:
 *
 *   1_{A \ B}(k) = 1_A(k) * (1 - 1_B(k))
 *                = 1_A(k) - 1_A(k) * 1_B(k)
 *                ≡ 1_A(k) ⊕ (1_A(k) ∧ 1_B(k))  (mod 2)
 *
 * Equivalently, `A \ B = A △ (A ∩ B) = (A ∪ B) △ B`, giving the closed-form
 * wordwise expression `((a ^ (a & b)) >>> 0)` across all 32 bits in parallel.
 *
 * @param {Uint32Array} maskA - Bitmask words representing set `A`.
 * @param {Uint32Array} maskB - Bitmask words representing set `B` (must have the same length as `maskA`).
 * @returns {Uint32Array} A new `Uint32Array` representing `A \ B`.
 * @throws {TypeError} If `maskA` or `maskB` is not a `Uint32Array`.
 * @throws {RangeError} If `maskA` and `maskB` do not have the same length.
 */
export function setDifferenceMask32Series(maskA, maskB) {
  if (!(maskA instanceof Uint32Array)) {
    throw new TypeError('maskA must be a Uint32Array');
  }
  if (!(maskB instanceof Uint32Array)) {
    throw new TypeError('maskB must be a Uint32Array');
  }
  if (maskA.length !== maskB.length) {
    throw new RangeError(
      `maskA and maskB must have the same length (got ${maskA.length} and ${maskB.length})`
    );
  }

  const len = maskA.length;
  const result = new Uint32Array(len);

  for (let i = 0; i < len; i += 1) {
    const a = maskA[i];
    const b = maskB[i];
    // Boolean-ring / inclusion-exclusion identity: A \ B = A △ (A ∩ B)
    result[i] = (a ^ (a & b)) >>> 0;
  }

  return result;
}
