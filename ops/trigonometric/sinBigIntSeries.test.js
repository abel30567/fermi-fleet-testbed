import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { sinBigIntSeries } from './sinBigIntSeries.js';

const SCALE = 10n ** 18n;

/**
 * Helper for absolute difference of two BigInts.
 * @param {bigint} a
 * @param {bigint} b
 * @returns {bigint}
 */
function absDiff(a, b) {
	return a >= b ? a - b : b - a;
}

describe('sinBigIntSeries', () => {
	it('returns exact 0n for 0n', () => {
		assert.equal(sinBigIntSeries(0n), 0n);
	});

	it('matches known 18-digit fixed-point values for standard and large radians', () => {
		// Independently verified to 25+ decimal digits via Gauss-Legendre AGM π
		assert.equal(sinBigIntSeries(1n), 841470984807896507n);
		assert.equal(sinBigIntSeries(2n), 909297426825681695n);
		assert.equal(sinBigIntSeries(3n), 141120008059867222n);
		assert.equal(sinBigIntSeries(10n), -544021110889369813n);
		// 355 ≈ 113π (classic rational approximation near a zero crossing)
		assert.equal(sinBigIntSeries(355n), -30144353359488n);
		// Large integer radians
		assert.equal(sinBigIntSeries(1_000_000n), -349993502171292952n);
		// Beyond Number.MAX_SAFE_INTEGER where floating-point Math.sin loses precision
		assert.equal(sinBigIntSeries(10n ** 18n), -992969320740405076n);
	});

	it('satisfies exact odd symmetry sin(-x) === -sin(x)', () => {
		const testValues = [
			1n,
			2n,
			3n,
			7n,
			10n,
			355n,
			1_000_000n,
			10n ** 18n,
			10n ** 50n,
		];
		for (const x of testValues) {
			const pos = sinBigIntSeries(x);
			const neg = sinBigIntSeries(-x);
			assert.equal(neg, -pos, `Expected sin(-${x}) === -sin(${x})`);
			assert.ok(pos >= -SCALE && pos <= SCALE, `Result out of [-10^18, 10^18] for ${x}`);
		}
	});

	it('cross-checks against Math.sin(Number(x)) across small and medium integers', () => {
		const samples = [];
		for (let i = -50n; i <= 50n; i += 1n) {
			samples.push(i);
		}
		samples.push(100n, -100n, 355n, 1000n, 1_000_000n, -1_000_000n);

		for (const x of samples) {
			const exactScaled = sinBigIntSeries(x);
			const asNumber = Number(exactScaled) / 1e18;
			const expected = Math.sin(Number(x));
			// Allow IEEE-754 double precision tolerance (larger for |x| = 10^6 due to float range reduction)
			const tol = x === 1_000_000n || x === -1_000_000n ? 1e-10 : 1e-14;
			assert.ok(
				Math.abs(asNumber - expected) <= tol,
				`Mismatch for x=${x}: got ${asNumber}, Math.sin=${expected}`
			);
		}
	});

	it('cross-checks against the triple-angle identity sin(3x) = 3·sin(x) - 4·sin³(x)', () => {
		const inputs = [0n, 1n, 2n, 3n, 5n, 17n, -42n, 355n, 1_000_000n, 10n ** 25n];
		const scale2 = SCALE * SCALE;
		const halfScale2 = scale2 >> 1n;

		for (const x of inputs) {
			const sx = sinBigIntSeries(x);
			const s3x = sinBigIntSeries(3n * x);

			// Compute round(4 * sx^3 / SCALE^2)
			const sx3 = sx * sx * sx;
			const fourSx3 = 4n * sx3;
			const fourSx3Scaled =
				fourSx3 >= 0n
					? (fourSx3 + halfScale2) / scale2
					: -((-fourSx3 + halfScale2) / scale2);

			const rhs = 3n * sx - fourSx3Scaled;
			assert.ok(
				absDiff(s3x, rhs) <= 12n,
				`Triple-angle identity failed for x=${x}: sin(3x)=${s3x}, 3s-4s^3=${rhs}`
			);
		}
	});

	it('cross-checks against the pure-sine proportionality identity (sin(x+1)+sin(x-1))·sin(y) = (sin(y+1)+sin(y-1))·sin(x)', () => {
		// Both sides equal 2·cos(1)·sin(x)·sin(y)
		const pairs = [
			[1n, 2n],
			[4n, 10n],
			[-7n, 23n],
			[1_000_000n, 10n ** 18n],
		];

		for (const [x, y] of pairs) {
			const lhs = (sinBigIntSeries(x + 1n) + sinBigIntSeries(x - 1n)) * sinBigIntSeries(y);
			const rhs = (sinBigIntSeries(y + 1n) + sinBigIntSeries(y - 1n)) * sinBigIntSeries(x);
			// Products are scaled by 10^36; allow up to 6 * 10^18 (6 ULPs at 10^18 scale)
			assert.ok(
				absDiff(lhs, rhs) <= 6n * SCALE,
				`Proportionality identity failed for (${x}, ${y}): diff=${absDiff(lhs, rhs)}`
			);
		}
	});

	it('handles cache expansion and reuse cleanly across varying magnitudes', () => {
		const large1 = sinBigIntSeries(10n ** 60n);
		const small = sinBigIntSeries(1n);
		const large2 = sinBigIntSeries(10n ** 80n);
		const large1Repeat = sinBigIntSeries(10n ** 60n);

		assert.equal(small, 841470984807896507n);
		assert.equal(large1, large1Repeat);
		assert.equal(typeof large2, 'bigint');
		assert.ok(large2 >= -SCALE && large2 <= SCALE);
	});

	it('throws TypeError for non-BigInt inputs', () => {
		const invalidInputs = [
			undefined,
			null,
			0,
			1,
			-1,
			1.5,
			NaN,
			Infinity,
			-Infinity,
			'0',
			'1',
			true,
			false,
			{},
			[1n],
			Symbol('x'),
			() => 1n,
		];

		assert.throws(() => sinBigIntSeries(), TypeError);
		for (const bad of invalidInputs) {
			assert.throws(
				() => sinBigIntSeries(bad),
				TypeError,
				`Expected TypeError for input: ${String(bad)}`
			);
		}
	});
});
