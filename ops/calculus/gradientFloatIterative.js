/**
 * Computes the numerical gradient of a scalar-valued multivariable function
 * over IEEE-754 float64 numbers using an iterative central finite-difference scheme.
 *
 * For each coordinate `i` in `0 .. point.length - 1`, approximates the partial derivative:
 *   ∂f/∂x_i ≈ (f(x + h·e_i) - f(x - h·e_i)) / ((x_i + h) - (x_i - h))
 *
 * @param {(x: number[]) => number} fn - Scalar-valued function accepting a float64 coordinate array.
 * @param {number[]} point - Evaluation point as an array of finite IEEE-754 float64 numbers.
 * @param {number} [h=1e-6] - Positive finite step size for central finite differences.
 * @returns {number[]} The gradient vector `[∂f/∂x_0, ..., ∂f/∂x_{n-1}]` as float64 numbers.
 * @throws {TypeError} If `fn` is not a function, `point` is not an array of numbers,
 *   `h` is not a number, or `fn` returns a non-number value.
 * @throws {RangeError} If any coordinate in `point` is non-finite, `h` is not a positive
 *   finite number, coordinate perturbation overflows or underflows float64 precision,
 *   `fn` returns a non-finite value, or a computed partial derivative is non-finite.
 */
export function gradientFloatIterative(fn, point, h = 1e-6) {
	if (typeof fn !== 'function') {
		throw new TypeError('fn must be a function');
	}
	if (!Array.isArray(point)) {
		throw new TypeError('point must be an array of finite numbers');
	}
	if (typeof h !== 'number') {
		throw new TypeError('h must be a number');
	}
	if (!Number.isFinite(h) || h <= 0) {
		throw new RangeError('h must be a positive finite number');
	}

	const n = point.length;
	for (let i = 0; i < n; i++) {
		if (!(i in point) || typeof point[i] !== 'number') {
			throw new TypeError(`point[${i}] must be a number`);
		}
		if (!Number.isFinite(point[i])) {
			throw new RangeError(`point[${i}] must be a finite number`);
		}
	}

	const grad = new Array(n);

	for (let i = 0; i < n; i++) {
		const xi = point[i];
		const xPlus = xi + h;
		const xMinus = xi - h;

		if (!Number.isFinite(xPlus) || !Number.isFinite(xMinus)) {
			throw new RangeError(`step size h overflows float64 at coordinate ${i}`);
		}

		const dx = xPlus - xMinus;
		if (!Number.isFinite(dx) || dx === 0) {
			throw new RangeError(`step size h underflows float64 precision at coordinate ${i}`);
		}

		const plusPoint = point.slice();
		plusPoint[i] = xPlus;
		const fPlus = fn(plusPoint);
		if (typeof fPlus !== 'number') {
			throw new TypeError(`fn must return a number (got ${typeof fPlus})`);
		}
		if (!Number.isFinite(fPlus)) {
			throw new RangeError(`fn returned a non-finite value at +h for coordinate ${i}`);
		}

		const minusPoint = point.slice();
		minusPoint[i] = xMinus;
		const fMinus = fn(minusPoint);
		if (typeof fMinus !== 'number') {
			throw new TypeError(`fn must return a number (got ${typeof fMinus})`);
		}
		if (!Number.isFinite(fMinus)) {
			throw new RangeError(`fn returned a non-finite value at -h for coordinate ${i}`);
		}

		const partial = (fPlus - fMinus) / dx;
		if (!Number.isFinite(partial)) {
			throw new RangeError(`partial derivative overflowed float64 at coordinate ${i}`);
		}

		grad[i] = partial === 0 ? 0 : partial;
	}

	return grad;
}
