/**
 * @typedef {{ re: number, im: number }} Complex
 */

const SCALE_DOWN_THRESHOLD = 1e150
const SCALE_UP_THRESHOLD = 1e-150
const SCALE_UP_IN = 2 ** 512
const SCALE_UP_OUT = 2 ** -256

/**
 * Validates that a value is a finite complex number `{ re, im }`.
 *
 * @param {unknown} value
 * @returns {Complex}
 * @throws {TypeError} If `value` is not a plain-like object with numeric `re` and `im` properties.
 * @throws {RangeError} If `re` or `im` is `NaN` or infinite.
 */
function validateComplex(value) {
	if (typeof value !== 'object' || value === null || Array.isArray(value)) {
		throw new TypeError('Each element must be a complex number object { re, im }')
	}
	const { re, im } = value
	if (typeof re !== 'number' || typeof im !== 'number') {
		throw new TypeError('Complex number components "re" and "im" must be numbers')
	}
	if (!Number.isFinite(re) || !Number.isFinite(im)) {
		throw new RangeError('Complex number components "re" and "im" must be finite numbers')
	}
	return { re, im }
}

/**
 * Computes the principal square root of a single finite complex number `{ re, im }`.
 *
 * Uses a cancellation-free formulation with power-of-two rescaling for extreme
 * magnitudes so overflow and subnormal underflow are avoided across the full
 * IEEE-754 double range. The principal branch satisfies `Re(sqrt(z)) >= 0`,
 * with the branch cut along the negative real axis (`sqrt(-x) = i * sqrt(x)` for `x > 0`).
 *
 * @param {Complex} z
 * @returns {Complex}
 */
function sqrtComplexScalar({ re, im }) {
	const maxAbs = Math.max(Math.abs(re), Math.abs(im))
	if (maxAbs === 0) {
		return { re: 0, im: 0 }
	}

	let a = re
	let b = im
	let scaleOut = 1

	if (maxAbs > SCALE_DOWN_THRESHOLD) {
		a *= 0.25
		b *= 0.25
		scaleOut = 2
	} else if (maxAbs < SCALE_UP_THRESHOLD) {
		a *= SCALE_UP_IN
		b *= SCALE_UP_IN
		scaleOut = SCALE_UP_OUT
	}

	const r = Math.hypot(a, b)
	const w = Math.sqrt(r * 0.5 + Math.abs(a) * 0.5)

	let u
	let v
	if (a >= 0) {
		u = w
		v = b / (2 * w)
	} else {
		u = Math.abs(b) / (2 * w)
		v = b < 0 ? -w : w
	}

	u *= scaleOut
	v *= scaleOut

	return {
		re: u === 0 ? 0 : u,
		im: v === 0 ? 0 : v,
	}
}

/**
 * Internal generator that lazily consumes complex inputs and yields their principal square roots.
 *
 * @param {Iterable<Complex>} values
 * @returns {Generator<Complex, void, undefined>}
 */
function* sqrtComplexGenerator(values) {
	for (const item of values) {
		const z = validateComplex(item)
		yield sqrtComplexScalar(z)
	}
}

/**
 * Lazily computes the principal square root of each complex number `{ re, im }`
 * in an iterable sequence using a streaming generator.
 *
 * The input iterable is validated eagerly (must be an iterable and not a string),
 * while elements are pulled, validated, and transformed strictly on demand as
 * the returned generator is iterated. Supports infinite iterables and propagates
 * early termination (`break` / `.return()`) to the underlying iterator.
 *
 * @param {Iterable<Complex>} values - Iterable sequence of finite complex numbers `{ re, im }`.
 * @returns {Generator<Complex, void, undefined>} Generator yielding principal complex square roots `{ re, im }`.
 * @throws {TypeError} Eagerly if `values` is not a non-string iterable; lazily if an element is not `{ re, im }`.
 * @throws {RangeError} Lazily if an element's `re` or `im` is `NaN`, `Infinity`, or `-Infinity`.
 */
export function sqrtComplexLazy(values) {
	if (
		values == null ||
		typeof values === 'string' ||
		typeof values[Symbol.iterator] !== 'function'
	) {
		throw new TypeError('sqrtComplexLazy expects an iterable of complex numbers { re, im }')
	}
	return sqrtComplexGenerator(values)
}
