import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { arcsinBigIntRecursive, SCALE } from './arcsinBigIntRecursive.js';

/**
 * Independent naive iterative BigInt sine reference implementation
 * (Maclaurin series with extra guard precision) for verifying sin(arcsin(x)) ~= x.
 * @param {bigint} theta Fixed-point angle in radians scaled by `scale`.
 * @param {bigint} [scale=SCALE]
 * @returns {bigint}
 */
function sinIterativeRef(theta, scale = SCALE) {
	const guard = 10n ** 18n;
	const W = scale * guard;
	const t = theta * guard;
	const t2 = t * t;
	const W2 = W * W;

	let term = t;
	let sum = t;
	for (let k = 1n; k <= 40n; k += 1n) {
		term = (-term * t2) / (W2 * (2n * k) * (2n * k + 1n));
		if (term === 0n) break;
		sum += term;
	}

	const neg = sum < 0n;
	const absSum = neg ? -sum : sum;
	const rounded = (absSum + guard / 2n) / guard;
	return neg ? -rounded : rounded;
}

/**
 * Independent naive iterative BigInt arcsin Maclaurin series reference
 * (valid and rapidly convergent for |x| <= scale / 2).
 * @param {bigint} x Fixed-point input scaled by `scale`.
 * @param {bigint} [scale=SCALE]
 * @returns {bigint}
 */
function arcsinIterativeRef(x, scale = SCALE) {
	const guard = 10n ** 18n;
	const W = scale * guard;
	const neg = x < 0n;
	const absX = (neg ? -x : x) * guard;
	const x2 = absX * absX;
	const W2 = W * W;

	let term = absX;
	let sum = absX;
	for (let k = 1n; k <= 120n; k += 1n) {
		const odd = 2n * k - 1n;
		term = (term * odd * odd * x2) / (2n * k * (2n * k + 1n) * W2);
		if (term === 0n) break;
		sum += term;
	}

	const rounded = (sum + guard / 2n) / guard;
	return neg ? -rounded : rounded;
}

/**
 * Helper for BigInt absolute difference.
 * @param {bigint} a
 * @param {bigint} b
 * @returns {bigint}
 */
function absDiff(a, b) {
	return a >= b ? a - b : b - a;
}

describe('arcsinBigIntRecursive', () => {
	test('exports default SCALE = 10n ** 18n', () => {
		assert.equal(SCALE, 10n ** 18n);
	});

	test('known exact special values at default 10^18 scale', () => {
		// arcsin(0) = 0
		assert.equal(arcsinBigIntRecursive(0n), 0n);

		// arcsin(1) = pi/2 = 1.570796326794896619231321...
		const PI_OVER_2 = 1570796326794896619n;
		assert.equal(arcsinBigIntRecursive(SCALE), PI_OVER_2);
		assert.equal(arcsinBigIntRecursive(-SCALE), -PI_OVER_2);

		// arcsin(1/2) = pi/6 = 0.523598775598298873077107...
		const PI_OVER_6 = 523598775598298873n;
		assert.equal(arcsinBigIntRecursive(SCALE / 2n), PI_OVER_6);
		assert.equal(arcsinBigIntRecursive(-(SCALE / 2n)), -PI_OVER_6);

		// arcsin(sqrt(2)/2) ~= pi/4 = 0.785398163397448309615660...
		// Input 707106781186547524n = floor(sqrt(2)/2 * 10^18) is 4e-19 below sqrt(2)/2;
		// multiplying by derivative sqrt(2) shifts arcsin by ~-5.66e-19 -> 785398163397448309n.
		const SQRT2_OVER_2 = 707106781186547524n;
		const PI_OVER_4 = 785398163397448310n;
		assert.ok(absDiff(arcsinBigIntRecursive(SQRT2_OVER_2), PI_OVER_4) <= 1n);
		assert.ok(absDiff(arcsinBigIntRecursive(-SQRT2_OVER_2), -PI_OVER_4) <= 1n);

		// arcsin(sqrt(3)/2) ~= pi/3 = 1.047197551196597746154214...
		const SQRT3_OVER_2 = 866025403784438647n;
		const PI_OVER_3 = 1047197551196597746n;
		assert.ok(absDiff(arcsinBigIntRecursive(SQRT3_OVER_2), PI_OVER_3) <= 2n);
		assert.ok(absDiff(arcsinBigIntRecursive(-SQRT3_OVER_2), -PI_OVER_3) <= 2n);
	});

	test('edge cases: tiny inputs and inputs very close to +/-1', () => {
		// Tiny input: arcsin(1e-18) = 1e-18 + O(1e-54)
		assert.equal(arcsinBigIntRecursive(1n), 1n);
		assert.equal(arcsinBigIntRecursive(-1n), -1n);

		// Small input where x^3 / 6 contributes to the last digit:
		// x = 2e-6 -> x + x^3/6 = 2e-6 + 1.3333...e-18 -> 2000000000001n
		assert.equal(arcsinBigIntRecursive(2n * 10n ** 12n), 2000000000001n);
		assert.equal(arcsinBigIntRecursive(-2n * 10n ** 12n), -2000000000001n);

		// Boundary neighbor: x = 1 - 1e-18
		// arcsin(1 - eps) = pi/2 - sqrt(2*eps) * (1 + eps/12 + ...)
		// pi/2 - sqrt(2)*1e-9 = 1.57079632679489661923 - 0.00000000141421356237
		//                     = 1.57079632538068305686 -> 1570796325380683057n
		assert.equal(arcsinBigIntRecursive(SCALE - 1n), 1570796325380683057n);
		assert.equal(arcsinBigIntRecursive(-(SCALE - 1n)), -1570796325380683057n);

		// x = 1 - 1e-12: sqrt(2e-12) = 1.4142135623730950488e-6
		// pi/2 - sqrt(2e-12)*(1 + 1e-12/12) = 1.57079491258133424602 -> 1570794912581334246n
		assert.equal(arcsinBigIntRecursive(SCALE - 10n ** 6n), 1570794912581334246n);
	});

	test('odd symmetry and monotonicity across [-SCALE, SCALE]', () => {
		const samples = [
			0n,
			1n,
			10n ** 9n,
			SCALE / 100n,
			SCALE / 10n,
			SCALE / 4n,
			SCALE / 2n,
			(3n * SCALE) / 4n,
			(9n * SCALE) / 10n,
			SCALE - 10n ** 6n,
			SCALE - 1n,
			SCALE,
		];

		let prev = -arcsinBigIntRecursive(SCALE) - 1n;
		const ordered = [
			...samples.slice(1).reverse().map((v) => -v),
			...samples,
		];

		for (const x of ordered) {
			const y = arcsinBigIntRecursive(x);
			assert.equal(arcsinBigIntRecursive(-x), -y, `odd symmetry failed at x=${x}`);
			assert.ok(y > prev, `strict monotonicity failed at x=${x}: ${y} <= ${prev}`);
			prev = y;
		}
	});

	test('custom scales including scale = 1n and high-precision 10^30 scale', () => {
		// Minimal scale = 1n: pi/2 ~= 1.5708 rounds to 2n
		assert.equal(arcsinBigIntRecursive(0n, 1n), 0n);
		assert.equal(arcsinBigIntRecursive(1n, 1n), 2n);
		assert.equal(arcsinBigIntRecursive(-1n, 1n), -2n);

		// Medium scale = 10^6
		const s6 = 10n ** 6n;
		assert.equal(arcsinBigIntRecursive(s6, s6), 1570796n);
		assert.equal(arcsinBigIntRecursive(s6 / 2n, s6), 523599n);

		// High-precision scale = 10^30 (30 decimal digits)
		const s30 = 10n ** 30n;
		// pi/2 to 30 decimals: 1.57079632679489661923132169163975... -> rounds to ...640
		assert.equal(
			arcsinBigIntRecursive(s30, s30),
			1570796326794896619231321691640n
		);
		// pi/6 to 30 decimals: 0.52359877559829887307710723054658... -> rounds to ...547
		assert.equal(
			arcsinBigIntRecursive(s30 / 2n, s30),
			523598775598298873077107230547n
		);
		assert.equal(
			arcsinBigIntRecursive(-(s30 / 2n), s30),
			-523598775598298873077107230547n
		);
	});

	test('cross-check against Math.asin across 41 points in [-1, 1]', () => {
		const steps = 40;
		for (let i = 0; i <= steps; i += 1) {
			const x = -SCALE + (BigInt(i) * 2n * SCALE) / BigInt(steps);
			const actual = arcsinBigIntRecursive(x);
			const xFloat = Number(x) / 1e18;
			const expectedFloat = Math.asin(xFloat);
			const actualFloat = Number(actual) / 1e18;
			assert.ok(
				Math.abs(actualFloat - expectedFloat) < 1e-14,
				`Mismatch vs Math.asin at x=${xFloat}: got ${actualFloat}, expected ${expectedFloat}`
			);
		}
	});

	test('cross-check inverse identity sin(arcsin(x)) ~= x using independent BigInt sin', () => {
		const testPoints = [
			-SCALE,
			-(SCALE - 10n ** 12n),
			-(99n * SCALE) / 100n,
			-(9n * SCALE) / 10n,
			-(3n * SCALE) / 4n,
			-SCALE / 2n,
			-(3n * SCALE) / 10n,
			-SCALE / 10n,
			0n,
			SCALE / 10n,
			(3n * SCALE) / 10n,
			SCALE / 2n,
			(3n * SCALE) / 4n,
			(9n * SCALE) / 10n,
			(99n * SCALE) / 100n,
			SCALE - 10n ** 12n,
			SCALE,
		];

		for (const x of testPoints) {
			const theta = arcsinBigIntRecursive(x);
			const reconstructed = sinIterativeRef(theta);
			assert.ok(
				absDiff(reconstructed, x) <= 2n,
				`sin(arcsin(${x})) = ${reconstructed}, diff=${absDiff(reconstructed, x)}`
			);
		}
	});

	test('cross-check exact algebraic identities (Pythagorean triples, double-angle, triple-angle)', () => {
		const piOver2 = arcsinBigIntRecursive(SCALE);

		// Complementary angle identity: arcsin(a/c) + arcsin(b/c) = pi/2
		// (3, 4, 5): 0.6 and 0.8 are exact at 10^18 scale
		assert.ok(
			absDiff(
				arcsinBigIntRecursive(6n * 10n ** 17n) + arcsinBigIntRecursive(8n * 10n ** 17n),
				piOver2
			) <= 1n
		);

		// (7, 24, 25): 0.28 and 0.96 are exact at 10^18 scale
		assert.ok(
			absDiff(
				arcsinBigIntRecursive(28n * 10n ** 16n) + arcsinBigIntRecursive(96n * 10n ** 16n),
				piOver2
			) <= 1n
		);

		// (5, 12, 13) with exact scale 13 * 10^18
		const s13 = 13n * SCALE;
		assert.ok(
			absDiff(
				arcsinBigIntRecursive(5n * SCALE, s13) + arcsinBigIntRecursive(12n * SCALE, s13),
				arcsinBigIntRecursive(s13, s13)
			) <= 1n
		);

		// Double-angle identity: 2 * arcsin(7/25) = arcsin(2 * (7/25) * (24/25)) = arcsin(0.5376)
		assert.ok(
			absDiff(
				2n * arcsinBigIntRecursive(28n * 10n ** 16n),
				arcsinBigIntRecursive(5376n * 10n ** 14n)
			) <= 1n
		);

		// Triple-angle identity: 3 * arcsin(x) = arcsin(3x - 4x^3) for |x| <= 0.5
		// x = 0.2 -> 3(0.2) - 4(0.008) = 0.6 - 0.032 = 0.568
		assert.ok(
			absDiff(
				3n * arcsinBigIntRecursive(2n * 10n ** 17n),
				arcsinBigIntRecursive(568n * 10n ** 15n)
			) <= 2n
		);

		// x = 0.5 -> 3(0.5) - 4(0.125) = 1
		assert.ok(
			absDiff(3n * arcsinBigIntRecursive(SCALE / 2n), piOver2) <= 1n
		);
	});

	test('cross-check against naive iterative BigInt Maclaurin series for |x| <= 0.5', () => {
		const points = [
			-SCALE / 2n,
			-(37n * SCALE) / 100n,
			-(123456789012345678n),
			-(10n ** 15n),
			0n,
			10n ** 15n,
			123456789012345678n,
			(37n * SCALE) / 100n,
			SCALE / 2n,
		];

		for (const x of points) {
			const actual = arcsinBigIntRecursive(x);
			const expected = arcsinIterativeRef(x);
			assert.ok(
				absDiff(actual, expected) <= 1n,
				`Mismatch vs iterative ref at x=${x}: actual=${actual}, expected=${expected}`
			);
		}
	});

	test('input validation throws TypeError and RangeError appropriately', () => {
		// Non-BigInt x -> TypeError
		for (const badX of [0, 0.5, 1, -1, NaN, Infinity, '0', null, undefined, {}, [], true]) {
			assert.throws(() => arcsinBigIntRecursive(badX), TypeError);
		}

		// Non-BigInt scale -> TypeError
		for (const badScale of [1e18, 1000, '1000', null, {}, true]) {
			assert.throws(() => arcsinBigIntRecursive(0n, badScale), TypeError);
		}

		// Non-positive scale -> RangeError
		for (const badScale of [0n, -1n, -SCALE]) {
			assert.throws(() => arcsinBigIntRecursive(0n, badScale), RangeError);
		}

		// Out-of-domain |x| > scale -> RangeError
		assert.throws(() => arcsinBigIntRecursive(SCALE + 1n), RangeError);
		assert.throws(() => arcsinBigIntRecursive(-SCALE - 1n), RangeError);
		assert.throws(() => arcsinBigIntRecursive(2n * SCALE), RangeError);
		assert.throws(() => arcsinBigIntRecursive(-100n * SCALE), RangeError);
		assert.throws(() => arcsinBigIntRecursive(101n, 100n), RangeError);
		assert.throws(() => arcsinBigIntRecursive(-101n, 100n), RangeError);
	});
});
