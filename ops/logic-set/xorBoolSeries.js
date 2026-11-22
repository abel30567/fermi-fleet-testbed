/**
 * Evaluates the closed-form multilinear indicator polynomial for XOR:
 *
 *   χ(a ⊕ b) = χ(a) + χ(b) - 2 · χ(a) · χ(b),   for χ(a), χ(b) ∈ {0, 1}.
 *
 * @param {number} chiA - Indicator value in {0, 1}.
 * @param {number} chiB - Indicator value in {0, 1}.
 * @returns {number} Indicator value of XOR in {0, 1}.
 */
function xorIndicator(chiA, chiB) {
  return chiA + chiB - 2 * chiA * chiB;
}

/**
 * Computes the logical XOR of two plain booleans or the symmetric difference
 * (A Δ B) of two JavaScript `Set` objects using a closed-form indicator
 * polynomial / inclusion-exclusion identity.
 *
 * Algorithm / Identity:
 * - Over plain booleans, let χ(p) ∈ {0, 1} be the truth-value indicator
 *   (χ(true) = 1, χ(false) = 0). By the algebraic normal form (multilinear
 *   polynomial expansion over ℝ):
 *
 *     χ(a ⊕ b) = χ(a) + χ(b) - 2 · χ(a) · χ(b)
 *
 *   and `a ⊕ b` holds iff `χ(a ⊕ b) === 1`.
 *
 * - Over JavaScript `Set` instances A and B, the symmetric difference A Δ B
 *   satisfies the pointwise indicator-function / inclusion-exclusion identity:
 *
 *     χ_{A Δ B}(x) = χ_A(x) + χ_B(x) - 2 · χ_A(x) · χ_B(x)
 *
 *   for every element x ∈ A ∪ B (evaluated under SameValueZero semantics via
 *   `Set.prototype.has`). Neither input set is mutated; a new `Set` is returned.
 *
 * @param {boolean | Set<*>} a - First operand (plain boolean or `Set`).
 * @param {boolean | Set<*>} b - Second operand (must match the type of `a`).
 * @returns {boolean | Set<*>} Boolean XOR result when given booleans, or a new
 *   `Set` representing the symmetric difference `a Δ b` when given `Set`s.
 * @throws {TypeError} If inputs are not either both plain booleans or both
 *   `Set` instances.
 */
export function xorBoolSeries(a, b) {
  if (typeof a === 'boolean' && typeof b === 'boolean') {
    const chiA = a ? 1 : 0;
    const chiB = b ? 1 : 0;
    return xorIndicator(chiA, chiB) === 1;
  }

  if (a instanceof Set && b instanceof Set) {
    const result = new Set();

    for (const x of a) {
      const chiA = 1;
      const chiB = b.has(x) ? 1 : 0;
      if (xorIndicator(chiA, chiB) === 1) {
        result.add(x);
      }
    }

    for (const x of b) {
      const chiA = a.has(x) ? 1 : 0;
      const chiB = 1;
      if (xorIndicator(chiA, chiB) === 1) {
        result.add(x);
      }
    }

    return result;
  }

  throw new TypeError(
    'xorBoolSeries requires either two plain booleans or two Set instances'
  );
}
