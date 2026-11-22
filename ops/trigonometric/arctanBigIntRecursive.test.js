import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { SCALE, arctanBigIntRecursive } from './arctanBigIntRecursive.js';

const HALF_PI = 1570796326794896619n; // round((pi / 2) * 10^18)
const QUARTER_PI = 785398163397448310n; // round((pi / 4) * 10^18)
const THIRD_PI = 1047197551196597746n; // round((pi / 3) * 10^18)
const SIXTH_PI = 523598775598298873n; // round((pi / 6) * 10^18)

/**
 * Independent naive iterative Taylor series reference for |x| <= 0.25 * SCALE.
 * Uses 10^30 working precision and a plain while-loop with no recursion.
 */
function naiveIterativeArctanSmall(x) {
	const guard = 10n ** 12n;
	const workScale = SCALE * guard;
	const u = x * guard;
	const u2 = u * u;
	let power = u;
	let sum = u;
	let k = 1n;

	while (true) {
		power = -(power * u2) / (workScale * workScale);
		const term = power / (2n * k + 1n);
		if (term === 0n) {
			break;
		}
		sum += term;
		k += 1n;
	}

	const half = guard >> 1n;
	return sum >= 0n ? (sum + half) / guard : -((-sum + half) / guard);
}

function absBigInt(n) {
	return n < 0n ? -n : n;
}

describe('arctanBigIntRecursive', () => {
	it('exports SCALE = 10n ** 18n', () => {
		assert.equal(SCALE, 10n ** 18n);
	});

	it('computes known landmark values accurately', () => {
		assert.equal(arctanBigIntRecursive(0n), 0n);
		assert.equal(arctanBigIntRecursive(SCALE), QUARTER_PI);
		assert.equal(arctanBigIntRecursive(-SCALE), -QUARTER_PI);

		// arctan(1 / sqrt(3)) = pi / 6
		const invSqrt3 = 577350269189625765n;
		assert.equal(arctanBigIntRecursive(invSqrt3), SIXTH_PI);
		assert.equal(arctanBigIntRecursive(-invSqrt3), -SIXTH_PI);

		// arctan(sqrt(3)) = pi / 3
		const sqrt3 = 1732050807568877294n;
		assert.equal(arctanBigIntRecursive(sqrt3), THIRD_PI);
		assert.equal(arctanBigIntRecursive(-sqrt3), -THIRD_PI);

		// arctan(0.5) and arctan(2)
		assert.equal(arctanBigIntRecursive(SCALE / 2n), 463647609000806116n);
		assert.equal(arctanBigIntRecursive(2n * SCALE), 1107148717794090503n);
	});

	it('satisfies exact odd symmetry arctan(-x) === -arctan(x)', () => {
		const samples = [
			0n,
			1n,
			123456789n,
			SCALE / 100n,
			SCALE / 64n,
			SCALE / 2n,
			SCALE,
			3n * SCALE,
			100n * SCALE,
			10n ** 36n,
			10n ** 120n,
		];
		for (const x of samples) {
			assert.equal(arctanBigIntRecursive(-x), -arctanBigIntRecursive(x));
		}
	});

	it('handles tiny, threshold-boundary, and very large BigInt inputs', () => {
		// Tiny values: arctan(10^-18) ≈ 10^-18
		assert.equal(arctanBigIntRecursive(1n), 1n);
		assert.equal(arctanBigIntRecursive(-1n), -1n);

		// Cubic term shifts arctan(2e-6) = 2e-6 - 8e-18/3 => 1999999999997n
		assert.equal(arctanBigIntRecursive(2n * 10n ** 12n), 1999999999997n);

		// Around reduction threshold (SCALE / 64) and reciprocal boundary (SCALE)
		// Note: arctan'(1) = 1/2 and (pi/4)*10^18 = ...309.61566..., so:
		//   SCALE - 1n -> ...309.115... (QUARTER_PI - 1n)
		//   SCALE      -> ...309.615... (QUARTER_PI)
		//   SCALE + 1n -> ...310.115... (QUARTER_PI)
		//   SCALE + 2n -> ...310.615... (QUARTER_PI + 1n)
		const thresh = SCALE / 64n;
		assert.equal(arctanBigIntRecursive(thresh + 1n) - arctanBigIntRecursive(thresh), 1n);
		assert.equal(arctanBigIntRecursive(SCALE - 1n), QUARTER_PI - 1n);
		assert.equal(arctanBigIntRecursive(SCALE), QUARTER_PI);
		assert.equal(arctanBigIntRecursive(SCALE + 1n), QUARTER_PI);
		assert.equal(arctanBigIntRecursive(SCALE + 2n), QUARTER_PI + 1n);

		// At r = 10^18 (x = 10^36): (pi/2 - 10^-18) * 10^18 = 1570796326794896618.231... -> ...618n
		assert.equal(arctanBigIntRecursive(10n ** 36n), HALF_PI - 1n);
		assert.equal(arctanBigIntRecursive(-(10n ** 36n)), -(HALF_PI - 1n));

		// Asymptotic large inputs approach ±pi/2 without overflow or stack issues
		assert.equal(arctanBigIntRecursive(10n ** 40n), HALF_PI);
		assert.equal(arctanBigIntRecursive(10n ** 200n), HALF_PI);
		assert.equal(arctanBigIntRecursive(-(10n ** 200n)), -HALF_PI);
	});

	it('is strictly monotonically increasing on representative inputs', () => {
		const inputs = [
			-(10n ** 30n),
			-100n * SCALE,
			-10n * SCALE,
			-SCALE,
			-SCALE / 2n,
			-SCALE / 64n,
			-1n,
			0n,
			1n,
			SCALE / 64n,
			SCALE / 2n,
			SCALE,
			10n * SCALE,
			100n * SCALE,
			10n ** 30n,
		];
		let prev = arctanBigIntRecursive(inputs[0]);
		for (let i = 1; i < inputs.length; i++) {
			const curr = arctanBigIntRecursive(inputs[i]);
			assert.ok(curr > prev, `Expected arctan(${inputs[i]}) > arctan(${inputs[i - 1]})`);
			prev = curr;
		}
	});

	it('rejects non-BigInt inputs with TypeError', () => {
		const invalidInputs = [
			0,
			1,
			-1,
			0.5,
			NaN,
			Infinity,
			-Infinity,
			'0',
			'1000000000000000000',
			null,
			undefined,
			true,
			false,
			{},
			[],
			Symbol('x'),
		];
		for (const bad of invalidInputs) {
			assert.throws(() => arctanBigIntRecursive(bad), TypeError);
		}
	});

	it('cross-checks against Math.atan across a broad range of values', () => {
		const floatValues = [
			-1000, -50, -10, -2.5, -1, -0.75, -0.333, -0.05, -0.001, 0,
			0.001, 0.05, 0.125, 0.333, 0.75, 1, 2.5, 10, 50, 1000,
		];
		for (const v of floatValues) {
			const x = BigInt(Math.round(v * 1e6)) * 10n ** 12n; // exact decimal in SCALE
			const actual = arctanBigIntRecursive(x);
			const expected = BigInt(Math.round(Math.atan(Number(x) / 1e18) * 1e18));
			// IEEE-754 double has ~53 bits (~15.9 decimal digits), so tolerance <= 1000n at 10^18 scale
			const diff = absBigInt(actual - expected);
			assert.ok(
				diff <= 1000n,
				`Mismatch at v=${v}: actual=${actual}, Math.atan=${expected}, diff=${diff}`,
			);
		}
	});

	it('cross-checks trigonometric identities (Euler sum, reciprocal, double-angle)', () => {
		// 1. Exact decimal Euler identity: arctan(1/2) + arctan(1/5) + arctan(1/8) = pi / 4
		const eulerSum =
			arctanBigIntRecursive(SCALE / 2n) +
			arctanBigIntRecursive(SCALE / 5n) +
			arctanBigIntRecursive(SCALE / 8n);
		assert.ok(absBigInt(eulerSum - QUARTER_PI) <= 1n, `Euler sum diff: ${eulerSum - QUARTER_PI}`);

		// 2. Reciprocal identity: arctan(r) + arctan(1/r) = pi / 2 for exact pairs
		const exactPairs = [
			[2n * SCALE, SCALE / 2n],
			[4n * SCALE, SCALE / 4n],
			[5n * SCALE, SCALE / 5n],
			[8n * SCALE, SCALE / 8n],
			[10n * SCALE, SCALE / 10n],
			[16n * SCALE, SCALE / 16n],
			[25n * SCALE, SCALE / 25n],
			[100n * SCALE, SCALE / 100n],
		];
		for (const [r, invR] of exactPairs) {
			const sum = arctanBigIntRecursive(r) + arctanBigIntRecursive(invR);
			assert.ok(
				absBigInt(sum - HALF_PI) <= 1n,
				`Reciprocal identity failed for r=${r}: sum=${sum}, HALF_PI=${HALF_PI}`,
			);
		}

		// 3. Double-angle identity: 2 * arctan(u) = arctan(2u / (1 - u^2)) for |u| < 1
		// Use u = 0.25 -> 2u / (1 - u^2) = 0.5 / 0.9375 = 8/15; and u = 0.2 -> 0.4 / 0.96 = 5/12;
		// and u = 0.5 -> 1 / 0.75 = 4/3; and u = 0.6 -> 1.2 / 0.64 = 1.875 (EXACT!)
		const exactDoubleAngle = [
			[6n * 10n ** 17n, 1875n * 10n ** 15n], // u = 0.6 => 2u/(1-u^2) = 1.875
			[-6n * 10n ** 17n, -1875n * 10n ** 15n],
		];
		for (const [u, doubleArg] of exactDoubleAngle) {
			const lhs = 2n * arctanBigIntRecursive(u);
			const rhs = arctanBigIntRecursive(doubleArg);
			assert.ok(
				absBigInt(lhs - rhs) <= 1n,
				`Double-angle failed for u=${u}: lhs=${lhs}, rhs=${rhs}`,
			);
		}

		// 4. Addition identity: arctan(0.2) + arctan(0.5) = arctan(7/9), and
		// arctan(0.125) + arctan(0.2) = arctan(0.325 / 0.975) = arctan(1/3), plus exact:
		// a = 0.25, b = 0.6 => (a+b)/(1-ab) = 0.85 / 0.85 = 1 => arctan(0.25) + arctan(0.6) = pi/4!
		const addSum =
			arctanBigIntRecursive(25n * 10n ** 16n) + arctanBigIntRecursive(6n * 10n ** 17n);
		assert.ok(absBigInt(addSum - QUARTER_PI) <= 1n, `Addition identity diff: ${addSum - QUARTER_PI}`);
	});

	it('matches an independent iterative BigInt Taylor reference to 0 ULP for |x| <= 0.25', () => {
		const testValues = [
			-25n * 10n ** 16n,
			-2n * 10n ** 17n,
			-123456789012345678n,
			-(10n ** 16n),
			-(10n ** 12n),
			0n,
			10n ** 12n,
			10n ** 16n,
			123456789012345678n,
			2n * 10n ** 17n,
			25n * 10n ** 16n,
		];
		for (const x of testValues) {
			assert.equal(arctanBigIntRecursive(x), naiveIterativeArctanSmall(x));
		}
	});
});
