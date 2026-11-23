/**
 * Validates that a value is a finite complex number object `{ re, im }`.
 *
 * @param {unknown} value - Value to validate.
 * @param {string} name - Parameter name for error reporting.
 * @throws {TypeError} If the value is not a valid `{ re, im }` object with finite numbers.
 */
function validateComplex(value, name) {
	if (typeof value !== 'object' || value === null || Array.isArray(value)) {
		throw new TypeError(`${name} must be a complex number object { re, im }`);
	}
	if (
		typeof value.re !== 'number' ||
		typeof value.im !== 'number' ||
		!Number.isFinite(value.re) ||
		!Number.isFinite(value.im)
	) {
		throw new TypeError(`${name}.re and ${name}.im must be finite numbers`);
	}
}

/**
 * Divides a single complex number `a` by `b` using Smith's scaling formula
 * to avoid intermediate overflow and underflow.
 *
 * @param {{ re: number, im: number }} a - Dividend complex number.
 * @param {{ re: number, im: number }} b - Divisor complex number.
 * @returns {{ re: number, im: number }} Quotient `a / b`.
 * @throws {RangeError} If `b` is zero (`{ re: 0, im: 0 }`).
 */
function dividePair(a, b) {
	if (b.re === 0 && b.im === 0) {
		throw new RangeError('Division by zero complex number');
	}

	let re;
	let im;

	if (Math.abs(b.re) >= Math.abs(b.im)) {
		const ratio = b.im / b.re;
		const denom = b.re + b.im * ratio;
		re = (a.re + a.im * ratio) / denom;
		im = (a.im - a.re * ratio) / denom;
	} else {
		const ratio = b.re / b.im;
		const denom = b.im + b.re * ratio;
		re = (a.re * ratio + a.im) / denom;
		im = (a.im * ratio - a.re) / denom;
	}

	return {
		re: re === 0 ? 0 : re,
		im: im === 0 ? 0 : im,
	};
}

/**
 * Divides complex numbers represented as `{ re, im }` using a straightforward
 * iterative implementation (left-associative: `((a / b) / c) / ...`).
 *
 * Uses Smith's scaling formula per step to prevent intermediate overflow and
 * underflow for very large or very small magnitudes.
 *
 * @param {{ re: number, im: number }} a - Dividend complex number.
 * @param {{ re: number, im: number }} b - First divisor complex number.
 * @param {...{ re: number, im: number }} rest - Optional additional divisors applied iteratively left-to-right.
 * @returns {{ re: number, im: number }} Resulting complex quotient `{ re, im }`.
 * @throws {TypeError} If any argument is not a valid `{ re, im }` object with finite numeric components.
 * @throws {RangeError} If any divisor is zero (`{ re: 0, im: 0 }`).
 */
export function divideComplexIterative(a, b, ...rest) {
	validateComplex(a, 'a');
	validateComplex(b, 'b');

	const divisors = [b, ...rest];
	let acc = { re: a.re, im: a.im };

	for (let i = 0; i < divisors.length; i++) {
		const divisor = divisors[i];
		if (i > 0) {
			validateComplex(divisor, `rest[${i - 1}]`);
		}
		acc = dividePair(acc, divisor);
	}

	return acc;
}
