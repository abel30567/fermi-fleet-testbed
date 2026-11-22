/**
 * Computes the iterative greatest common divisor of two BigInts (non-negative).
 *
 * @param {bigint} a
 * @param {bigint} b
 * @returns {bigint}
 */
function gcdBigInt(a, b) {
  let x = a < 0n ? -a : a;
  let y = b < 0n ? -b : b;
  while (y !== 0n) {
    const r = x % y;
    x = y;
    y = r;
  }
  return x;
}

/**
 * Normalizes a rational number into lowest terms with positive denominator,
 * representing zero as `{ num: 0n, den: 1n }`.
 *
 * @param {bigint} num
 * @param {bigint} den
 * @returns {{ num: bigint, den: bigint }}
 */
function normalizeRational(num, den) {
  if (den === 0n) {
    throw new RangeError('Rational denominator must be non-zero');
  }
  if (num === 0n) {
    return { num: 0n, den: 1n };
  }
  let n = num;
  let d = den;
  if (d < 0n) {
    n = -n;
    d = -d;
  }
  const g = gcdBigInt(n, d);
  return { num: n / g, den: d / g };
}

/**
 * Validates and normalizes an exact rational `{ num: bigint, den: bigint }`.
 *
 * @param {unknown} value
 * @param {string} label
 * @returns {{ num: bigint, den: bigint }}
 */
function validateRational(value, label) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError(`${label} must be a rational object { num: bigint, den: bigint }`);
  }
  if (typeof value.num !== 'bigint' || typeof value.den !== 'bigint') {
    throw new TypeError(`${label} must have bigint num and den properties`);
  }
  if (value.den === 0n) {
    throw new RangeError(`${label} must have a non-zero denominator`);
  }
  return normalizeRational(value.num, value.den);
}

/**
 * Adds two normalized rationals.
 *
 * @param {{ num: bigint, den: bigint }} a
 * @param {{ num: bigint, den: bigint }} b
 * @returns {{ num: bigint, den: bigint }}
 */
function addRational(a, b) {
  if (a.num === 0n) {
    return { num: b.num, den: b.den };
  }
  if (b.num === 0n) {
    return { num: a.num, den: a.den };
  }
  const g = gcdBigInt(a.den, b.den);
  const aDenDivG = a.den / g;
  const bDenDivG = b.den / g;
  return normalizeRational(a.num * bDenDivG + b.num * aDenDivG, aDenDivG * b.den);
}

/**
 * Multiplies two normalized rationals, returning a normalized rational.
 *
 * @param {{ num: bigint, den: bigint }} a
 * @param {{ num: bigint, den: bigint }} b
 * @returns {{ num: bigint, den: bigint }}
 */
function mulRational(a, b) {
  if (a.num === 0n || b.num === 0n) {
    return { num: 0n, den: 1n };
  }
  const g1 = gcdBigInt(a.num, b.den);
  const g2 = gcdBigInt(b.num, a.den);
  return {
    num: (a.num / g1) * (b.num / g2),
    den: (a.den / g2) * (b.den / g1),
  };
}

/**
 * Raises a BigInt base to a non-negative integer exponent iteratively
 * via exponentiation by squaring.
 *
 * @param {bigint} base
 * @param {number} exp
 * @returns {bigint}
 */
function powBigInt(base, exp) {
  let result = 1n;
  let b = base;
  let e = BigInt(exp);
  while (e > 0n) {
    if ((e & 1n) === 1n) {
      result *= b;
    }
    e >>= 1n;
    if (e > 0n) {
      b *= b;
    }
  }
  return result;
}

/**
 * Raises a normalized rational to a non-negative integer exponent.
 * By polynomial convention, `0^0 = 1`.
 *
 * @param {{ num: bigint, den: bigint }} base
 * @param {number} exp
 * @returns {{ num: bigint, den: bigint }}
 */
function powRational(base, exp) {
  if (exp === 0) {
    return { num: 1n, den: 1n };
  }
  if (base.num === 0n) {
    return { num: 0n, den: 1n };
  }
  return {
    num: powBigInt(base.num, exp),
    den: powBigInt(base.den, exp),
  };
}

/**
 * Computes the exact divergence `div(F)(point) = sum_{j=0}^{d-1} ∂F_j/∂x_j(point)`
 * of a `d`-dimensional multivariate polynomial vector field `F = [F_0, ..., F_{d-1}]`
 * evaluated at a rational point, using a straightforward iterative implementation.
 *
 * Each component `F_j` is an array of polynomial terms:
 * `{ coeff: { num: bigint, den: bigint }, powers: number[] }`,
 * where `powers` has length `d` and each exponent is a non-negative safe integer.
 * An empty component array `[]` represents the zero polynomial.
 *
 * @param {Array<Array<{ coeff: { num: bigint, den: bigint }, powers: number[] }>>} vectorField
 *   Non-empty array of `d` polynomial components `F_0, ..., F_{d-1}`.
 * @param {Array<{ num: bigint, den: bigint }>} point
 *   Array of `d` exact rational coordinates at which to evaluate the divergence.
 * @returns {{ num: bigint, den: bigint }}
 *   Exact rational divergence in lowest terms with `den > 0n` (`{ num: 0n, den: 1n }` for zero).
 * @throws {TypeError} If inputs or nested structures have invalid types.
 * @throws {RangeError} If dimensions are empty/mismatched, denominators are zero, or powers are invalid.
 */
export function divergenceRationalIterative(vectorField, point) {
  if (!Array.isArray(vectorField)) {
    throw new TypeError('vectorField must be an array of polynomial components');
  }
  if (!Array.isArray(point)) {
    throw new TypeError('point must be an array of exact rational coordinates');
  }
  const d = vectorField.length;
  if (d === 0) {
    throw new RangeError('vectorField must be a non-empty array');
  }
  if (point.length !== d) {
    throw new RangeError(`point length (${point.length}) must match vectorField dimension (${d})`);
  }

  const normalizedPoint = new Array(d);
  for (let k = 0; k < d; k += 1) {
    normalizedPoint[k] = validateRational(point[k], `point[${k}]`);
  }

  let total = { num: 0n, den: 1n };

  for (let j = 0; j < d; j += 1) {
    const component = vectorField[j];
    if (!Array.isArray(component)) {
      throw new TypeError(`vectorField[${j}] must be an array of polynomial terms`);
    }

    for (let t = 0; t < component.length; t += 1) {
      const term = component[t];
      if (term === null || typeof term !== 'object' || Array.isArray(term)) {
        throw new TypeError(`vectorField[${j}][${t}] must be a term object { coeff, powers }`);
      }

      const coeff = validateRational(term.coeff, `vectorField[${j}][${t}].coeff`);

      if (!Array.isArray(term.powers)) {
        throw new TypeError(`vectorField[${j}][${t}].powers must be an array of non-negative integers`);
      }
      if (term.powers.length !== d) {
        throw new RangeError(
          `vectorField[${j}][${t}].powers length (${term.powers.length}) must equal dimension (${d})`,
        );
      }

      for (let k = 0; k < d; k += 1) {
        const p = term.powers[k];
        if (typeof p !== 'number') {
          throw new TypeError(`vectorField[${j}][${t}].powers[${k}] must be a non-negative integer`);
        }
        if (!Number.isSafeInteger(p) || p < 0) {
          throw new RangeError(`vectorField[${j}][${t}].powers[${k}] must be a non-negative safe integer`);
        }
      }

      const pj = term.powers[j];
      if (pj === 0 || coeff.num === 0n) {
        continue;
      }

      // Differentiate with respect to x_j: coeff * p_j * x_j^(p_j - 1) * prod_{k != j} x_k^(p_k)
      let termVal = mulRational(coeff, { num: BigInt(pj), den: 1n });

      for (let k = 0; k < d; k += 1) {
        const exp = k === j ? pj - 1 : term.powers[k];
        if (exp === 0) {
          continue;
        }
        if (normalizedPoint[k].num === 0n) {
          termVal = { num: 0n, den: 1n };
          break;
        }
        termVal = mulRational(termVal, powRational(normalizedPoint[k], exp));
      }

      if (termVal.num !== 0n) {
        total = addRational(total, termVal);
      }
    }
  }

  return total;
}
