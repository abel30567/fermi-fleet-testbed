/**
 * Computes the principal natural logarithm of a single complex number `z = re + im·i`.
 *
 * Uses a scaling-safe formulation for `ln(|z|)` to avoid overflow/underflow at
 * extreme magnitudes and preserves accuracy near the unit circle `|z| ≈ 1`.
 *
 * @param {{ re: number, im: number }} z - Finite non-zero complex number.
 * @returns {{ re: number, im: number }} Principal value `Ln(z) = ln(|z|) + i·arg(z)` with `arg(z) ∈ [-π, π]`.
 * @throws {TypeError} If `z` is not a `{ re, im }` object with numeric `re` and `im`.
 * @throws {RangeError} If `re` or `im` is not finite, or if `z` is `0 + 0i`.
 */
function lnComplexScalar(z) {
	if (z === null || typeof z !== 'object' || Array.isArray(z)) {
		throw new TypeError('Each element must be a complex number object of the form { re, im }')
	}

	const { re, im } = z
	if (typeof re !== 'number' || typeof im !== 'number') {
		throw new TypeError('Complex number properties "re" and "im" must be numbers')
	}
	if (!Number.isFinite(re) || !Number.isFinite(im)) {
		throw new RangeError('Complex number properties "re" and "im" must be finite numbers')
	}
	if (re === 0 && im === 0) {
		throw new RangeError('Complex natural logarithm is undefined at 0 + 0i')
	}

	const absRe = Math.abs(re)
	const absIm = Math.abs(im)
	const hi = Math.max(absRe, absIm)
	const lo = Math.min(absRe, absIm)

	let logModulus
	if (hi >= 0.5 && hi <= 2) {
		logModulus = 0.5 * Math.log1p((hi - 1) * (hi + 1) + lo * lo)
	} else {
		const ratio = lo / hi
		logModulus = Math.log(hi) + 0.5 * Math.log1p(ratio * ratio)
	}

	return {
		re: logModulus === 0 ? 0 : logModulus,
		im: Math.atan2(im, re),
	}
}

/**
 * Internal generator yielding principal complex natural logarithms one element at a time.
 *
 * @param {Iterable<{ re: number, im: number }>} values
 * @returns {Generator<{ re: number, im: number }, void, void>}
 */
function* generateLnComplex(values) {
	for (const z of values) {
		yield lnComplexScalar(z)
	}
}

/**
 * Lazily computes the principal natural logarithm `Ln(z)` over a sequence of complex numbers `{ re, im }`.
 *
 * Returns a generator that consumes the input iterable strictly on demand (one item per `.next()` call),
 * supporting infinite sequences and early termination with proper iterator cleanup.
 *
 * For each `z = re + im·i` (`z ≠ 0`), yields `{ re: ln(|z|), im: atan2(im, re) }`, where the imaginary
 * part lies on the principal branch `(-π, π]` (preserving `-π` for `-r - 0i` per IEEE 754 signed zero).
 *
 * @param {Iterable<{ re: number, im: number }>} values - Iterable sequence of finite non-zero complex numbers.
 * @returns {Generator<{ re: number, im: number }, void, void>} Generator yielding `{ re, im }` logarithms.
 * @throws {TypeError} Immediately if `values` is not a non-string iterable, or during iteration if an element is malformed.
 * @throws {RangeError} During iteration if an element has non-finite components or is `0 + 0i`.
 */
export function lnComplexLazy(values) {
	if (
		values === null ||
		values === undefined ||
		typeof values === 'string' ||
		typeof values[Symbol.iterator] !== 'function'
	) {
		throw new TypeError('Input must be a non-string iterable of complex numbers { re, im }')
	}

	return generateLnComplex(values)
}
