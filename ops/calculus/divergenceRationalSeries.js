/**
 * Compute the greatest common divisor of two BigInts (always non-negative).
 *
 * @param {bigint} a
 * @param {bigint} b
 * @returns {bigint}
 */
function gcd(a, b) {
  let x = a < 0n ? -a : a;
  let y = b < 0n ? -b : b;
  while (y !== 0n) {
    const t = x % y;
    x = y;
    y = t;
  }
  return x;
}

/**
 * Normalize a rational number (num / den) to lowest terms with den > 0n.
 * Zero is represented canonically as { num: 0n, den: 1n }.
 *
 * @param {bigint} num
 * @param {bigint} den
 * @returns {{ num: bigint, den: bigint }}
 */
function normalizeRational(num, den) {
  if (den === 0n) {
    throw new RangeError('Rational denominator must be non-zero.');
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
  const g = gcd(n, d);
  return { num: n / g, den: d / g };
}

/**
 * Validate and normalize an exact rational input { num: BigInt, den: BigInt }.
 *
 * @param {unknown} value
 * @param {string} label
 * @returns {{ num: bigint, den: bigint }}
 */
function validateRational(value, label) {
  if (value === null || typeof value !== 'object') {
    throw new TypeError(`${label} must be an object with BigInt num and den properties.`);
  }
  const { num, den } = value;
  if (typeof num !== 'bigint' || typeof den !== 'bigint') {
    throw new TypeError(`${label} must have BigInt num and den properties.`);
  }
  if (den === 0n) {
    throw new RangeError(`${label} denominator must be non-zero.`);
  }
  return normalizeRational(num, den);
}

/**
 * Add two normalized exact rationals, returning a normalized rational.
 *
 * @param {{ num: bigint, den: bigint }} a
 * @param {{ num: bigint, den: bigint }} b
 * @returns {{ num: bigint, den: bigint }}
 */
function addRational(a, b) {
  if (a.num === 0n) return b;
  if (b.num === 0n) return a;
  const g = gcd(a.den, b.den);
  const aScale = b.den / g;
  const bScale = a.den / g;
  const num = a.num * aScale + b.num * bScale;
  const den = a.den * aScale;
  return normalizeRational(num, den);
}

/**
 * Multiply two normalized exact rationals, returning a normalized rational.
 *
 * @param {{ num: bigint, den: bigint }} a
 * @param {{ num: bigint, den: bigint }} b
 * @returns {{ num: bigint, den: bigint }}
 */
function mulRational(a, b) {
  if (a.num === 0n || b.num === 0n) {
    return { num: 0n, den: 1n };
  }
  const g1 = gcd(a.num, b.den);
  const g2 = gcd(b.num, a.den);
  return {
    num: (a.num / g1) * (b.num / g2),
    den: (a.den / g2) * (b.den / g1),
  };
}

/**
 * Raise a normalized exact rational to a non-negative integer power.
 * Follows the polynomial convention 0^0 = 1.
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
  if (exp === 1) {
    return base;
  }
  const e = BigInt(exp);
  return {
    num: base.num ** e,
    den: base.den ** e,
  };
}

/**
 * Compute the exact divergence div(F) = sum_{i=0}^{n-1} (dF_i / dx_i) of an
 * n-dimensional multivariate rational polynomial vector field evaluated at
 * an exact rational point.
 *
 * Algorithm:
 *   Each component F_i(x) is represented as a finite sum of monomials
 *   c * prod_{j=0}^{n-1} x_j^{p_j}. By linearity of partial differentiation
 *   and the exact power rule, the partial derivative dF_i / dx_i differentiates
 *   each term with p_i >= 1 into (c * p_i) * x_i^{p_i - 1} * prod_{j != i} x_j^{p_j}
 *   (terms with p_i === 0 vanish). Each differentiated monomial is evaluated
 *   exactly at `point` using BigInt rational arithmetic (with 0^0 = 1) and
 *   accumulated into a single rational reduced to lowest terms.
 *
 * @param {Array<Array<{ coeff: { num: bigint, den: bigint }, powers: number[] }>>} field
 *   Non-empty array of n scalar multivariate polynomials (each an array of
 *   monomial terms `{ coeff, powers }`, where `powers` has length n and
 *   contains non-negative safe integers). An empty term array `[]` represents
 *   the zero polynomial.
 * @param {Array<{ num: bigint, den: bigint }>} point
 *   Array of n exact rationals representing the evaluation coordinates.
 * @returns {{ num: bigint, den: bigint }}
 *   Exact divergence div(F)(point) in lowest terms (`den > 0n`,
 *   `gcd(|num|, den) === 1n`, zero as `{ num: 0n, den: 1n }`).
 * @throws {TypeError}
 *   If `field` or `point` is not an array, if any component or `powers` is not
 *   an array, if any term or rational object is malformed, or if any power is
 *   not a number.
 * @throws {RangeError}
 *   If `field` is empty, if `point.length !== field.length`, if any `powers`
 *   array has length !== `field.length`, if any power is negative or not a
 *   safe integer, or if any rational has denominator `0n`.
 */
export function divergenceRationalSeries(field, point) {
  if (!Array.isArray(field)) {
    throw new TypeError('field must be an array of scalar multivariate polynomials.');
  }
  if (field.length === 0) {
    throw new RangeError('field must have dimension at least 1.');
  }
  if (!Array.isArray(point)) {
    throw new TypeError('point must be an array of exact rationals.');
  }
  const dim = field.length;
  if (point.length !== dim) {
    throw new RangeError(`point length (${point.length}) must match field dimension (${dim}).`);
  }

  const normalizedPoint = new Array(dim);
  for (let j = 0; j < dim; j += 1) {
    normalizedPoint[j] = validateRational(point[j], `point[${j}]`);
  }

  // Validate all components and terms upfront before accumulating.
  const validatedField = new Array(dim);
  for (let i = 0; i < dim; i += 1) {
    const component = field[i];
    if (!Array.isArray(component)) {
      throw new TypeError(`field[${i}] must be an array of monomial terms.`);
    }
    const validatedTerms = new Array(component.length);
    for (let k = 0; k < component.length; k += 1) {
      const term = component[k];
      if (term === null || typeof term !== 'object') {
        throw new TypeError(`field[${i}][${k}] must be a term object { coeff, powers }.`);
      }
      const coeff = validateRational(term.coeff, `field[${i}][${k}].coeff`);
      const { powers } = term;
      if (!Array.isArray(powers)) {
        throw new TypeError(`field[${i}][${k}].powers must be an array of non-negative integers.`);
      }
      if (powers.length !== dim) {
        throw new RangeError(
          `field[${i}][${k}].powers length (${powers.length}) must match field dimension (${dim}).`,
        );
      }
      const validatedPowers = new Array(dim);
      for (let j = 0; j < dim; j += 1) {
        const p = powers[j];
        if (typeof p !== 'number') {
          throw new TypeError(`field[${i}][${k}].powers[${j}] must be a number.`);
        }
        if (!Number.isInteger(p) || !Number.isSafeInteger(p) || p < 0) {
          throw new RangeError(
            `field[${i}][${k}].powers[${j}] must be a non-negative safe integer.`,
          );
        }
        validatedPowers[j] = p;
      }
      validatedTerms[k] = { coeff, powers: validatedPowers };
    }
    validatedField[i] = validatedTerms;
  }

  // Per-coordinate power cache to avoid recomputing repeated rational powers.
  const powerCache = Array.from({ length: dim }, () => new Map());
  const getCoordPower = (j, exp) => {
    const cache = powerCache[j];
    let cached = cache.get(exp);
    if (cached === undefined) {
      cached = powRational(normalizedPoint[j], exp);
      cache.set(exp, cached);
    }
    return cached;
  };

  let total = { num: 0n, den: 1n };

  for (let i = 0; i < dim; i += 1) {
    const terms = validatedField[i];
    for (let k = 0; k < terms.length; k += 1) {
      const { coeff, powers } = terms[k];
      const pi = powers[i];
      if (pi === 0 || coeff.num === 0n) {
        continue;
      }

      // Differentiate with respect to x_i: factor = coeff * pi.
      let termVal = mulRational(coeff, { num: BigInt(pi), den: 1n });

      for (let j = 0; j < dim; j += 1) {
        const exp = j === i ? pi - 1 : powers[j];
        if (exp === 0) {
          continue;
        }
        if (normalizedPoint[j].num === 0n) {
          termVal = { num: 0n, den: 1n };
          break;
        }
        termVal = mulRational(termVal, getCoordPower(j, exp));
      }

      if (termVal.num !== 0n) {
        total = addRational(total, termVal);
      }
    }
  }

  return total;
}
