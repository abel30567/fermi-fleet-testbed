/**
 * @fileoverview 3D vector cross product over IEEE-754 float64 numbers using
 * the closed-form Levi-Civita / cofactor determinant expansion with
 * error-free Dekker–Veltkamp product compensation for high numerical accuracy.
 */

// Veltkamp splitting constant for IEEE-754 binary64 (p = 53, s = ceil(53 / 2) = 27): 2^27 + 1.
const VELTKAMP_SPLIT = 134217729

// Safe magnitude bounds for exact Dekker–Veltkamp splitting without overflow or subnormal underflow.
const SPLIT_SAFE_MAX = 1e299
const PROD_SAFE_MAX = 1e307
const PROD_SAFE_MIN = 1e-291

/**
 * Validates that a value is a 3-element array of finite IEEE-754 float64 numbers.
 *
 * @param {unknown} vec - Candidate 3D vector.
 * @param {string} name - Parameter name for descriptive error messages.
 * @throws {TypeError} If `vec` is not an Array or contains non-number elements.
 * @throws {RangeError} If `vec.length !== 3` or any element is NaN or infinite.
 */
function validateVector3(vec, name) {
	if (!Array.isArray(vec)) {
		throw new TypeError(`${name} must be an Array of 3 finite numbers`)
	}
	if (vec.length !== 3) {
		throw new RangeError(`${name} must have length 3, received length ${vec.length}`)
	}
	for (let i = 0; i < 3; i++) {
		const value = vec[i]
		if (typeof value !== 'number') {
			throw new TypeError(`${name}[${i}] must be a finite number, received ${typeof value}`)
		}
		if (!Number.isFinite(value)) {
			throw new RangeError(`${name}[${i}] must be a finite number, received ${value}`)
		}
	}
}

/**
 * Computes the exact IEEE-754 rounding error `err = u * v - fl(u * v)` via
 * Veltkamp splitting and Dekker's TwoProd algorithm when inputs and product
 * are within safe normal bounds; otherwise returns 0.
 *
 * @param {number} u - First factor.
 * @param {number} v - Second factor.
 * @param {number} p - Floating-point product `u * v`.
 * @returns {number} Exact rounding error of `u * v`, or 0 outside safe normal range.
 */
function twoProdError(u, v, p) {
	if (p === 0 || !Number.isFinite(p)) {
		return 0
	}
	const absP = Math.abs(p)
	if (
		absP < PROD_SAFE_MIN ||
		absP > PROD_SAFE_MAX ||
		Math.abs(u) > SPLIT_SAFE_MAX ||
		Math.abs(v) > SPLIT_SAFE_MAX
	) {
		return 0
	}

	const cu = VELTKAMP_SPLIT * u
	const uHi = cu - (cu - u)
	const uLo = u - uHi

	const cv = VELTKAMP_SPLIT * v
	const vHi = cv - (cv - v)
	const vLo = v - vHi

	const err = ((uHi * vHi - p) + uHi * vLo + uLo * vHi) + uLo * vLo
	return Number.isFinite(err) ? err : 0
}

/**
 * Computes the 2x2 determinant minor `u * v - x * y` using error-free
 * Dekker–Veltkamp product splitting and Knuth's TwoDiff transformation to
 * eliminate catastrophic cancellation for nearly collinear vectors.
 * Normalizes `-0` to `+0`.
 *
 * @param {number} u - Top-left entry.
 * @param {number} v - Bottom-right entry.
 * @param {number} x - Top-right entry.
 * @param {number} y - Bottom-left entry.
 * @returns {number} Compensated 2x2 determinant `u * v - x * y`.
 */
function compensatedDet2(u, v, x, y) {
	const p = u * v
	const q = x * y
	const s = p - q

	if (!Number.isFinite(p) || !Number.isFinite(q) || !Number.isFinite(s)) {
		return s === 0 ? 0 : s
	}

	// Exact rounding error of p - q via Knuth's TwoDiff: p - q = s + diffErr.
	const bv = s - p
	const diffErr = (p - (s - bv)) - (q + bv)

	// Exact rounding errors of the two products: u*v = p + pErr, x*y = q + qErr.
	const pErr = twoProdError(u, v, p)
	const qErr = twoProdError(x, y, q)

	const correction = (Number.isFinite(diffErr) ? diffErr : 0) + (pErr - qErr)
	const result = s + correction
	return result === 0 ? 0 : result
}

/**
 * Computes the 3D vector cross product `a × b` over IEEE-754 float64 3-element arrays.
 *
 * Uses the closed-form Levi-Civita / cofactor expansion:
 *   `(a × b)_i = sum_{j,k} ε_{ijk} a_j b_k`
 *   - `c_0 = +(a_1 * b_2 - a_2 * b_1)`
 *   - `c_1 = -(a_0 * b_2 - a_2 * b_0) = a_2 * b_0 - a_0 * b_2`
 *   - `c_2 = +(a_0 * b_1 - a_1 * b_0)`
 *
 * Each 2x2 determinant minor is evaluated with Dekker–Veltkamp TwoProd and
 * Knuth TwoDiff error-free transformations to mitigate catastrophic cancellation
 * on nearly parallel vectors while remaining exact for IEEE-754 float64 arithmetic.
 * Negative zero (`-0`) components are normalized to `+0`.
 *
 * @param {number[]} a - First 3D vector `[a0, a1, a2]` of finite numbers.
 * @param {number[]} b - Second 3D vector `[b0, b1, b2]` of finite numbers.
 * @returns {number[]} The 3D cross product `[c0, c1, c2]`.
 * @throws {TypeError} If `a` or `b` is not an Array or contains a non-number element.
 * @throws {RangeError} If `a` or `b` does not have length 3 or contains `NaN` / `±Infinity`.
 */
export function crossProductFloatSeries(a, b) {
	validateVector3(a, 'a')
	validateVector3(b, 'b')

	const [a0, a1, a2] = a
	const [b0, b1, b2] = b

	// Cofactor / cyclic Levi-Civita expansion: c_i = a_{(i+1)%3} * b_{(i+2)%3} - a_{(i+2)%3} * b_{(i+1)%3}
	const c0 = compensatedDet2(a1, b2, a2, b1)
	const c1 = compensatedDet2(a2, b0, a0, b2)
	const c2 = compensatedDet2(a0, b1, a1, b0)

	return [c0, c1, c2]
}
