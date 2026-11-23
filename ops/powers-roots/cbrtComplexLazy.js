const SQRT3_OVER_2 = Math.sqrt(3) / 2;
const SCALE_DOWN = 2 ** -513;
const SCALE_UP_CBRT = 2 ** 171;

/**
 * Validate a complex number represented as `{ re, im }`.
 *
 * @param {unknown} value - Candidate complex number.
 * @param {number} index - Zero-based position in the input sequence.
 * @returns {{ re: number, im: number }} Normalized finite complex components.
 */
function validateComplex(value, index) {
	if (typeof value !== 'object' || value === null || Array.isArray(value)) {
		throw new TypeError(
			`Expected complex number object { re, im } at index ${index}`,
		);
	}

	const { re, im } = value;
	if (typeof re !== 'number' || typeof im !== 'number') {
		throw new TypeError(
			`Expected numeric re and im properties at index ${index}`,
		);
	}

	if (!Number.isFinite(re) || !Number.isFinite(im)) {
		throw new RangeError(
			`Expected finite re and im properties at index ${index}`,
		);
	}

	return {
		re: re === 0 ? 0 : re,
		im: im === 0 ? 0 : im,
	};
}

/**
 * Compute the principal cube root of a single validated complex number `{ re, im }`.
 *
 * Uses the principal branch `arg(z) in (-pi, pi]`, yielding `arg(cbrt(z)) in (-pi/3, pi/3]`.
 *
 * @param {number} re - Real part (finite, `-0` normalized to `0`).
 * @param {number} im - Imaginary part (finite, `-0` normalized to `0`).
 * @returns {{ re: number, im: number }} Principal complex cube root.
 */
function cbrtComplexScalar(re, im) {
	if (re === 0 && im === 0) {
		return { re: 0, im: 0 };
	}

	if (im === 0) {
		if (re > 0) {
			return { re: Math.cbrt(re), im: 0 };
		}
		const mag = Math.cbrt(-re);
		return { re: mag * 0.5, im: mag * SQRT3_OVER_2 };
	}

	if (re === 0) {
		const mag = Math.cbrt(Math.abs(im));
		return {
			re: mag * SQRT3_OVER_2,
			im: im > 0 ? mag * 0.5 : -mag * 0.5,
		};
	}

	let r = Math.hypot(re, im);
	let mag;
	if (Number.isFinite(r)) {
		mag = Math.cbrt(r);
	} else {
		// Prevent overflow when hypot(re, im) exceeds Number.MAX_VALUE.
		const scaledR = Math.hypot(re * SCALE_DOWN, im * SCALE_DOWN);
		mag = Math.cbrt(scaledR) * SCALE_UP_CBRT;
	}

	const thetaOver3 = Math.atan2(im, re) / 3;
	const outRe = mag * Math.cos(thetaOver3);
	const outIm = mag * Math.sin(thetaOver3);

	return {
		re: outRe === 0 ? 0 : outRe,
		im: outIm === 0 ? 0 : outIm,
	};
}

/**
 * Lazily computes the principal complex cube root (`z^(1/3)`) for each complex number
 * `{ re, im }` in an iterable sequence.
 *
 * The input iterable is validated eagerly (must be a non-string iterable), while its
 * elements are pulled, validated, and transformed on demand via a generator.
 *
 * Principal branch convention: `arg(z) in (-pi, pi]`, so `-0` imaginary parts are
 * normalized to `+0` and negative real numbers map to the upper half-plane
 * (`|re|^(1/3) * (1/2 + i*sqrt(3)/2)`).
 *
 * @param {Iterable<{ re: number, im: number }>} values - Iterable of complex numbers `{ re, im }`.
 * @returns {Generator<{ re: number, im: number }, void, undefined>} Lazy generator yielding principal cube roots.
 * @throws {TypeError} If `values` is not a non-string iterable, or if an element is not `{ re: number, im: number }`.
 * @throws {RangeError} If an element's `re` or `im` is not finite (`NaN`, `Infinity`, or `-Infinity`).
 */
export function cbrtComplexLazy(values) {
	if (
		values === null ||
		values === undefined ||
		typeof values === 'string' ||
		typeof values[Symbol.iterator] !== 'function'
	) {
		throw new TypeError(
			'Expected a non-string iterable of complex numbers { re, im }',
		);
	}

	return (function* generate() {
		let index = 0;
		for (const item of values) {
			const { re, im } = validateComplex(item, index);
			yield cbrtComplexScalar(re, im);
			index += 1;
		}
	})();
}
