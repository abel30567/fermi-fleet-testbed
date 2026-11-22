import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { arccosBigIntIterative } from './arccosBigIntIterative.js';

const SCALE = 10n ** 18n;
const PI_SCALED = 3141592653589793238n; // round(pi * 10^18)
const HALF_PI_SCALED = 1570796326794896619n; // round((pi / 2) * 10^18)
const THIRD_PI_SCALED = 1047197551196597746n; // round((pi / 3) * 10^18)
const TWO_THIRDS_PI_SCALED = 2094395102393195492n; // round((2 * pi / 3) * 10^18)
const QUARTER_PI_SCALED = 785398163397448310n; // round((pi / 4) * 10^18)
const SIXTH_PI_SCALED = 523598775598298873n; // round((pi / 6) * 10^18)

/**
 * Independent fixed-point cosine computation via Taylor series at 10^30 precision,
 * used to cross-check `cos(arccos(x)) ≈ x`.
 *
 * @param {bigint} thetaScaled - Angle in radians scaled by 10^18.
 * @returns {bigint} cos(theta) scaled by 10^18.
 */
function cosFixedPoint(thetaScaled) {
	const guard = 10n ** 12n;
	const workScale = SCALE * guard;
	const t = thetaScaled * guard;
	const t2 = t * t;
	const workScale2 = workScale * workScale;

	let sum = workScale;
	let term = workScale;
	for (let k = 1n; ; k += 1n) {
		term = (-term * t2) / ((2n * k - 1n) * (2n * k) * workScale2);
		if (term === 0n) {
			break;
		}
		sum += term;
	}

	const halfGuard = guard / 2n;
	return sum >= 0n ? (sum + halfGuard) / guard : (sum - halfGuard) / guard;
}

function absBigInt(v) {
	return v < 0n ? -v : v;
}

describe('arccosBigIntIterative', () => {
	test('computes exact known values for 1, 0.5, 0, -0.5, -1', () => {
		assert.equal(arccosBigIntIterative(SCALE), 0n);
		assert.equal(arccosBigIntIterative(SCALE / 2n), THIRD_PI_SCALED);
		assert.equal(arccosBigIntIterative(0n), HALF_PI_SCALED);
		assert.equal(arccosBigIntIterative(-(SCALE / 2n)), TWO_THIRDS_PI_SCALED);
		assert.equal(arccosBigIntIterative(-SCALE), PI_SCALED);
	});

	test('computes accurate values for sqrt(2)/2 and sqrt(3)/2', () => {
		const invSqrt2 = 707106781186547524n; // round(sqrt(2)/2 * 10^18)
		const sqrt3Over2 = 866025403784438647n; // round(sqrt(3)/2 * 10^18)

		assert.ok(absBigInt(arccosBigIntIterative(invSqrt2) - QUARTER_PI_SCALED) <= 2n);
		assert.ok(absBigInt(arccosBigIntIterative(sqrt3Over2) - SIXTH_PI_SCALED) <= 2n);
	});

	test('handles values very close to +1 and -1 accurately', () => {
		// For x = 1 - eps with eps = 10^-18, arccos(1 - eps) ≈ sqrt(2 * eps) = sqrt(2) * 10^-9
		// Scaled by 10^18: sqrt(2) * 10^9 ≈ 1414213562n
		const nearOne = arccosBigIntIterative(SCALE - 1n);
		assert.equal(nearOne, 1414213562n);

		// For x = -1 + eps, arccos(-1 + eps) = pi - arccos(1 - eps)
		const nearNegOne = arccosBigIntIterative(-SCALE + 1n);
		assert.equal(nearNegOne, PI_SCALED - 1414213562n);

		// For x = 1 - 10^-16 (eps = 100 * 10^-18), arccos ≈ sqrt(2) * 10^-8 -> 14142135624n
		const nearOne100 = arccosBigIntIterative(SCALE - 100n);
		assert.equal(nearOne100, 14142135624n);

		// For x = -1 + 10^-16:
		// pi * 10^18 = 3141592653589793238.462643...
		// arccos(1 - 10^-16) * 10^18 = 14142135623.730950...
		// Difference = 3141592639447657614.731693... -> rounds to 3141592639447657615n
		const nearNegOne100 = arccosBigIntIterative(-SCALE + 100n);
		assert.equal(nearNegOne100, 3141592639447657615n);
	});

	test('throws TypeError for non-BigInt inputs', () => {
		for (const invalid of [0, 0.5, 1, -1, NaN, '0', null, undefined, true, {}, []]) {
			assert.throws(() => arccosBigIntIterative(invalid), TypeError);
		}
	});

	test('throws RangeError for inputs outside [-10^18, 10^18]', () => {
		for (const outOfRange of [
			SCALE + 1n,
			-SCALE - 1n,
			2n * SCALE,
			-2n * SCALE,
			10n ** 30n,
			-(10n ** 30n),
		]) {
			assert.throws(() => arccosBigIntIterative(outOfRange), RangeError);
		}
	});

	test('cross-checks against Math.acos across [-1, 1]', () => {
		const samples = [
			-1.0, -0.999999, -0.95, -0.8, -0.6180339887498949, -0.3333333333333333,
			-0.1, -0.0001, 0.0, 0.0001, 0.1, 0.25, 0.3333333333333333, 0.6180339887498949,
			0.8, 0.95, 0.999999, 1.0,
		];

		for (const u of samples) {
			const x = BigInt(Math.round(u * 1e15)) * 1000n;
			const exactU = Number(x) / 1e18;
			const actual = Number(arccosBigIntIterative(x)) / 1e18;
			const expected = Math.acos(exactU);
			// Near ±1, Math.acos suffers amplified float64 rounding error proportional to 1 / sqrt(1 - u^2)
			const tol = Math.abs(exactU) > 0.99 && Math.abs(exactU) < 1 ? 1e-13 : 1e-15;
			assert.ok(
				Math.abs(actual - expected) < tol,
				`Mismatch for u=${exactU}: actual=${actual}, expected=${expected}`
			);
		}
	});

	test('satisfies cos(arccos(x)) ≈ x via independent fixed-point cosine', () => {
		const inputs = [
			-SCALE,
			-999999999999999999n,
			-987654321012345678n,
			-750000000000000000n,
			-314159265358979323n,
			-1234567890123456n,
			0n,
			1234567890123456n,
			314159265358979323n,
			750000000000000000n,
			987654321012345678n,
			999999999999999999n,
			SCALE,
		];

		for (const x of inputs) {
			const angle = arccosBigIntIterative(x);
			const recovered = cosFixedPoint(angle);
			const diff = absBigInt(recovered - x);
			assert.ok(
				diff <= 2n,
				`cos(arccos(${x})) = ${recovered}, diff = ${diff}`
			);
		}
	});

	test('satisfies symmetry arccos(x) + arccos(-x) ≈ pi and strict monotonicity', () => {
		const positiveInputs = [
			0n,
			1n,
			1000n,
			123456789012345678n,
			500000000000000000n,
			866025403784438647n,
			999999999999999999n,
			SCALE,
		];

		let prev = arccosBigIntIterative(-SCALE);
		for (let i = positiveInputs.length - 1; i >= 0; i -= 1) {
			const x = positiveInputs[i];
			const sum = arccosBigIntIterative(x) + arccosBigIntIterative(-x);
			assert.ok(
				absBigInt(sum - PI_SCALED) <= 1n,
				`Symmetry violated at x=${x}: sum=${sum}, pi=${PI_SCALED}`
			);
		}

		// Monotonicity: strictly decreasing from -SCALE to +SCALE
		const ordered = [
			-SCALE,
			-SCALE + 1n,
			-900000000000000000n,
			-500000000000000000n,
			-1n,
			0n,
			1n,
			500000000000000000n,
			900000000000000000n,
			SCALE - 1n,
			SCALE,
		];
		prev = arccosBigIntIterative(ordered[0]);
		for (let i = 1; i < ordered.length; i += 1) {
			const curr = arccosBigIntIterative(ordered[i]);
			assert.ok(
				curr < prev,
				`Expected strictly decreasing: arccos(${ordered[i]})=${curr} >= arccos(${ordered[i - 1]})=${prev}`
			);
			prev = curr;
		}
	});
});
