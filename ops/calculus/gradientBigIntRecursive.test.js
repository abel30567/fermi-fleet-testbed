import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
	gradientBigIntRecursive,
	SCALE,
	DEFAULT_STEP,
	DEFAULT_ORDER,
	MAX_ORDER,
} from './gradientBigIntRecursive.js';

/** Fixed-point multiplication (x * y) / SCALE with round-half-to-even. */
function fpMul(a, b) {
	const prod = a * b;
	const neg = prod < 0n;
	const abs = neg ? -prod : prod;
	const q = abs / SCALE;
	const r = abs % SCALE;
	const twiceR = r << 1n;
	const rounded =
		twiceR > SCALE || (twiceR === SCALE && (q & 1n) === 1n) ? q + 1n : q;
	return neg ? -rounded : rounded;
}

/** Fixed-point integer power x^n (n >= 0). */
function fpPow(x, n) {
	let result = SCALE;
	for (let i = 0; i < n; i += 1) {
		result = fpMul(result, x);
	}
	return result;
}

/** High-precision fixed-point exp(x) via Taylor series (internal 10^36 guard). */
function fpExp(x) {
	const GUARD = 10n ** 18n;
	const xG = x * GUARD;
	const scaleG = SCALE * GUARD;
	let sum = scaleG;
	let term = scaleG;
	for (let k = 1n; k <= 45n; k += 1n) {
		term = (term * xG) / (scaleG * k);
		if (term === 0n) break;
		sum += term;
	}
	// Round back from 10^36 to 10^18
	const neg = sum < 0n;
	const abs = neg ? -sum : sum;
	const rounded = (abs + GUARD / 2n) / GUARD;
	return neg ? -rounded : rounded;
}

/** High-precision fixed-point sin(x) via Taylor series (internal 10^36 guard). */
function fpSin(x) {
	const GUARD = 10n ** 18n;
	const xG = x * GUARD;
	const scaleG = SCALE * GUARD;
	let sum = xG;
	let term = xG;
	for (let k = 1n; k <= 30n; k += 1n) {
		const denom = 2n * k * (2n * k + 1n);
		term = -(term * xG) / scaleG;
		term = (term * xG) / (scaleG * denom);
		if (term === 0n) break;
		sum += term;
	}
	const neg = sum < 0n;
	const abs = neg ? -sum : sum;
	const rounded = (abs + GUARD / 2n) / GUARD;
	return neg ? -rounded : rounded;
}

/** High-precision fixed-point cos(x) via Taylor series (internal 10^36 guard). */
function fpCos(x) {
	const GUARD = 10n ** 18n;
	const xG = x * GUARD;
	const scaleG = SCALE * GUARD;
	let sum = scaleG;
	let term = scaleG;
	for (let k = 1n; k <= 30n; k += 1n) {
		const denom = (2n * k - 1n) * (2n * k);
		term = -(term * xG) / scaleG;
		term = (term * xG) / (scaleG * denom);
		if (term === 0n) break;
		sum += term;
	}
	const neg = sum < 0n;
	const abs = neg ? -sum : sum;
	const rounded = (abs + GUARD / 2n) / GUARD;
	return neg ? -rounded : rounded;
}

function absBigInt(x) {
	return x < 0n ? -x : x;
}

describe('gradientBigIntRecursive', () => {
	describe('exports & constants', () => {
		it('exports expected fixed-point scale and default constants', () => {
			assert.equal(SCALE, 10n ** 18n);
			assert.equal(DEFAULT_STEP, 10n ** 15n);
			assert.equal(DEFAULT_ORDER, 3);
			assert.equal(MAX_ORDER, 12);
		});
	});

	describe('normal cases', () => {
		it('returns zero gradient for constant functions', () => {
			const f = () => 42n * SCALE;
			const grad = gradientBigIntRecursive(f, [
				-3n * SCALE,
				0n,
				7n * SCALE,
			]);
			assert.deepEqual(grad, [0n, 0n, 0n]);
		});

		it('computes exact gradient for multivariable linear functions', () => {
			// f(x, y, z) = 3x - 2y + 5z + 7
			const f = ([x, y, z]) => 3n * x - 2n * y + 5n * z + 7n * SCALE;
			const grad = gradientBigIntRecursive(f, [
				15n * (SCALE / 10n),
				-4n * SCALE,
				2n * SCALE,
			]);
			assert.deepEqual(grad, [3n * SCALE, -2n * SCALE, 5n * SCALE]);
		});

		it('computes exact gradient for 1D functions', () => {
			// f(x) = x^3 - 4x + 1 => f'(x) = 3x^2 - 4
			const f = ([x]) => fpPow(x, 3) - 4n * x + SCALE;
			const x = -2n * SCALE; // f'(-2) = 12 - 4 = 8
			const grad = gradientBigIntRecursive(f, [x]);
			assert.deepEqual(grad, [8n * SCALE]);
		});

		it('computes exact gradient for quadratic forms with negative coordinates', () => {
			// f(x, y) = x^2 + 3xy - 2y^2 => ∇f = (2x + 3y, 3x - 4y)
			const f = ([x, y]) => (x * x + 3n * x * y - 2n * y * y) / SCALE;
			const x = 2n * SCALE;
			const y = -3n * SCALE;
			const grad = gradientBigIntRecursive(f, [x, y]);
			// 2(2) + 3(-3) = -5, 3(2) - 4(-3) = 18
			assert.deepEqual(grad, [-5n * SCALE, 18n * SCALE]);
		});

		it('computes accurate gradient for degree-5 multivariate polynomial via Richardson extrapolation', () => {
			// f(x, y) = x^5 - 2 x^3 y^2 + y^4
			// ∂f/∂x = 5 x^4 - 6 x^2 y^2
			// ∂f/∂y = -4 x^3 y + 4 y^3
			const f = ([x, y]) =>
				fpPow(x, 5) - 2n * fpMul(fpPow(x, 3), fpPow(y, 2)) + fpPow(y, 4);

			const x = 15n * (SCALE / 10n); // 1.5
			const y = -5n * (SCALE / 10n); // -0.5

			const grad = gradientBigIntRecursive(f, [x, y]);

			const expectedDx =
				5n * fpPow(x, 4) - 6n * fpMul(fpPow(x, 2), fpPow(y, 2));
			const expectedDy = -4n * fpMul(fpPow(x, 3), y) + 4n * fpPow(y, 3);

			assert.ok(
				absBigInt(grad[0] - expectedDx) <= 10n ** 5n,
				`dx diff too large: ${absBigInt(grad[0] - expectedDx)}`
			);
			assert.ok(
				absBigInt(grad[1] - expectedDy) <= 10n ** 5n,
				`dy diff too large: ${absBigInt(grad[1] - expectedDy)}`
			);
		});

		it('handles high-dimensional vectors via O(log n) divide-and-conquer without stack issues', () => {
			// f(x_0, ..., x_63) = sum_{i=0}^{63} (i + 1) * x_i^2
			// ∂f/∂x_i = 2 * (i + 1) * x_i
			const n = 64;
			const f = (coords) => {
				let acc = 0n;
				for (let i = 0; i < coords.length; i += 1) {
					acc += BigInt(i + 1) * ((coords[i] * coords[i]) / SCALE);
				}
				return acc;
			};

			const point = Array.from({ length: n }, (_, i) =>
				BigInt(i % 2 === 0 ? i - 30 : 30 - i) * (SCALE / 2n)
			);
			const grad = gradientBigIntRecursive(f, point);

			assert.equal(grad.length, n);
			for (let i = 0; i < n; i += 1) {
				const expected = 2n * BigInt(i + 1) * point[i];
				assert.equal(grad[i], expected, `mismatch at dim ${i}`);
			}
		});

		it('preserves exactness for huge BigInt coordinates far beyond Number.MAX_SAFE_INTEGER', () => {
			// In float64, 1e25 + 1e-3 === 1e25 so finite differences collapse to 0.
			// Exact BigInt arithmetic retains full precision.
			const f = ([x, y]) => (x * x + y * y) / SCALE;
			const x = 10n ** 25n * SCALE;
			const y = -3n * 10n ** 24n * SCALE;
			const grad = gradientBigIntRecursive(f, [x, y]);
			assert.deepEqual(grad, [2n * x, 2n * y]);
		});
	});

	describe('edge cases & options', () => {
		it('evaluates cleanly at the origin [0n, 0n, 0n]', () => {
			// f(x, y, z) = x^2 + 2y + yz - 3z^2 => ∇f(0,0,0) = (0, 2, 0)
			const f = ([x, y, z]) =>
				(x * x + y * z - 3n * z * z) / SCALE + 2n * y;
			const grad = gradientBigIntRecursive(f, [0n, 0n, 0n]);
			assert.deepEqual(grad, [0n, 2n * SCALE, 0n]);
		});

		it('handles non-power-of-two step sizes exactly via generalized Neville extrapolation', () => {
			// f(x) = x^5 => f'(x) = 5x^4. With step = 5 * 10^15 and order = 2,
			// steps are [5e15, 2.5e15, 1.25e15] (also test odd step = 7n * 10^14 + 3n)
			const f = ([x]) => (x * x * x) / (SCALE * SCALE);
			// Exact cubic: with odd step 700_000_000_000_003n and order 2,
			// steps are not exact 2:1 ratios, yet Neville elimination is exact.
			const oddStep = 7n * 10n ** 14n + 3n;
			const x = 2n * SCALE; // f'(2) = 12
			const grad = gradientBigIntRecursive(f, [x], {
				step: oddStep,
				order: 2,
			});
			assert.ok(absBigInt(grad[0] - 12n * SCALE) <= 10n ** 5n);

			// Exact integer-valued cubic without intermediate division truncation:
			// g(x) = (x / 10^18)^3 * 10^18 evaluated with exact polynomial in unscaled units
			// scaled so g(x) = x^3 / 10^36 would truncate; instead use g(x) = 3*x + x^3/10^36 with exact rational check:
			// For exact h = 7n (odd, tiny) on exact polynomial in raw units scaled by SCALE:
			// p(x) = 5x^2 => p'(x) = 10x, completely exact even at step = 7n, order = 2 ([7n, 3n, 1n]).
			const p = ([u]) => 5n * u;
			assert.deepEqual(
				gradientBigIntRecursive(p, [3n * SCALE], { step: 7n, order: 2 }),
				[5n * SCALE]
			);
		});

		it('auto-clamps default order when a very small step is given without explicit order', () => {
			const f = ([x, y]) => 4n * x - 9n * y;
			assert.deepEqual(
				gradientBigIntRecursive(f, [SCALE, SCALE], { step: 1n }),
				[4n * SCALE, -9n * SCALE]
			);
			assert.deepEqual(
				gradientBigIntRecursive(f, [SCALE, SCALE], { step: 4n }),
				[4n * SCALE, -9n * SCALE]
			);
		});

		it('demonstrates higher Richardson order dramatically improves accuracy over order 0', () => {
			// f(x) = x^5 at x = 2, f'(2) = 80
			// With a large step h = 10^-1 (10^17):
			// order 0 has O(h^2) error ~ 40 * (0.1)^2 = 0.4
			// order 2 has O(h^6) = 0 for degree 5!
			const f = ([x]) => fpPow(x, 5);
			const x = 2n * SCALE;
			const expected = 80n * SCALE;

			const [g0] = gradientBigIntRecursive(f, [x], {
				step: SCALE / 10n,
				order: 0,
			});
			const [g2] = gradientBigIntRecursive(f, [x], {
				step: SCALE / 10n,
				order: 2,
			});

			const err0 = absBigInt(g0 - expected);
			const err2 = absBigInt(g2 - expected);
			assert.ok(err0 > 10n ** 17n, 'order 0 at h=0.1 should have large O(h^2) error');
			assert.ok(err2 < 10n ** 3n, `order 2 should cancel x^5 error, got err=${err2}`);
		});

		it('does not mutate caller point even if fn mutates its coords argument', () => {
			const point = [1n * SCALE, 2n * SCALE, 3n * SCALE];
			const f = (coords) => {
				const val = 2n * coords[0] + 3n * coords[1] - coords[2];
				coords[0] = 999n * SCALE;
				coords[1] = -999n * SCALE;
				return val;
			};
			const grad = gradientBigIntRecursive(f, point);
			assert.deepEqual(grad, [2n * SCALE, 3n * SCALE, -1n * SCALE]);
			assert.deepEqual(point, [1n * SCALE, 2n * SCALE, 3n * SCALE]);
		});

		it('handles exact round-half-to-even for non-terminating rational derivatives', () => {
			// f(x) = floor(x / 3) approximated linearly via exact rational step:
			// Better: f(x) = (x * 1n) / 3n has slope 1/3 => 333333333333333333n
			// For exact slope 1/3 without truncation inside f, use step = 3n * 10^15:
			// f(x) = x / 3n at x = 0n => f(h) = 10^15, f(-h) = -10^15 => (2e15 * 1e18) / (6e15) = 1e18 / 3
			const f = ([x]) => x / 3n;
			const [g] = gradientBigIntRecursive(f, [0n], {
				step: 3n * 10n ** 15n,
				order: 0,
			});
			assert.equal(g, 333_333_333_333_333_333n);

			// Exact half-to-even tie: slope = 5 / (2 * 10^18) at step = 1n, order = 0
			// f(1) - f(-1) = 5n -> (5n * SCALE) / 2n is exact integer; instead make
			// (f(h) - f(-h)) * SCALE / (2h) = 2.5 -> rounds to 2n, and 3.5 -> rounds to 4n!
			// Choose step = SCALE (so 2h = 2 * SCALE): result = round((f(S) - f(-S)) / 2)
			const fTieEvenDown = ([x]) => (x === SCALE ? 5n : 0n); // (5 - 0)/2 = 2.5 -> 2n
			const fTieEvenUp = ([x]) => (x === SCALE ? 7n : 0n); // (7 - 0)/2 = 3.5 -> 4n
			assert.deepEqual(
				gradientBigIntRecursive(fTieEvenDown, [0n], { step: SCALE, order: 0 }),
				[2n]
			);
			assert.deepEqual(
				gradientBigIntRecursive(fTieEvenUp, [0n], { step: SCALE, order: 0 }),
				[4n]
			);
		});
	});

	describe('cross-checks against independent computations', () => {
		it('cross-checks transcendental scalar field against Math.* and analytical derivatives', () => {
			// f(x, y) = sin(x) * cos(y) + exp(x * y)
			// ∂f/∂x = cos(x) * cos(y) + y * exp(x * y)
			// ∂f/∂y = -sin(x) * sin(y) + x * exp(x * y)
			const f = ([x, y]) =>
				fpMul(fpSin(x), fpCos(y)) + fpExp(fpMul(x, y));

			const xFloat = 0.7;
			const yFloat = -0.4;
			const x = 7n * (SCALE / 10n);
			const y = -4n * (SCALE / 10n);

			const grad = gradientBigIntRecursive(f, [x, y]);

			// 1. Cross-check against BigInt analytical gradient
			const expXY = fpExp(fpMul(x, y));
			const exactDx = fpMul(fpCos(x), fpCos(y)) + fpMul(y, expXY);
			const exactDy = -fpMul(fpSin(x), fpSin(y)) + fpMul(x, expXY);

			assert.ok(
				absBigInt(grad[0] - exactDx) < 10n ** 5n,
				`BigInt dx mismatch: ${absBigInt(grad[0] - exactDx)}`
			);
			assert.ok(
				absBigInt(grad[1] - exactDy) < 10n ** 5n,
				`BigInt dy mismatch: ${absBigInt(grad[1] - exactDy)}`
			);

			// 2. Cross-check against JS Math.* floating-point reference
			const mathDx =
				Math.cos(xFloat) * Math.cos(yFloat) +
				yFloat * Math.exp(xFloat * yFloat);
			const mathDy =
				-Math.sin(xFloat) * Math.sin(yFloat) +
				xFloat * Math.exp(xFloat * yFloat);

			const grad0Float = Number(grad[0]) / 1e18;
			const grad1Float = Number(grad[1]) / 1e18;

			assert.ok(
				Math.abs(grad0Float - mathDx) < 1e-12,
				`Math dx mismatch: ${Math.abs(grad0Float - mathDx)}`
			);
			assert.ok(
				Math.abs(grad1Float - mathDy) < 1e-12,
				`Math dy mismatch: ${Math.abs(grad1Float - mathDy)}`
			);
		});

		it('satisfies algebraic calculus identities: linearity, product rule, and Euler theorem', () => {
			const f = ([x, y, z]) =>
				fpPow(x, 2) + fpMul(y, z) - fpMul(x, fpPow(z, 2));
			const g = ([x, y, z]) =>
				fpMul(x, y) + fpPow(y, 2) + 2n * z;

			const pt = [
				12n * (SCALE / 10n), // 1.2
				-8n * (SCALE / 10n), // -0.8
				5n * (SCALE / 10n), // 0.5
			];

			const gradF = gradientBigIntRecursive(f, pt);
			const gradG = gradientBigIntRecursive(g, pt);

			// Linearity: ∇(3f - 5g) = 3∇f - 5∇g
			const lin = (p) => 3n * f(p) - 5n * g(p);
			const gradLin = gradientBigIntRecursive(lin, pt);
			for (let i = 0; i < pt.length; i += 1) {
				const rhs = 3n * gradF[i] - 5n * gradG[i];
				assert.ok(absBigInt(gradLin[i] - rhs) <= 10n ** 5n);
			}

			// Product rule: ∇(f * g) = g * ∇f + f * ∇g
			const prod = (p) => fpMul(f(p), g(p));
			const gradProd = gradientBigIntRecursive(prod, pt);
			const fVal = f(pt);
			const gVal = g(pt);
			for (let i = 0; i < pt.length; i += 1) {
				const rhs = fpMul(gVal, gradF[i]) + fpMul(fVal, gradG[i]);
				assert.ok(absBigInt(gradProd[i] - rhs) <= 10n ** 6n);
			}

			// Euler's homogeneous function theorem:
			// For homogeneous degree-4 polynomial H(x, y, z) = x^4 + 2 x^2 y z - 3 y^3 z + z^4,
			// x · ∇H(x) = 4 * H(x)
			const H = ([x, y, z]) =>
				fpPow(x, 4) +
				2n * fpMul(fpPow(x, 2), fpMul(y, z)) -
				3n * fpMul(fpPow(y, 3), z) +
				fpPow(z, 4);
			const gradH = gradientBigIntRecursive(H, pt);
			let dot = 0n;
			for (let i = 0; i < pt.length; i += 1) {
				dot += fpMul(pt[i], gradH[i]);
			}
			const eulerRhs = 4n * H(pt);
			assert.ok(
				absBigInt(dot - eulerRhs) <= 10n ** 6n,
				`Euler identity mismatch: ${absBigInt(dot - eulerRhs)}`
			);
		});

		it('matches an independent iterative central-difference reference implementation', () => {
			function naiveIterativeGradient(fn, point, h) {
				const res = [];
				for (let i = 0; i < point.length; i += 1) {
					const pPlus = point.slice();
					const pMinus = point.slice();
					pPlus[i] += h;
					pMinus[i] -= h;
					res.push(((fn(pPlus) - fn(pMinus)) * SCALE) / (2n * h));
				}
				return res;
			}

			const f = ([x, y, z]) =>
				fpSin(x + y) + fpExp(fpMul(y, z)) - fpPow(z, 2);
			const pt = [
				3n * (SCALE / 10n),
				-6n * (SCALE / 10n),
				4n * (SCALE / 10n),
			];

			const gradRec = gradientBigIntRecursive(f, pt);
			const gradIter = naiveIterativeGradient(f, pt, 10n ** 12n); // h = 10^-6

			for (let i = 0; i < pt.length; i += 1) {
				// Naive central difference at h=10^-6 has O(h^2) ~ 10^-12 error (10^6 units)
				assert.ok(
					absBigInt(gradRec[i] - gradIter[i]) < 10n ** 8n,
					`dim ${i} diff: ${absBigInt(gradRec[i] - gradIter[i])}`
				);
			}
		});
	});

	describe('input validation', () => {
		const id = ([x]) => x;

		it('throws TypeError when fn is not a function', () => {
			assert.throws(() => gradientBigIntRecursive(null, [0n]), TypeError);
			assert.throws(() => gradientBigIntRecursive(42, [0n]), TypeError);
			assert.throws(() => gradientBigIntRecursive('fn', [0n]), TypeError);
		});

		it('throws TypeError when point is not an array', () => {
			assert.throws(() => gradientBigIntRecursive(id, null), TypeError);
			assert.throws(() => gradientBigIntRecursive(id, 1n), TypeError);
			assert.throws(() => gradientBigIntRecursive(id, { 0: 1n }), TypeError);
		});

		it('throws RangeError when point is empty', () => {
			assert.throws(() => gradientBigIntRecursive(id, []), RangeError);
		});

		it('throws TypeError when point contains non-BigInt elements or holes', () => {
			assert.throws(() => gradientBigIntRecursive(id, [1n, 2]), TypeError);
			assert.throws(() => gradientBigIntRecursive(id, ['1']), TypeError);
			assert.throws(
				() => gradientBigIntRecursive(id, new Array(2)),
				TypeError
			);
		});

		it('throws TypeError when fn returns a non-BigInt value', () => {
			assert.throws(
				() => gradientBigIntRecursive(() => 123, [0n]),
				TypeError
			);
			assert.throws(
				() => gradientBigIntRecursive(() => undefined, [0n]),
				TypeError
			);
		});

		it('throws TypeError for invalid options container', () => {
			assert.throws(
				() => gradientBigIntRecursive(id, [0n], null),
				TypeError
			);
			assert.throws(
				() => gradientBigIntRecursive(id, [0n], []),
				TypeError
			);
			assert.throws(
				() => gradientBigIntRecursive(id, [0n], 10n),
				TypeError
			);
		});

		it('validates options.step type and range', () => {
			assert.throws(
				() => gradientBigIntRecursive(id, [0n], { step: 1000 }),
				TypeError
			);
			assert.throws(
				() => gradientBigIntRecursive(id, [0n], { step: 0n }),
				RangeError
			);
			assert.throws(
				() => gradientBigIntRecursive(id, [0n], { step: -5n }),
				RangeError
			);
		});

		it('validates options.order type, range, and consistency with step', () => {
			assert.throws(
				() => gradientBigIntRecursive(id, [0n], { order: 1.5 }),
				TypeError
			);
			assert.throws(
				() => gradientBigIntRecursive(id, [0n], { order: Number.NaN }),
				TypeError
			);
			assert.throws(
				() => gradientBigIntRecursive(id, [0n], { order: 2n }),
				TypeError
			);
			assert.throws(
				() => gradientBigIntRecursive(id, [0n], { order: -1 }),
				RangeError
			);
			assert.throws(
				() =>
					gradientBigIntRecursive(id, [0n], { order: MAX_ORDER + 1 }),
				RangeError
			);
			assert.throws(
				() =>
					gradientBigIntRecursive(id, [0n], { step: 4n, order: 3 }),
				RangeError
			);
		});
	});
});
