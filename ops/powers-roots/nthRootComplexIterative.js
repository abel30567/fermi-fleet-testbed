/**
 * Computes the principal complex n-th root of a complex number `z = { re, im }`
 * for a positive integer `n`, using a polar initial estimate refined via
 * iterative Newton-Raphson iterations on `f(w) = w^n - z = 0`.
 *
 * The principal branch uses `Arg(z) = atan2(im, re)` in `(-π, π]`, so the
 * principal n-th root has modulus `|z|^(1/n)` and argument `Arg(z) / n` in
 * `(-π/n, π/n]`.
 *
 * @param {{ re: number, im: number }} z - Complex radicand with finite numeric `re` and `im` components.
 * @param {number} n - Positive safe integer root degree (`n >= 1`).
 * @param {object} [options] - Optional refinement settings.
 * @param {number} [options.maxIterations=100] - Maximum Newton-Raphson iterations (positive safe integer).
 * @param {number} [options.tolerance=1e-15] - Relative convergence tolerance (positive finite number).
 * @returns {{ re: number, im: number }} The principal complex n-th root of `z`.
 * @throws {TypeError} If `z` is not a plain-like object with numeric `re` and `im`, `n` is not a number,
 *   or `options` / option fields have invalid types.
 * @throws {RangeError} If `z.re` or `z.im` is non-finite (`NaN`, `±Infinity`), `n` is not a positive
 *   safe integer, `maxIterations` is not a positive safe integer, or `tolerance` is not a positive finite number.
 */
export function nthRootComplexIterative(z, n, options = undefined) {
	if (typeof z !== 'object' || z === null || Array.isArray(z)) {
		throw new TypeError('z must be an object with numeric re and im properties')
	}
	if (typeof z.re !== 'number' || typeof z.im !== 'number') {
		throw new TypeError('z.re and z.im must be numbers')
	}
	if (!Number.isFinite(z.re) || !Number.isFinite(z.im)) {
		throw new RangeError('z.re and z.im must be finite numbers')
	}

	if (typeof n !== 'number') {
		throw new TypeError('n must be a number')
	}
	if (!Number.isSafeInteger(n) || n < 1) {
		throw new RangeError('n must be a positive safe integer')
	}

	let maxIterations = 100
	let tolerance = 1e-15

	if (options !== undefined) {
		if (typeof options !== 'object' || options === null || Array.isArray(options)) {
			throw new TypeError('options must be an object when provided')
		}
		if (options.maxIterations !== undefined) {
			if (typeof options.maxIterations !== 'number') {
				throw new TypeError('options.maxIterations must be a number')
			}
			if (!Number.isSafeInteger(options.maxIterations) || options.maxIterations < 1) {
				throw new RangeError('options.maxIterations must be a positive safe integer')
			}
			maxIterations = options.maxIterations
		}
		if (options.tolerance !== undefined) {
			if (typeof options.tolerance !== 'number') {
				throw new TypeError('options.tolerance must be a number')
			}
			if (!Number.isFinite(options.tolerance) || options.tolerance <= 0) {
				throw new RangeError('options.tolerance must be a positive finite number')
			}
			tolerance = options.tolerance
		}
	}

	// Normalize -0 to +0 so atan2(0, -x) yields +π (principal branch (-π, π]).
	const re = z.re === 0 ? 0 : z.re
	const im = z.im === 0 ? 0 : z.im

	if (re === 0 && im === 0) {
		return { re: 0, im: 0 }
	}

	if (n === 1) {
		return { re, im }
	}

	// Compute initial polar estimate, scaling by 0.5 if hypot(re, im) would overflow.
	let radius = Math.hypot(re, im)
	let initRadius
	if (Number.isFinite(radius)) {
		initRadius = Math.pow(radius, 1 / n)
	} else {
		const halfRadius = Math.hypot(re * 0.5, im * 0.5)
		initRadius = Math.pow(2, 1 / n) * Math.pow(halfRadius, 1 / n)
	}

	const theta = Math.atan2(im, re) / n
	const initRe = initRadius * Math.cos(theta)
	const initIm = initRadius * Math.sin(theta)

	let wRe = initRe
	let wIm = initIm

	// Half the chord distance to the nearest distinct n-th root, guarding against branch jumps.
	const branchGuard = 0.5 * initRadius * Math.sin(Math.PI / n)

	for (let iter = 0; iter < maxIterations; iter++) {
		const pow = complexPowInt(wRe, wIm, n - 1)
		if (!Number.isFinite(pow.re) || !Number.isFinite(pow.im) || (pow.re === 0 && pow.im === 0)) {
			break
		}

		const quotient = complexDiv(re, im, pow.re, pow.im)
		if (!Number.isFinite(quotient.re) || !Number.isFinite(quotient.im)) {
			break
		}

		const deltaRe = (wRe - quotient.re) / n
		const deltaIm = (wIm - quotient.im) / n
		const nextRe = wRe - deltaRe
		const nextIm = wIm - deltaIm

		if (!Number.isFinite(nextRe) || !Number.isFinite(nextIm)) {
			break
		}

		// Ensure numerical noise at extreme n never pushes the iterate outside the principal basin.
		if (Math.hypot(nextRe - initRe, nextIm - initIm) > branchGuard) {
			break
		}

		wRe = nextRe
		wIm = nextIm

		const stepNorm = Math.hypot(deltaRe, deltaIm)
		const valNorm = Math.hypot(wRe, wIm)
		if (stepNorm <= tolerance * valNorm) {
			break
		}
	}

	return {
		re: wRe === 0 ? 0 : wRe,
		im: wIm === 0 ? 0 : wIm,
	}
}

/**
 * Computes `(re + i*im)^exp` for a non-negative integer `exp` via iterative binary exponentiation.
 *
 * @param {number} re
 * @param {number} im
 * @param {number} exp
 * @returns {{ re: number, im: number }}
 */
function complexPowInt(re, im, exp) {
	let resRe = 1
	let resIm = 0
	let baseRe = re
	let baseIm = im
	let e = exp

	while (e > 0) {
		if (e % 2 === 1) {
			const nextRe = resRe * baseRe - resIm * baseIm
			const nextIm = resRe * baseIm + resIm * baseRe
			resRe = nextRe
			resIm = nextIm
		}
		e = Math.floor(e / 2)
		if (e > 0) {
			const nextBaseRe = baseRe * baseRe - baseIm * baseIm
			const nextBaseIm = 2 * baseRe * baseIm
			baseRe = nextBaseRe
			baseIm = nextBaseIm
		}
	}

	return { re: resRe, im: resIm }
}

/**
 * Computes `(a + i*b) / (c + i*d)` using Smith's scaling method to avoid intermediate overflow/underflow.
 *
 * @param {number} a
 * @param {number} b
 * @param {number} c
 * @param {number} d
 * @returns {{ re: number, im: number }}
 */
function complexDiv(a, b, c, d) {
	if (Math.abs(c) >= Math.abs(d)) {
		const ratio = d / c
		const denom = c + d * ratio
		return {
			re: (a + b * ratio) / denom,
			im: (b - a * ratio) / denom,
		}
	}
	const ratio = c / d
	const denom = d + c * ratio
	return {
		re: (a * ratio + b) / denom,
		im: (b * ratio - a) / denom,
	}
}
