import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { tensorProductTypedStable } from './tensorProductTypedStable.js';

/**
 * Independent BigInt exact IEEE-754 double decoder:
 * returns `{ num, exp2 }` representing exact value `num * 2^exp2` with `num` as BigInt.
 */
function doubleToExactDyadic(x) {
	if (x === 0) {
		return { num: 0n, exp2: 0 };
	}
	const buf = new ArrayBuffer(8);
	new Float64Array(buf)[0] = x;
	const bits = new BigUint64Array(buf)[0];
	const sign = (bits >> 63n) === 1n ? -1n : 1n;
	const rawExp = Number((bits >> 52n) & 0x7ffn);
	const frac = bits & 0x000fffffffffffffn;
	if (rawExp === 0) {
		// Subnormal: value = sign * frac * 2^-1074
		return { num: sign * frac, exp2: -1074 };
	}
	// Normal: value = sign * (2^52 + frac) * 2^(rawExp - 1023 - 52)
	return { num: sign * ((1n << 52n) + frac), exp2: rawExp - 1075 };
}

/**
 * Computes exact |a * b - prod| using arbitrary-precision BigInt dyadic arithmetic
 * and converts the exact residual magnitude to Number for cross-checking Dekker error bounds.
 */
function exactProductResidual(a, b, prod) {
	const da = doubleToExactDyadic(a);
	const db = doubleToExactDyadic(b);
	const dp = doubleToExactDyadic(prod);

	const exactNum = da.num * db.num;
	const exactExp = da.exp2 + db.exp2;

	const minExp = Math.min(exactExp, dp.exp2);
	const diffNum =
		(exactNum << BigInt(exactExp - minExp)) -
		(dp.num << BigInt(dp.exp2 - minExp));
	const absDiff = diffNum < 0n ? -diffNum : diffNum;
	if (absDiff === 0n) {
		return 0;
	}
	return Number(absDiff) * (2 ** minExp);
}

describe('tensorProductTypedStable', () => {
	describe('normal cases', () => {
		it('computes the outer product of two Float64Array vectors in row-major order', () => {
			const a = new Float64Array([1, 2, 3]);
			const b = new Float64Array([4, 5]);
			const result = tensorProductTypedStable(a, b);

			assert.ok(result instanceof Float64Array);
			assert.deepStrictEqual(result, new Float64Array([4, 5, 8, 10, 12, 15]));
		});

		it('handles negative values, fractions, and normalizes -0 to +0', () => {
			const a = new Float64Array([-2, 0, 0.5]);
			const b = new Float64Array([0, -4, 1.5]);
			const result = tensorProductTypedStable(a, b);

			assert.deepStrictEqual(
				result,
				new Float64Array([0, 8, -3, 0, 0, 0, 0, -2, 0.75])
			);
			for (let i = 0; i < result.length; i++) {
				assert.ok(!Object.is(result[i], -0), `index ${i} should not be -0`);
			}
		});

		it('handles singleton vectors and does not mutate inputs', () => {
			const a = new Float64Array([7]);
			const b = new Float64Array([3, -1, 2]);
			const aCopy = new Float64Array(a);
			const bCopy = new Float64Array(b);

			const res1 = tensorProductTypedStable(a, b);
			const res2 = tensorProductTypedStable(b, a);

			assert.deepStrictEqual(res1, new Float64Array([21, -7, 14]));
			assert.deepStrictEqual(res2, new Float64Array([21, -7, 14]));
			assert.deepStrictEqual(a, aCopy);
			assert.deepStrictEqual(b, bCopy);
		});

		it('supports higher-order shapes and detailed diagnostics', () => {
			const a = new Float64Array([1, 2, 3, 4]);
			const b = new Float64Array([10, 20, 30, 40, 50, 60]);
			const details = tensorProductTypedStable(a, b, {
				returnDetails: true,
				shapeA: [2, 2],
				shapeB: [2, 3],
			});

			assert.deepStrictEqual(details.shape, [2, 2, 2, 3]);
			assert.strictEqual(details.data.length, 24);
			assert.strictEqual(details.scaleExponent, 0);
			assert.strictEqual(details.overflowCount, 0);
			assert.strictEqual(details.underflowCount, 0);
			assert.strictEqual(details.maxAbsError, 0); // all exact integers
			// ||a||_2 = sqrt(30), ||b||_2 = sqrt(9100), ||a ⊗ b||_F = sqrt(273000)
			assert.ok(Math.abs(details.frobeniusNorm - Math.sqrt(273000)) <= 1e-12);
		});
	});

	describe('numerical stability and edge cases', () => {
		it('handles empty Float64Array inputs', () => {
			const empty = new Float64Array(0);
			const v = new Float64Array([1, 2, 3]);

			assert.deepStrictEqual(tensorProductTypedStable(empty, v), new Float64Array(0));
			assert.deepStrictEqual(tensorProductTypedStable(v, empty), new Float64Array(0));
			assert.deepStrictEqual(tensorProductTypedStable(empty, empty), new Float64Array(0));

			const details = tensorProductTypedStable(empty, v, { returnDetails: true });
			assert.deepStrictEqual(details.data, new Float64Array(0));
			assert.deepStrictEqual(details.shape, [0, 3]);
			assert.strictEqual(details.frobeniusNorm, 0);
			assert.strictEqual(details.maxAbsError, 0);
		});

		it('handles all-zero vectors including with normalize: true', () => {
			const zeros = new Float64Array([0, 0]);
			const v = new Float64Array([3, 4]);

			const res = tensorProductTypedStable(zeros, v, { normalize: true });
			assert.deepStrictEqual(res, new Float64Array([0, 0, 0, 0]));
		});

		it('normalizes extreme-magnitude vectors (1e250, 1e308, 1e-250, MIN_VALUE) without overflow or underflow', () => {
			const scales = [1e250, 1e308, 1e-250, Number.MIN_VALUE];
			for (const s of scales) {
				const a = new Float64Array([s, s]);
				const b = new Float64Array([s, -s]);
				const res = tensorProductTypedStable(a, b, { normalize: true });

				const expected = [0.5, -0.5, 0.5, -0.5];
				for (let i = 0; i < expected.length; i++) {
					assert.ok(Number.isFinite(res[i]), `scale ${s}: index ${i} must be finite`);
					assert.ok(
						Math.abs(res[i] - expected[i]) <= 1e-15,
						`scale ${s}: got ${res[i]}, expected ${expected[i]}`
					);
				}
			}
		});

		it('preserves full precision for extreme products using scaled mode without overflow or underflow', () => {
			const hugeA = new Float64Array([1.5e300, -2.5e300]);
			const hugeB = new Float64Array([3.0e300, 4.0e300]);
			const hugeDetails = tensorProductTypedStable(hugeA, hugeB, {
				scaled: true,
				returnDetails: true,
			});

			assert.strictEqual(hugeDetails.overflowCount, 0);
			assert.strictEqual(hugeDetails.underflowCount, 0);
			assert.ok(hugeDetails.scaleExponent > 1900);
			for (let i = 0; i < hugeDetails.data.length; i++) {
				assert.ok(Number.isFinite(hugeDetails.data[i]) && hugeDetails.data[i] !== 0);
			}
			// Relative ratios must match [4.5, 6.0, -7.5, -10.0]
			const base = hugeDetails.data[0] / 4.5;
			assert.ok(Math.abs(hugeDetails.data[1] / base - 6.0) <= 1e-14);
			assert.ok(Math.abs(hugeDetails.data[2] / base - (-7.5)) <= 1e-14);
			assert.ok(Math.abs(hugeDetails.data[3] / base - (-10.0)) <= 1e-14);

			const tinyA = new Float64Array([1.5e-300, -2.5e-300]);
			const tinyB = new Float64Array([3.0e-300, 4.0e-300]);
			const tinyDetails = tensorProductTypedStable(tinyA, tinyB, {
				scaled: true,
				returnDetails: true,
			});

			assert.strictEqual(tinyDetails.overflowCount, 0);
			assert.strictEqual(tinyDetails.underflowCount, 0);
			assert.ok(tinyDetails.scaleExponent < -1900);
			const tinyBase = tinyDetails.data[0] / 4.5;
			assert.ok(Math.abs(tinyDetails.data[1] / tinyBase - 6.0) <= 1e-14);
			assert.ok(Math.abs(tinyDetails.data[2] / tinyBase - (-7.5)) <= 1e-14);
			assert.ok(Math.abs(tinyDetails.data[3] / tinyBase - (-10.0)) <= 1e-14);
		});

		it('accurately counts overflows and underflows in unscaled diagnostic mode', () => {
			const over = tensorProductTypedStable(
				new Float64Array([1e200, 1]),
				new Float64Array([1e200, 2]),
				{ returnDetails: true }
			);
			assert.strictEqual(over.overflowCount, 1);
			assert.strictEqual(over.underflowCount, 0);
			assert.strictEqual(over.data[0], Infinity);
			assert.strictEqual(over.data[3], 2);

			const under = tensorProductTypedStable(
				new Float64Array([1e-200, 1]),
				new Float64Array([1e-200, 2]),
				{ returnDetails: true }
			);
			assert.strictEqual(under.overflowCount, 0);
			assert.strictEqual(under.underflowCount, 1);
			assert.strictEqual(under.data[0], 0);
			assert.strictEqual(under.data[3], 2);
		});

		it('maintains accuracy on ill-conditioned vectors with huge dynamic range (compensated norm)', () => {
			// Construct a = [1, 1e-8, 1e-8, ..., 1e-8] with 10000 small entries:
			// True ||a||_2^2 = 1 + 10000 * 1e-16 = 1 + 1e-12 => ||a||_2 = sqrt(1 + 1e-12) ≈ 1 + 5e-13.
			// Naive summation of 1 + 1e-16 repeated 10000 times gets stuck at 1.0 (since 1e-16 < 0.5*eps)!
			const nSmall = 10000;
			const a = new Float64Array(1 + nSmall);
			a[0] = 1;
			a.fill(1e-8, 1);
			const b = new Float64Array([1]);

			const details = tensorProductTypedStable(a, b, { returnDetails: true });
			const expectedNorm = Math.sqrt(1 + nSmall * 1e-16);
			assert.ok(
				Math.abs(details.frobeniusNorm - expectedNorm) < 1e-15,
				`compensated Frobenius norm ${details.frobeniusNorm} should match ${expectedNorm}`
			);
		});
	});

	describe('input validation', () => {
		it('throws TypeError for non-Float64Array inputs', () => {
			const valid = new Float64Array([1, 2]);
			assert.throws(() => tensorProductTypedStable([1, 2], valid), TypeError);
			assert.throws(() => tensorProductTypedStable(valid, [1, 2]), TypeError);
			assert.throws(() => tensorProductTypedStable(new Float32Array([1]), valid), TypeError);
			assert.throws(() => tensorProductTypedStable(null, valid), TypeError);
			assert.throws(() => tensorProductTypedStable(valid, undefined), TypeError);
		});

		it('throws RangeError for NaN or Infinity elements', () => {
			const valid = new Float64Array([1, 2]);
			assert.throws(() => tensorProductTypedStable(new Float64Array([NaN]), valid), RangeError);
			assert.throws(() => tensorProductTypedStable(valid, new Float64Array([Infinity])), RangeError);
			assert.throws(() => tensorProductTypedStable(new Float64Array([-Infinity]), valid), RangeError);
		});

		it('validates options and shape mismatches', () => {
			const a = new Float64Array([1, 2, 3, 4]);
			const b = new Float64Array([5, 6]);

			assert.throws(() => tensorProductTypedStable(a, b, null), TypeError);
			assert.throws(() => tensorProductTypedStable(a, b, []), TypeError);
			assert.throws(() => tensorProductTypedStable(a, b, { normalize: 'yes' }), TypeError);
			assert.throws(() => tensorProductTypedStable(a, b, { scaled: 1 }), TypeError);
			assert.throws(() => tensorProductTypedStable(a, b, { returnDetails: 0 }), TypeError);
			assert.throws(() => tensorProductTypedStable(a, b, { shapeA: [] }), TypeError);
			assert.throws(() => tensorProductTypedStable(a, b, { shapeA: [2, 3] }), RangeError);
			assert.throws(() => tensorProductTypedStable(a, b, { shapeB: [-2] }), RangeError);
			assert.throws(() => tensorProductTypedStable(a, b, { shapeB: [1.5] }), RangeError);
		});
	});

	describe('independent cross-checks', () => {
		it('cross-checks product values and Dekker error bounds against exact BigInt dyadic arithmetic', () => {
			const a = new Float64Array([Math.PI, Math.SQRT2, 0.1, -1 / 3, 1e100 / 7]);
			const b = new Float64Array([Math.E, Math.LN2, 0.3, -1 / 7, 1e-100 / 3]);

			const details = tensorProductTypedStable(a, b, { returnDetails: true });

			let exactMaxErr = 0;
			let exactSumSqErr = 0;

			for (let i = 0; i < a.length; i++) {
				for (let j = 0; j < b.length; j++) {
					const prod = details.data[i * b.length + j];
					const residual = exactProductResidual(a[i], b[j], prod);
					// Every IEEE-754 double product must be within 0.5 ULP of the exact product.
					assert.ok(residual <= Math.abs(prod) * Number.EPSILON * 0.5 + Number.MIN_VALUE);
					if (residual > exactMaxErr) {
						exactMaxErr = residual;
					}
					exactSumSqErr += residual * residual;
				}
			}

			// Dekker twoProd error bound should closely match exact BigInt max residual!
			assert.ok(exactMaxErr > 0, 'test inputs should produce nonzero rounding residuals');
			assert.ok(
				Math.abs(details.maxAbsError - exactMaxErr) <= exactMaxErr * 1e-12,
				`Dekker maxAbsError (${details.maxAbsError}) should match BigInt exact (${exactMaxErr})`
			);
			const exactFrobErr = Math.sqrt(exactSumSqErr);
			assert.ok(
				Math.abs(details.frobeniusErrorBound - exactFrobErr) <= exactFrobErr * 1e-12,
				`Frobenius error bound (${details.frobeniusErrorBound}) should match exact (${exactFrobErr})`
			);
		});

		it('satisfies algebraic identities: mixed-product inner product, bilinearity, and transpose symmetry', () => {
			const a = new Float64Array([1.25, -2.5, 0.75, 4.0]);
			const b = new Float64Array([-0.5, 3.25, 1.5]);
			const c = new Float64Array([2.0, 0.5, -1.75, 0.25]);
			const d = new Float64Array([4.0, -1.0, 2.5]);

			const ab = tensorProductTypedStable(a, b);
			const cd = tensorProductTypedStable(c, d);

			// 1. Mixed-product / inner-product identity: <a ⊗ b, c ⊗ d> = <a, c> * <b, d>
			let dotTensor = 0;
			for (let i = 0; i < ab.length; i++) {
				dotTensor += ab[i] * cd[i];
			}
			let dotAC = 0;
			for (let i = 0; i < a.length; i++) {
				dotAC += a[i] * c[i];
			}
			let dotBD = 0;
			for (let j = 0; j < b.length; j++) {
				dotBD += b[j] * d[j];
			}
			assert.ok(Math.abs(dotTensor - dotAC * dotBD) <= 1e-12);

			// 2. Bilinearity: (alpha * a + beta * c) ⊗ b === alpha * (a ⊗ b) + beta * (c ⊗ b)
			const alpha = 2.5;
			const beta = -1.25;
			const linComb = new Float64Array(a.length);
			for (let i = 0; i < a.length; i++) {
				linComb[i] = alpha * a[i] + beta * c[i];
			}
			const lhs = tensorProductTypedStable(linComb, b);
			const cb = tensorProductTypedStable(c, b);
			for (let i = 0; i < lhs.length; i++) {
				const rhs = alpha * ab[i] + beta * cb[i];
				assert.ok(Math.abs(lhs[i] - rhs) <= 1e-12);
			}

			// 3. Transpose symmetry: (a ⊗ b)[i, j] === (b ⊗ a)[j, i]
			const ba = tensorProductTypedStable(b, a);
			for (let i = 0; i < a.length; i++) {
				for (let j = 0; j < b.length; j++) {
					assert.strictEqual(ab[i * b.length + j], ba[j * a.length + i]);
				}
			}

			// 4. Normalized tensor product has unit Frobenius norm
			const normDetails = tensorProductTypedStable(a, b, {
				normalize: true,
				returnDetails: true,
			});
			assert.ok(Math.abs(normDetails.frobeniusNorm - 1) <= 1e-14);
		});
	});
});
