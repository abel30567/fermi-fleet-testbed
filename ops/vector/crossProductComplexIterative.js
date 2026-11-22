/**
 * Complex number represented in Cartesian form.
 * @typedef {{ re: number, im: number }} Complex
 */

/**
 * Normalizes negative zero (-0) to +0.
 *
 * @param {number} value
 * @returns {number}
 */
function normalizeZero(value) {
  return value === 0 ? 0 : value;
}

/**
 * Validates that a value is a 3-element array of finite complex numbers `{ re, im }`.
 *
 * @param {unknown} vector - Candidate 3D complex vector.
 * @param {string} name - Parameter name for error messages.
 * @throws {TypeError} If `vector` is not an Array or any element lacks numeric `re`/`im`.
 * @throws {RangeError} If `vector` does not have length 3 or any component is non-finite.
 */
function validateComplexVector3(vector, name) {
  if (!Array.isArray(vector)) {
    throw new TypeError(`${name} must be an array of 3 complex numbers { re, im }`);
  }
  if (vector.length !== 3) {
    throw new RangeError(`${name} must have length 3, got ${vector.length}`);
  }
  for (let i = 0; i < 3; i += 1) {
    const entry = vector[i];
    if (entry === null || typeof entry !== 'object' || Array.isArray(entry)) {
      throw new TypeError(`${name}[${i}] must be a complex number object { re, im }`);
    }
    if (typeof entry.re !== 'number' || typeof entry.im !== 'number') {
      throw new TypeError(`${name}[${i}] must have numeric re and im properties`);
    }
    if (!Number.isFinite(entry.re) || !Number.isFinite(entry.im)) {
      throw new RangeError(`${name}[${i}] must have finite re and im components`);
    }
  }
}

/**
 * Computes the bilinear 3D vector cross product `a × b` over complex numbers `{ re, im }`
 * using a straightforward iterative formulation.
 *
 * For `k ∈ {0, 1, 2}`, with cyclic indices `i = (k + 1) % 3` and `j = (k + 2) % 3`:
 * `(a × b)[k] = a[i] * b[j] - a[j] * b[i]`.
 *
 * @param {ReadonlyArray<Complex>} a - First 3D complex vector `[a0, a1, a2]`.
 * @param {ReadonlyArray<Complex>} b - Second 3D complex vector `[b0, b1, b2]`.
 * @returns {[Complex, Complex, Complex]} The complex cross product vector `a × b`.
 * @throws {TypeError} If `a` or `b` is not an array or contains invalid complex entries.
 * @throws {RangeError} If `a` or `b` does not have length 3 or contains non-finite numbers.
 */
export function crossProductComplexIterative(a, b) {
  validateComplexVector3(a, 'a');
  validateComplexVector3(b, 'b');

  const result = new Array(3);

  for (let k = 0; k < 3; k += 1) {
    const i = (k + 1) % 3;
    const j = (k + 2) % 3;

    const ai = a[i];
    const aj = a[j];
    const bi = b[i];
    const bj = b[j];

    // ai * bj
    const prod1Re = ai.re * bj.re - ai.im * bj.im;
    const prod1Im = ai.re * bj.im + ai.im * bj.re;

    // aj * bi
    const prod2Re = aj.re * bi.re - aj.im * bi.im;
    const prod2Im = aj.re * bi.im + aj.im * bi.re;

    result[k] = {
      re: normalizeZero(prod1Re - prod2Re),
      im: normalizeZero(prod1Im - prod2Im),
    };
  }

  return result;
}
