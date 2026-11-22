/**
 * Computes the principal square root of a complex number using iterative
 * Newton-Raphson refinement.
 *
 * For a complex number `z = re + im * i`, returns `w = { re, im }` such that
 * `w * w = z` on the principal branch (`w.re > 0`, or `w.re === 0 && w.im >= 0`).
 *
 * Uses exact power-of-two scaling to avoid intermediate overflow and underflow
 * across the full IEEE-754 double range, followed by iterative Newton-Raphson
 * updates `w_{k+1} = 0.5 * (w_k + z / w_k)`.
 *
 * @param {{ re: number, im: number }} z - Complex number with finite real and imaginary parts.
 * @param {{ tolerance?: number, maxIterations?: number }} [options] - Optional convergence controls.
 * @param {number} [options.tolerance=1e-15] - Positive finite relative convergence tolerance.
 * @param {number} [options.maxIterations=100] - Positive safe integer maximum iteration count.
 * @returns {{ re: number, im: number }} Principal square root of `z`.
 * @throws {TypeError} If `z` is not a non-null object, `z.re` or `z.im` are not numbers,
 *   or `options` / its properties have invalid types.
 * @throws {RangeError} If `z.re` or `z.im` are not finite, `options.tolerance` is not a
 *   positive finite number, or `options.maxIterations` is not a positive safe integer.
 */
export function sqrtComplexIterative(z, options) {
	if (z === null || typeof z !== 'object' || Array.isArray(z)) {
		throw new TypeError('Expected z to be a complex number object { re, im }');
	}

	const { re, im } = z;
	if (typeof re !== 'number' || typeof im !== 'number') {
		throw new TypeError('Expected z.re and z.im to be numbers');
	}
	if (!Number.isFinite(re) || !Number.isFinite(im)) {
		throw new RangeError('Expected z.re and z.im to be finite numbers');
	}

	let tolerance = 1e-15;
	let maxIterations = 100;

	if (options !== undefined) {
		if (options === null || typeof options !== 'object' || Array.isArray(options)) {
			throw new TypeError('Expected options to be an object');
		}
		if (options.tolerance !== undefined) {
			if (typeof options.tolerance !== 'number') {
				throw new TypeError('Expected options.tolerance to be a number');
			}
			if (!Number.isFinite(options.tolerance) || options.tolerance <= 0) {
				throw new RangeError('Expected options.tolerance to be a positive finite number');
			}
			tolerance = options.tolerance;
		}
		if (options.maxIterations !== undefined) {
			if (typeof options.maxIterations !== 'number') {
				throw new TypeError('Expected options.maxIterations to be a number');
			}
			if (!Number.isSafeInteger(options.maxIterations) || options.maxIterations < 1) {
				throw new RangeError('Expected options.maxIterations to be a positive safe integer');
			}
			maxIterations = options.maxIterations;
		}
	}

	// Normalize -0 to 0 so branch checks behave consistently.
	const a = re === 0 ? 0 : re;
	const b = im === 0 ? 0 : im;

	if (a === 0 && b === 0) {
		return { re: 0, im: 0 };
	}

	// Scale z by an exact even power of 2: z' = z * 2^(-2 * halfExp),
	// keeping max(|aScaled|, |bScaled|) in [1, 4) with no overflow/underflow.
	const maxComponent = Math.max(Math.abs(a), Math.abs(b));
	const exp = Math.floor(Math.log2(maxComponent));
	const halfExp = Math.floor(exp / 2);
	const invScale = 2 ** -halfExp;
	const scaleUp = 2 ** halfExp;

	const aScaled = (a * invScale) * invScale;
	const bScaled = (b * invScale) * invScale;

	// If b is nonzero but so tiny compared to |a| that scaling pushed bScaled
	// near/into subnormal underflow, solve the dominant axis iteratively and
	// compute the orthogonal component directly via b / (2 * dominant).
	const tinyImagUnderflow = b !== 0 && Math.abs(bScaled) < 1e-290;
	const iterB = tinyImagUnderflow ? 0 : bScaled;

	// Choose initial guess strictly inside the principal root's Newton basin
	// (within pi/8 radians of the principal square root in all cases).
	let u;
	let v;
	if (Math.abs(iterB) > Math.abs(aScaled)) {
		u = 1;
		v = iterB < 0 ? -1 : 1;
	} else if (aScaled >= 0) {
		u = 1;
		v = 0;
	} else {
		u = 0;
		v = b < 0 ? -1 : 1;
	}

	// Iterative Newton-Raphson: w_{k+1} = 0.5 * (w_k + z' / w_k)
	for (let i = 0; i < maxIterations; i++) {
		const denom = u * u + v * v;
		const qRe = (aScaled * u + iterB * v) / denom;
		const qIm = (iterB * u - aScaled * v) / denom;
		const nextU = 0.5 * (u + qRe);
		const nextV = 0.5 * (v + qIm);

		const uConverged = Math.abs(nextU - u) <= tolerance * Math.abs(nextU);
		const vConverged = Math.abs(nextV - v) <= tolerance * Math.abs(nextV);

		u = nextU;
		v = nextV;

		if (uConverged && vConverged) {
			break;
		}
	}

	u *= scaleUp;
	v *= scaleUp;

	if (tinyImagUnderflow) {
		if (a > 0) {
			v = (b / u) * 0.5;
		} else {
			u = Math.abs(b / v) * 0.5;
		}
	}

	// Guarantee principal branch: re > 0, or re === 0 && im >= 0.
	if (u < 0 || (u === 0 && v < 0)) {
		u = -u;
		v = -v;
	}

	return {
		re: u === 0 ? 0 : u,
		im: v === 0 ? 0 : v,
	};
}
