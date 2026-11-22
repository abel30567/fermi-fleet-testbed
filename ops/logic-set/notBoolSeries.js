/**
 * Evaluates the closed-form indicator complement on `{0, 1}`:
 *
 *   notIndicator(χ) = 1 - χ = ∑_{k=0}^{1} (-1)^k χ^k
 *
 * Since χ ∈ {0, 1} is idempotent (χ^k = χ for k ≥ 1), the alternating series
 * collapses exactly to the degree-1 Algebraic Normal Form (Zhegalkin
 * polynomial) `1 - χ`.
 *
 * @param {0 | 1} chi - Binary indicator value (`0` or `1`).
 * @returns {0 | 1} Complemented indicator value `1 - chi`.
 */
function notIndicator(chi) {
  return /** @type {0 | 1} */ (1 - chi);
}

/**
 * Computes logical negation over plain booleans or relative set complement
 * over JavaScript `Set` objects using the closed-form indicator identity.
 *
 * Algorithm / Identity:
 * - **Boolean mode** (`notBoolSeries(a)`):
 *   Maps `a ∈ {false, true}` to its indicator `χ(a) ∈ {0, 1}`, applies the
 *   Algebraic Normal Form identity `χ(¬a) = 1 - χ(a)`, and maps back to a
 *   plain boolean.
 * - **Set mode** (`notBoolSeries(a, universe)`):
 *   For each element `x ∈ universe`, evaluates the indicator-function
 *   complement `χ_{U \ A}(x) = 1 - χ_A(x)` and includes `x` in the returned
 *   `Set` iff `χ_{U \ A}(x) = 1`. Neither `a` nor `universe` is mutated.
 *
 * @template T
 * @overload
 * @param {boolean} a - Plain boolean value to negate.
 * @returns {boolean} Logical negation of `a`.
 *
 * @overload
 * @param {Set<T>} a - Set whose complement relative to `universe` is computed.
 * @param {Set<T>} universe - Universe `Set` defining the domain of the complement.
 * @returns {Set<T>} New `Set` containing all elements `x ∈ universe` with `x ∉ a`.
 *
 * @param {boolean | Set<T>} a - Plain boolean or `Set` instance.
 * @param {Set<T>} [universe] - Required `Set` universe when `a` is a `Set`; must be omitted (`undefined`) when `a` is a boolean.
 * @returns {boolean | Set<T>} Negated boolean or relative complement `Set`.
 * @throws {TypeError} If `a` is neither a plain boolean nor a `Set`, if `a` is a `Set` and `universe` is missing or not a `Set`, or if `a` is a boolean and an unexpected `universe` argument is supplied.
 */
export function notBoolSeries(a, universe) {
  if (typeof a === 'boolean') {
    if (universe !== undefined) {
      throw new TypeError(
        'notBoolSeries: universe argument is only allowed when the first argument is a Set'
      );
    }
    const chi = a ? 1 : 0;
    return notIndicator(chi) === 1;
  }

  if (a instanceof Set) {
    if (!(universe instanceof Set)) {
      throw new TypeError(
        'notBoolSeries: universe must be a Set instance when computing Set complement'
      );
    }
    const complement = new Set();
    for (const element of universe) {
      const chiA = a.has(element) ? 1 : 0;
      if (notIndicator(chiA) === 1) {
        complement.add(element);
      }
    }
    return complement;
  }

  throw new TypeError(
    'notBoolSeries: first argument must be a plain boolean or a Set instance'
  );
}
