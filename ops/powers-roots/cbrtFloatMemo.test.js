import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { cbrtFloatMemo } from './cbrtFloatMemo.js';

/**
 * Computes the ULP (unit in the last place) distance between two finite float64 numbers
 * of the same sign.
 *
 * @param {number} a
 * @param {number} b
 * @returns {bigint}
 */
function ulpDistance(a, b) {
	if (Object.is(a, b)) return 0n;
	const buf = new ArrayBuffer(16);
	const f64 = new Float64Array(buf);
	const u64 = new BigUint64Array(buf);
	f64[0] = a;
	f64[1] = b;
	const ia = u64[0];
	const ib = u64[1];
	return ia > ib ? ia - ib : ib - ia;
}

describe('cbrtFloatMemo', () => {
	describe('input validation', () => {
		it('throws TypeError for non-number inputs', () => {
			const invalidInputs = [
				undefined,
				null,
				'27',
				'',
				true,
				false,
				27n,
				{},
				[27],
				Symbol('x'),
				new Number(27),
				() => 27,
			];
			for (const value of invalidInputs) {
				assert.throws(
					() => cbrtFloatMemo(value),
					TypeError,
					`Expected TypeError for ${String(value)}`,
				);
			}
		});

		it('throws TypeError when called with no arguments', () => {
			assert.throws(() => cbrtFloatMemo(), TypeError);
		});
	});

	describe('IEEE-754 special values and edge cases', () => {
		it('preserves +0 and -0', () => {
			assert.ok(Object.is(cbrtFloatMemo(0), 0));
			assert.ok(Object.is(cbrtFloatMemo(-0), -0));
			// Repeated calls still distinguish +0 from -0 (no Map SameValueZero collision).
			assert.ok(Object.is(cbrtFloatMemo(0), 0));
			assert.ok(Object.is(cbrtFloatMemo(-0), -0));
		});

		it('handles Infinity, -Infinity, and NaN', () => {
			assert.equal(cbrtFloatMemo(Infinity), Infinity);
			assert.equal(cbrtFloatMemo(-Infinity), -Infinity);
			assert.ok(Number.isNaN(cbrtFloatMemo(NaN)));
		});

		it('handles subnormal positive and negative float64 values accurately', () => {
			const subnormals = [
				Number.MIN_VALUE, // 5e-324 (2^-1074)
				2 ** -1073,
				2 ** -1072,
				2 ** -1050,
				1e-315,
				1e-310,
				2 ** -1023,
				2.225073858507201e-308, // largest subnormal
			];
			for (const x of subnormals) {
				const expectedPos = Math.cbrt(x);
				const actualPos = cbrtFloatMemo(x);
				assert.ok(
					ulpDistance(actualPos, expectedPos) <= 1n,
					`Subnormal +${x}: got ${actualPos}, expected ${expectedPos} (ULP=${ulpDistance(actualPos, expectedPos)})`,
				);

				const expectedNeg = Math.cbrt(-x);
				const actualNeg = cbrtFloatMemo(-x);
				assert.ok(
					ulpDistance(actualNeg, expectedNeg) <= 1n,
					`Subnormal -${x}: got ${actualNeg}, expected ${expectedNeg}`,
				);
				assert.equal(actualNeg, -actualPos);
			}
		});

		it('handles extreme magnitudes near Number.MAX_VALUE and boundary normals', () => {
			const extremes = [
				2 ** -1022, // smallest positive normal
				2 ** -1021,
				2 ** -1020,
				1e-300,
				1e-100,
				1e100,
				1e300,
				2 ** 1020,
				2 ** 1023,
				Number.MAX_VALUE,
			];
			for (const x of extremes) {
				const actual = cbrtFloatMemo(x);
				const expected = Math.cbrt(x);
				assert.ok(
					ulpDistance(actual, expected) <= 1n,
					`Extreme ${x}: got ${actual}, expected ${expected} (ULP=${ulpDistance(actual, expected)})`,
				);
				assert.equal(cbrtFloatMemo(-x), -actual);
			}
		});
	});

	describe('normal cases and precomputed tables', () => {
		it('returns exact values for precomputed integer cubes and their negations', () => {
			for (const k of [1, 2, 3, 4, 5, 7, 10, 42, 100, 256, 512, 1000, 1024]) {
				const cube = k * k * k;
				assert.equal(cbrtFloatMemo(cube), k);
				assert.equal(cbrtFloatMemo(-cube), -k);
			}
		});

		it('handles fractional and irrational cube roots accurately', () => {
			const cases = [
				[0.125, 0.5],
				[-0.125, -0.5],
				[0.001, 0.1],
				[2, Math.cbrt(2)],
				[3, Math.cbrt(3)],
				[10, Math.cbrt(10)],
				[Math.PI, Math.cbrt(Math.PI)],
				[Math.E, Math.cbrt(Math.E)],
				[1 / 27, 1 / 3],
				[-1 / 64, -0.25],
			];
			for (const [input, expected] of cases) {
				const actual = cbrtFloatMemo(input);
				assert.ok(
					ulpDistance(actual, expected) <= 1n,
					`cbrtFloatMemo(${input})=${actual}, expected=${expected} (ULP=${ulpDistance(actual, expected)})`,
				);
			}
		});

		it('covers all 256 mantissa table buckets and all 3 exponent remainders (r = 0, 1, 2)', () => {
			for (let r = 0; r < 3; r++) {
				const scale = 2 ** r;
				for (let bucket = 0; bucket < 256; bucket++) {
					const m = 1 + (bucket + 0.37) / 256;
					const x = m * scale;
					const actual = cbrtFloatMemo(x);
					const expected = Math.cbrt(x);
					assert.ok(
						ulpDistance(actual, expected) <= 1n,
						`r=${r}, bucket=${bucket}, x=${x}: got ${actual}, expected ${expected} (ULP=${ulpDistance(actual, expected)})`,
					);
				}
			}
		});
	});

	describe('memoization behavior', () => {
		it('returns bit-identical results on repeated calls and symmetric sign lookups', () => {
			const samples = [2.5, 19.75, 123456.789, 1e-42, 7.3e200];
			for (const x of samples) {
				const first = cbrtFloatMemo(x);
				const second = cbrtFloatMemo(x);
				const negFirst = cbrtFloatMemo(-x);
				const negSecond = cbrtFloatMemo(-x);

				assert.ok(Object.is(first, second));
				assert.ok(Object.is(negFirst, negSecond));
				assert.ok(Object.is(negFirst, -first));
			}
		});

		it('handles cache eviction cleanly beyond capacity without degrading accuracy', () => {
			// Exceed the 4096-entry memoization cache capacity to trigger LRU eviction.
			const initial = [];
			for (let i = 1; i <= 5000; i++) {
				const x = i + 0.123456789;
				const y = cbrtFloatMemo(x);
				if (i <= 50) {
					initial.push([x, y]);
				}
			}

			// Re-evaluate evicted entries and confirm bit-identical recomputation.
			for (const [x, expectedY] of initial) {
				const recomputed = cbrtFloatMemo(x);
				assert.ok(
					Object.is(recomputed, expectedY),
					`Recomputed value for ${x} differed after cache eviction`,
				);
				assert.ok(ulpDistance(recomputed, Math.cbrt(x)) <= 1n);
			}
		});
	});

	describe('independent cross-checks', () => {
		it('satisfies (cbrtFloatMemo(x))^3 ≈ x and matches Math.cbrt across deterministic pseudo-random float64 values', () => {
			// Deterministic xorshift32 PRNG for reproducible coverage across exponent scales.
			let state = 0x12345678;
			const nextRand = () => {
				state ^= state << 13;
				state ^= state >>> 17;
				state ^= state << 5;
				return (state >>> 0) / 0x100000000;
			};

			for (let i = 0; i < 1000; i++) {
				const exp = Math.floor(nextRand() * 600) - 300; // [-300, 299]
				const mantissa = 1 + nextRand();
				const sign = i % 2 === 0 ? 1 : -1;
				const x = sign * mantissa * 2 ** exp;

				const y = cbrtFloatMemo(x);
				const ref = Math.cbrt(x);

				// Cross-check 1: ULP agreement against Math.cbrt.
				assert.ok(
					ulpDistance(y, ref) <= 1n,
					`ULP mismatch for x=${x}: got ${y}, Math.cbrt=${ref}`,
				);

				// Cross-check 2: cubing the result recovers x within tight relative tolerance.
				const cubed = y * y * y;
				const relErr = Math.abs(cubed - x) / Math.abs(x);
				assert.ok(
					relErr <= 1e-14,
					`Cubing check failed for x=${x}: y^3=${cubed}, relErr=${relErr}`,
				);

				// Cross-check 3: odd symmetry.
				assert.ok(Object.is(cbrtFloatMemo(-x), -y));
			}
		});

		it('is strictly monotonic over ordered inputs', () => {
			const inputs = [
				-1e100,
				-1000,
				-1,
				-1e-100,
				-Number.MIN_VALUE,
				0,
				Number.MIN_VALUE,
				1e-100,
				1,
				1000,
				1e100,
			];
			const outputs = inputs.map((x) => cbrtFloatMemo(x));
			for (let i = 1; i < outputs.length; i++) {
				assert.ok(
					outputs[i - 1] < outputs[i],
					`Expected monotonicity: cbrt(${inputs[i - 1]}) < cbrt(${inputs[i]})`,
				);
			}
		});
	});
});
