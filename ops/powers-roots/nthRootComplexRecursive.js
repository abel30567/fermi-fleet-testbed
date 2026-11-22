/**
 * Computes the n-th root of a complex number using a recursive
 * divide-and-conquer algorithm.
 *
 * Algorithm:
 * 1. Normalizes `z` by `scale = max(|re|, |im|)` to prevent intermediate
 *    overflow and underflow across extreme magnitudes.
 * 2. Computes the principal n-th root of the normalized complex number
 *    recursively by factoring `n`:
 *    - `n === 1`: base case returning `z`.
 *    - Even `n`: computes the exact principal complex square root and recurses
 *      on `n / 2`.
 *    - Composite odd `n`: splits `n = factor * (n / factor)` and recurses
 *      `principalNthRoot(principalNthRoot(z, factor), n / factor)` (valid with
 *      no branch-cut crossing because `Arg(z) ∈ (-π, π]` maps into
 *      `(-π/factor, π/factor] ⊂ (-π, π]`).
 *    - Prime odd `n >= 3`: starts on the exact principal ray `exp(i * Arg(z) / n)`
 *      and refines via recursive Newton-Raphson iteration on `w^n - z = 0`,
 *      computing `w^(n - 1)` by recursive divide-and-conquer binary
 *      exponentiation.
 * 3. Computes the real scale factor `scale^(1 / n)` recursively via
 *    factorization and Newton refinement, then scales the principal root.
 * 4. For non-zero branch index `k`, rotates the principal root by the
 *    `n`-th root of unity `exp(i * 2π * (k mod n) / n)`.
 *
 * Branch convention:
 * Uses the principal argument `Arg(z) = atan2(im, re) ∈ (-π, π]` with `-0`
 * normalized to `0` so negative real numbers lie on the upper branch cut
 * (`Arg(-x) = +π`). The `k`-th root is:
 *   `w_k = |z|^(1/n) * exp(i * (Arg(z) + 2π * ((k mod n + n) mod n)) / n)`.
 *
 * @param {{ re: number, im: number }} z - Complex radicand with finite real and imaginary parts.
 * @param {number} n - Positive safe integer root degree (`n >= 1`).
 * @param {number} [k=0] - Optional safe integer branch index (normalized modulo `n`; `0` gives the principal root).
 * @returns {{ re: number, im: number }} The `k`-th complex `n`-th root of `z`.
 * @throws {TypeError} If `z` is not a complex number object `{ re, im }` with numeric parts, or if `n` or `k` is not a number.
 * @throws {RangeError} If `z.re` or `z.im` is non-finite, if `n` is not a positive safe integer, or if `k` is not a finite safe integer.
 */
export function nthRootComplexRecursive(z, n, k = 0) {
	validateComplex(z, 'z');
	validateDegree(n);
	validateBranchIndex(k);

	const re = normalizeZero(z.re);
	const im = normalizeZero(z.im);

	if (re === 0 && im === 0) {
		return { re: 0, im: 0 };
	}

	if (n === 1) {
		return { re, im };
	}

	const scale = Math.max(Math.abs(re), Math.abs(im));
	const zNorm = {
		re: normalizeZero(re / scale),
		im: normalizeZero(im / scale),
	};

	const unitPrincipal = principalNthRootRecursive(zNorm, n);
	const scaleRoot = realNthRootRecursive(scale, n);

	const principal = {
		re: normalizeZero(unitPrincipal.re * scaleRoot),
		im: normalizeZero(unitPrincipal.im * scaleRoot),
	};

	const kMod = ((k % n) + n) % n;
	if (kMod === 0) {
		return principal;
	}

	const rotation = rootOfUnity(kMod, n);
	const rotated = mulComplex(principal, rotation);
	return {
		re: normalizeZero(rotated.re),
		im: normalizeZero(rotated.im),
	};
}

/**
 * Normalizes `-0` to `0`.
 * @param {number} x
 * @returns {number}
 */
function normalizeZero(x) {
	return x === 0 ? 0 : x;
}

/**
 * Validates that `z` is a plain-like object with finite numeric `re` and `im`.
 * @param {unknown} z
 * @param {string} name
 */
function validateComplex(z, name) {
	if (typeof z !== 'object' || z === null || Array.isArray(z)) {
		throw new TypeError(`${name} must be an object with numeric { re, im } properties`);
	}
	if (typeof z.re !== 'number' || typeof z.im !== 'number') {
		throw new TypeError(`${name}.re and ${name}.im must be numbers`);
	}
	if (!Number.isFinite(z.re) || !Number.isFinite(z.im)) {
		throw new RangeError(`${name}.re and ${name}.im must be finite numbers`);
	}
}

/**
 * Validates that `n` is a positive safe integer.
 * @param {unknown} n
 */
function validateDegree(n) {
	if (typeof n !== 'number') {
		throw new TypeError('n must be a number');
	}
	if (!Number.isFinite(n)) {
		throw new RangeError('n must be a finite positive integer');
	}
	if (!Number.isSafeInteger(n) || n < 1) {
		throw new RangeError('n must be a positive safe integer (>= 1)');
	}
}

/**
 * Validates that `k` is a finite safe integer.
 * @param {unknown} k
 */
function validateBranchIndex(k) {
	if (typeof k !== 'number') {
		throw new TypeError('k must be a number');
	}
	if (!Number.isFinite(k) || !Number.isSafeInteger(k)) {
		throw new RangeError('k must be a finite safe integer');
	}
}

/**
 * Multiplies two complex numbers.
 * @param {{ re: number, im: number }} a
 * @param {{ re: number, im: number }} b
 * @returns {{ re: number, im: number }}
 */
function mulComplex(a, b) {
	return {
		re: a.re * b.re - a.im * b.im,
		im: a.re * b.im + a.im * b.re,
	};
}

/**
 * Divides two complex numbers using Smith's overflow-safe formula.
 * @param {{ re: number, im: number }} a
 * @param {{ re: number, im: number }} b
 * @returns {{ re: number, im: number }}
 */
function divComplex(a, b) {
	if (Math.abs(b.re) >= Math.abs(b.im)) {
		const ratio = b.im / b.re;
		const denom = b.re + b.im * ratio;
		return {
			re: (a.re + a.im * ratio) / denom,
			im: (a.im - a.re * ratio) / denom,
		};
	}
	const ratio = b.re / b.im;
	const denom = b.im + b.re * ratio;
	return {
		re: (a.re * ratio + a.im) / denom,
		im: (a.im * ratio - a.re) / denom,
	};
}

/**
 * Computes `z^exp` for a non-negative integer `exp` via recursive
 * divide-and-conquer binary exponentiation.
 * @param {{ re: number, im: number }} z
 * @param {number} exp
 * @returns {{ re: number, im: number }}
 */
function powComplexRecursive(z, exp) {
	if (exp === 0) {
		return { re: 1, im: 0 };
	}
	if (exp === 1) {
		return { re: z.re, im: z.im };
	}
	const half = powComplexRecursive(z, Math.floor(exp / 2));
	const squared = mulComplex(half, half);
	return exp % 2 === 0 ? squared : mulComplex(squared, z);
}

/**
 * Computes `x^exp` for a real number `x` and non-negative integer `exp` via
 * recursive divide-and-conquer binary exponentiation.
 * @param {number} x
 * @param {number} exp
 * @returns {number}
 */
function powRealRecursive(x, exp) {
	if (exp === 0) {
		return 1;
	}
	if (exp === 1) {
		return x;
	}
	const half = powRealRecursive(x, Math.floor(exp / 2));
	const squared = half * half;
	return exp % 2 === 0 ? squared : squared * x;
}

/**
 * Computes the exact principal complex square root of a scaled complex number
 * without catastrophic cancellation.
 * @param {{ re: number, im: number }} z
 * @returns {{ re: number, im: number }}
 */
function sqrtComplex(z) {
	const x = z.re;
	const y = z.im;
	if (x === 0 && y === 0) {
		return { re: 0, im: 0 };
	}
	const r = Math.hypot(x, y);
	if (x >= 0) {
		const re = Math.sqrt((r + x) / 2);
		const im = re === 0 ? 0 : y / (2 * re);
		return { re: normalizeZero(re), im: normalizeZero(im) };
	}
	const imMag = Math.sqrt((r - x) / 2);
	const im = y < 0 ? -imMag : imMag;
	const re = y === 0 ? 0 : y / (2 * im);
	return { re: normalizeZero(re), im: normalizeZero(im) };
}

/**
 * Finds the smallest odd factor `d >= 3` of an odd integer `n >= 3` up to a
 * bounded trial-division limit. Returns `n` if no smaller factor is found.
 * @param {number} n
 * @returns {number}
 */
function smallestOddFactor(n) {
	const limit = Math.min(Math.floor(Math.sqrt(n)), 100000);
	for (let d = 3; d <= limit; d += 2) {
		if (n % d === 0) {
			return d;
		}
	}
	return n;
}

/**
 * Recursively refines the principal `n`-th root of a normalized complex number
 * `z` using Newton-Raphson iteration on `w^n - z = 0`.
 * @param {{ re: number, im: number }} z
 * @param {number} n
 * @param {{ re: number, im: number }} w
 * @param {number} remainingSteps
 * @returns {{ re: number, im: number }}
 */
function newtonNthRootRecursive(z, n, w, remainingSteps) {
	const wPowPrev = powComplexRecursive(w, n - 1);
	if (!Number.isFinite(wPowPrev.re) || !Number.isFinite(wPowPrev.im)) {
		return w;
	}
	if (wPowPrev.re === 0 && wPowPrev.im === 0) {
		return w;
	}

	const ratio = divComplex(z, wPowPrev);
	const deltaRe = (ratio.re - w.re) / n;
	const deltaIm = (ratio.im - w.im) / n;
	const next = {
		re: w.re + deltaRe,
		im: w.im + deltaIm,
	};

	const stepMag = Math.hypot(deltaRe, deltaIm);
	const wMag = Math.hypot(next.re, next.im);

	if (
		remainingSteps <= 1 ||
		(next.re === w.re && next.im === w.im) ||
		stepMag <= 1e-15 * Math.max(1, wMag)
	) {
		return {
			re: normalizeZero(next.re),
			im: normalizeZero(next.im),
		};
	}

	return newtonNthRootRecursive(z, n, next, remainingSteps - 1);
}

/**
 * Computes the principal `n`-th root of a normalized non-zero complex number
 * (`|z| ∈ [1, sqrt(2)]`) using divide-and-conquer on `n` and recursive
 * Newton-Raphson refinement for odd prime degrees.
 * @param {{ re: number, im: number }} z
 * @param {number} n
 * @returns {{ re: number, im: number }}
 */
function principalNthRootRecursive(z, n) {
	if (n === 1) {
		return { re: normalizeZero(z.re), im: normalizeZero(z.im) };
	}

	if (n % 2 === 0) {
		return principalNthRootRecursive(sqrtComplex(z), n / 2);
	}

	const factor = smallestOddFactor(n);
	if (factor < n) {
		const inner = principalNthRootRecursive(z, factor);
		return principalNthRootRecursive(inner, n / factor);
	}

	// Odd prime (or large cofactor) base case:
	// Initialize on the exact principal ray with unit modulus.
	const theta = Math.atan2(z.im, z.re);
	const angle = theta / n;
	const w0 = {
		re: Math.cos(angle),
		im: Math.sin(angle),
	};

	// For extremely large prime degrees where binary exponentiation of w^(n-1)
	// can accumulate rounding amplification, seed with the exact polar modulus
	// so Newton converges or terminates accurately within machine precision.
	if (n > 1e9) {
		const rRoot = Math.exp(Math.log(Math.hypot(z.re, z.im)) / n);
		return {
			re: normalizeZero(rRoot * w0.re),
			im: normalizeZero(rRoot * w0.im),
		};
	}

	return newtonNthRootRecursive(z, n, w0, 64);
}

/**
 * Recursively refines a positive real `n`-th root using Newton-Raphson.
 * @param {number} s
 * @param {number} n
 * @param {number} x
 * @param {number} remainingSteps
 * @returns {number}
 */
function newtonRealNthRootRecursive(s, n, x, remainingSteps) {
	const xPowPrev = powRealRecursive(x, n - 1);
	if (!Number.isFinite(xPowPrev) || xPowPrev === 0) {
		return x;
	}
	const delta = (s / xPowPrev - x) / n;
	const next = x + delta;
	if (
		!Number.isFinite(next) ||
		remainingSteps <= 1 ||
		next === x ||
		Math.abs(delta) <= 1e-15 * Math.max(1, Math.abs(next))
	) {
		return Number.isFinite(next) ? next : x;
	}
	return newtonRealNthRootRecursive(s, n, next, remainingSteps - 1);
}

/**
 * Computes `s^(1 / n)` for positive real `s` and positive integer `n` via
 * recursive divide-and-conquer factorization.
 * @param {number} s
 * @param {number} n
 * @returns {number}
 */
function realNthRootRecursive(s, n) {
	if (n === 1 || s === 1) {
		return s;
	}
	if (n % 2 === 0) {
		return realNthRootRecursive(Math.sqrt(s), n / 2);
	}
	if (n % 3 === 0) {
		return realNthRootRecursive(Math.cbrt(s), n / 3);
	}
	const factor = smallestOddFactor(n);
	if (factor < n) {
		return realNthRootRecursive(realNthRootRecursive(s, factor), n / factor);
	}
	const x0 = Math.exp(Math.log(s) / n);
	if (n <= 1000 && s > 1e-250 && s < 1e250) {
		return newtonRealNthRootRecursive(s, n, x0, 16);
	}
	return x0;
}

/**
 * Computes the primitive root-of-unity rotation `exp(i * 2π * kMod / n)` with
 * exact values at quarter turns.
 * @param {number} kMod - Integer in `[0, n - 1]`.
 * @param {number} n - Positive integer.
 * @returns {{ re: number, im: number }}
 */
function rootOfUnity(kMod, n) {
	if (kMod === 0) {
		return { re: 1, im: 0 };
	}
	if (4 * kMod === n) {
		return { re: 0, im: 1 };
	}
	if (2 * kMod === n) {
		return { re: -1, im: 0 };
	}
	if (4 * kMod === 3 * n) {
		return { re: 0, im: -1 };
	}
	const angle = (2 * Math.PI * kMod) / n;
	return {
		re: Math.cos(angle),
		im: Math.sin(angle),
	};
}
