import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { tensorProductRationalRecursive } from './tensorProductRationalRecursive.js';

/**
 * Shorthand constructor for rational literals in tests.
 *
 * @param {bigint} num
 * @param {bigint} [den=1n]
 * @returns {{ num: bigint, den: bigint }}
 */
const rat = (num, den = 1n) => ({ num, den });

function absBigInt(x) {
	return x < 0n ? -x : x;
}

function gcdBigInt(a, b) {
	let x = absBigInt(a);
	let y = absBigInt(b);
	while (y !== 0n) {
		const r = x % y;
		x = y;
		y = r;
	}
	return x;
}

function normalizeRatOracle(r) {
	if (r.num === 0n) return { num: 0n, den: 1n };
	let n = r.num;
	let d = r.den;
	if (d < 0n) {
		n = -n;
		d = -d;
	}
	const g = gcdBigInt(n, d);
	return { num: n / g, den: d / g };
}

function addRatOracle(a, b) {
	return normalizeRatOracle({
		num: a.num * b.den + b.num * a.den,
		den: a.den * b.den,
	});
}

function mulRatOracle(a, b) {
	return normalizeRatOracle({
		num: a.num * b.num,
		den: a.den * b.den,
	});
}

/**
 * Verifies every rational leaf in a tensor is strictly normalized in lowest
 * terms with `den > 0n` (and `0n / 1n` for zero).
 */
function assertAllLeavesNormalized(tensor) {
	if (!Array.isArray(tensor)) {
		assert.equal(typeof tensor.num, 'bigint');
		assert.equal(typeof tensor.den, 'bigint');
		assert.ok(tensor.den > 0n, `expected den > 0n, got ${tensor.den}`);
		if (tensor.num === 0n) {
			assert.equal(tensor.den, 1n, 'zero must have denominator 1n');
		} else {
			assert.equal(
				gcdBigInt(tensor.num, tensor.den),
				1n,
				`expected lowest terms for ${tensor.num}/${tensor.den}`
			);
		}
		return;
	}
	for (const child of tensor) {
		assertAllLeavesNormalized(child);
	}
}

/**
 * Independent iterative flat-buffer / stride-based tensor product oracle.
 */
function getShapeAndFlatten(tensor) {
	if (!Array.isArray(tensor)) {
		return { shape: [], data: [normalizeRatOracle(tensor)] };
	}
	const shape = [];
	let cur = tensor;
	while (Array.isArray(cur)) {
		shape.push(cur.length);
		if (cur.length === 0) break;
		cur = cur[0];
	}
	const data = [];
	const stack = [tensor];
	while (stack.length > 0) {
		const node = stack.pop();
		if (!Array.isArray(node)) {
			data.push(normalizeRatOracle(node));
		} else {
			for (let i = node.length - 1; i >= 0; i -= 1) {
				stack.push(node[i]);
			}
		}
	}
	return { shape, data };
}

function unflatten(shape, data) {
	if (shape.length === 0) {
		return data[0];
	}
	const total = shape.reduce((acc, d) => acc * d, 1);
	if (total === 0) {
		const buildEmpty = (dimIdx) => {
			const size = shape[dimIdx];
			if (size === 0) return [];
			const arr = new Array(size);
			for (let i = 0; i < size; i += 1) {
				arr[i] = buildEmpty(dimIdx + 1);
			}
			return arr;
		};
		return buildEmpty(0);
	}
	// Iterative bottom-up reshape from innermost dimension outward
	let current = data.slice();
	for (let d = shape.length - 1; d >= 0; d -= 1) {
		const dim = shape[d];
		const next = [];
		for (let i = 0; i < current.length; i += dim) {
			next.push(current.slice(i, i + dim));
		}
		current = next;
	}
	return current[0];
}

function iterativeTensorProductOracle(a, b) {
	const fa = getShapeAndFlatten(a);
	const fb = getShapeAndFlatten(b);
	const outShape = [...fa.shape, ...fb.shape];
	const outData = new Array(fa.data.length * fb.data.length);
	let idx = 0;
	for (let i = 0; i < fa.data.length; i += 1) {
		for (let j = 0; j < fb.data.length; j += 1) {
			outData[idx] = mulRatOracle(fa.data[i], fb.data[j]);
			idx += 1;
		}
	}
	return unflatten(outShape, outData);
}

function addTensorsOracle(a, b) {
	if (!Array.isArray(a)) {
		return addRatOracle(normalizeRatOracle(a), normalizeRatOracle(b));
	}
	return a.map((item, i) => addTensorsOracle(item, b[i]));
}

function sumTensorEntries(tensor) {
	const { data } = getShapeAndFlatten(tensor);
	return data.reduce((acc, r) => addRatOracle(acc, r), rat(0n, 1n));
}

function frobeniusNormSquared(tensor) {
	const { data } = getShapeAndFlatten(tensor);
	return data.reduce((acc, r) => addRatOracle(acc, mulRatOracle(r, r)), rat(0n, 1n));
}

describe('tensorProductRationalRecursive', () => {
	describe('normal cases', () => {
		it('computes rank-0 (scalar ⊗ scalar) with reduction and sign normalization', () => {
			const res = tensorProductRationalRecursive(rat(2n, 3n), rat(3n, 4n));
			assert.deepStrictEqual(res, rat(1n, 2n));
			assertAllLeavesNormalized(res);

			const neg = tensorProductRationalRecursive(rat(-6n, 10n), rat(5n, -9n));
			assert.deepStrictEqual(neg, rat(1n, 3n));
			assertAllLeavesNormalized(neg);
		});

		it('computes scalar ⊗ vector and vector ⊗ scalar', () => {
			const scalar = rat(-2n, 5n);
			const vec = [rat(5n, 6n), rat(0n, 7n), rat(-15n, 4n)];
			const expected = [rat(-1n, 3n), rat(0n, 1n), rat(3n, 2n)];

			const leftScaled = tensorProductRationalRecursive(scalar, vec);
			const rightScaled = tensorProductRationalRecursive(vec, scalar);

			assert.deepStrictEqual(leftScaled, expected);
			assert.deepStrictEqual(rightScaled, expected);
			assertAllLeavesNormalized(leftScaled);
			assertAllLeavesNormalized(rightScaled);
		});

		it('computes rank-1 ⊗ rank-1 (outer product of vectors -> 2D matrix)', () => {
			const u = [rat(1n, 2n), rat(-2n, 3n), rat(4n, 5n)];
			const v = [rat(3n, 5n), rat(0n, 1n), rat(6n, 7n), rat(-5n, 2n)];

			const res = tensorProductRationalRecursive(u, v);
			assert.deepStrictEqual(res, [
				[rat(3n, 10n), rat(0n, 1n), rat(3n, 7n), rat(-5n, 4n)],
				[rat(-2n, 5n), rat(0n, 1n), rat(-4n, 7n), rat(5n, 3n)],
				[rat(12n, 25n), rat(0n, 1n), rat(24n, 35n), rat(-2n, 1n)],
			]);
			assertAllLeavesNormalized(res);
		});

		it('computes mixed-rank products (vector ⊗ matrix and matrix ⊗ vector -> rank-3)', () => {
			const v = [rat(1n, 2n), rat(3n, 4n)];
			const m = [
				[rat(2n, 3n), rat(-4n, 5n)],
				[rat(0n, 1n), rat(8n, 9n)],
			];

			const vm = tensorProductRationalRecursive(v, m);
			assert.deepStrictEqual(vm, [
				[
					[rat(1n, 3n), rat(-2n, 5n)],
					[rat(0n, 1n), rat(4n, 9n)],
				],
				[
					[rat(1n, 2n), rat(-3n, 5n)],
					[rat(0n, 1n), rat(2n, 3n)],
				],
			]);
			assertAllLeavesNormalized(vm);

			const mv = tensorProductRationalRecursive(m, v);
			assert.deepStrictEqual(mv, [
				[
					[rat(1n, 3n), rat(1n, 2n)],
					[rat(-2n, 5n), rat(-3n, 5n)],
				],
				[
					[rat(0n, 1n), rat(0n, 1n)],
					[rat(4n, 9n), rat(2n, 3n)],
				],
			]);
			assertAllLeavesNormalized(mv);
		});

		it('computes rank-2 ⊗ rank-2 (matrix ⊗ matrix -> rank-4 tensor)', () => {
			const a = [
				[rat(1n, 2n), rat(2n, 3n)],
				[rat(-3n, 4n), rat(5n, 6n)],
			];
			const b = [
				[rat(4n, 5n), rat(-6n, 7n)],
				[rat(0n, 1n), rat(9n, 10n)],
			];

			const res = tensorProductRationalRecursive(a, b);
			assert.equal(res.length, 2);
			assert.equal(res[0].length, 2);
			assert.equal(res[0][0].length, 2);
			assert.equal(res[0][0][0].length, 2);

			assert.deepStrictEqual(res[0][0], [
				[rat(2n, 5n), rat(-3n, 7n)],
				[rat(0n, 1n), rat(9n, 20n)],
			]);
			assert.deepStrictEqual(res[1][1], [
				[rat(2n, 3n), rat(-5n, 7n)],
				[rat(0n, 1n), rat(3n, 4n)],
			]);
			assertAllLeavesNormalized(res);
		});

		it('normalizes unnormalized inputs (reducible fractions, negative denominators, zero)', () => {
			const a = [rat(6n, -12n), rat(0n, -99n)];
			const b = [rat(-10n, -15n), rat(4n, 8n)];

			const res = tensorProductRationalRecursive(a, b);
			assert.deepStrictEqual(res, [
				[rat(-1n, 3n), rat(-1n, 4n)],
				[rat(0n, 1n), rat(0n, 1n)],
			]);
			assertAllLeavesNormalized(res);
		});
	});

	describe('edge cases', () => {
		it('handles empty tensors cleanly across shapes', () => {
			assert.deepStrictEqual(tensorProductRationalRecursive([], [rat(1n, 2n)]), []);
			assert.deepStrictEqual(tensorProductRationalRecursive([rat(1n, 2n), rat(3n, 4n)], []), [[], []]);
			assert.deepStrictEqual(tensorProductRationalRecursive([], []), []);
			assert.deepStrictEqual(tensorProductRationalRecursive([], rat(5n, 3n)), []);
			assert.deepStrictEqual(tensorProductRationalRecursive(rat(5n, 3n), []), []);
			assert.deepStrictEqual(tensorProductRationalRecursive([[], []], [rat(2n, 3n)]), [[], []]);
		});

		it('handles singleton dimensions and deeply nested rank-1 wrappers', () => {
			const a = [[[rat(7n, 9n)]]];
			const b = [[rat(3n, 14n)]];
			const res = tensorProductRationalRecursive(a, b);
			assert.deepStrictEqual(res, [[[[[rat(1n, 6n)]]]]]);
			assertAllLeavesNormalized(res);
		});

		it('handles arbitrary-precision BigInt rationals without precision loss', () => {
			const p1 = 2n ** 127n - 1n; // Mersenne prime M_127
			const p2 = 2n ** 89n - 1n; // Mersenne prime M_89
			const bigFactor = 10n ** 40n;

			const a = [rat(p1 * bigFactor, p2), rat(-1n, bigFactor)];
			const b = [rat(p2, bigFactor), rat(1n, p1)];

			const res = tensorProductRationalRecursive(a, b);
			assert.deepStrictEqual(res, [
				[rat(p1, 1n), rat(bigFactor, p2)],
				[rat(-p2, bigFactor * bigFactor), rat(-1n, bigFactor * p1)],
			]);
			assertAllLeavesNormalized(res);
		});

		it('handles non-power-of-two larger slices exercising deep divide-and-conquer', () => {
			const u = Array.from({ length: 17 }, (_, i) => rat(BigInt(i - 8), BigInt(i + 1)));
			const v = Array.from({ length: 19 }, (_, j) => rat(BigInt(2 * j - 9), BigInt(j + 2)));

			const res = tensorProductRationalRecursive(u, v);
			assert.equal(res.length, 17);
			assert.equal(res[0].length, 19);
			assert.deepStrictEqual(res, iterativeTensorProductOracle(u, v));
			assertAllLeavesNormalized(res);
		});

		it('does not mutate inputs or alias input rational objects', () => {
			const r1 = rat(1n, 1n);
			const r2 = rat(2n, 3n);
			const a = [r1];
			const b = [r2];

			const res = tensorProductRationalRecursive(a, b);
			assert.deepStrictEqual(res, [[rat(2n, 3n)]]);
			assert.notEqual(res[0][0], r1);
			assert.notEqual(res[0][0], r2);
			assert.notEqual(res[0], b);

			res[0][0].num = 999n;
			assert.deepStrictEqual(r1, rat(1n, 1n));
			assert.deepStrictEqual(r2, rat(2n, 3n));
		});

		it('accepts null-prototype rational objects', () => {
			const nullProtoA = Object.assign(Object.create(null), { num: 4n, den: 6n });
			const nullProtoB = Object.assign(Object.create(null), { num: 9n, den: 10n });
			const res = tensorProductRationalRecursive(nullProtoA, nullProtoB);
			assert.deepStrictEqual(res, rat(3n, 5n));
			assertAllLeavesNormalized(res);
		});
	});

	describe('invalid inputs', () => {
		it('rejects non-rational primitive and malformed inputs', () => {
			const badInputs = [
				null,
				undefined,
				42,
				NaN,
				'1/2',
				true,
				5n,
				() => {},
				{},
				{ num: 1n },
				{ den: 2n },
				{ num: 1, den: 2n },
				{ num: 1n, den: 2 },
				{ num: '1', den: '2' },
			];

			for (const bad of badInputs) {
				assert.throws(
					() => tensorProductRationalRecursive(bad, rat(1n, 1n)),
					TypeError
				);
				assert.throws(
					() => tensorProductRationalRecursive(rat(1n, 1n), bad),
					TypeError
				);
			}
		});

		it('rejects missing arguments', () => {
			assert.throws(() => tensorProductRationalRecursive(), TypeError);
			assert.throws(() => tensorProductRationalRecursive(rat(1n, 1n)), TypeError);
		});

		it('rejects zero denominators anywhere, even when the other operand is empty', () => {
			assert.throws(
				() => tensorProductRationalRecursive(rat(1n, 0n), rat(1n, 2n)),
				RangeError
			);
			assert.throws(
				() => tensorProductRationalRecursive(rat(0n, 0n), rat(1n, 2n)),
				RangeError
			);
			assert.throws(
				() => tensorProductRationalRecursive([], [rat(3n, 0n)]),
				RangeError
			);
			assert.throws(
				() => tensorProductRationalRecursive([rat(3n, 0n)], []),
				RangeError
			);
		});

		it('rejects jagged or mixed-depth tensors', () => {
			const jagged1 = [[rat(1n, 1n), rat(2n, 1n)], [rat(3n, 1n)]];
			const jagged2 = [rat(1n, 1n), [rat(2n, 1n)]];
			const jagged3 = [[], [rat(1n, 1n)]];
			const jagged4 = [
				[[rat(1n, 1n)], [rat(2n, 1n)]],
				[[rat(3n, 1n), rat(4n, 1n)], [rat(5n, 1n)]],
			];

			for (const bad of [jagged1, jagged2, jagged3, jagged4]) {
				assert.throws(
					() => tensorProductRationalRecursive(bad, rat(1n, 1n)),
					TypeError
				);
				assert.throws(
					() => tensorProductRationalRecursive(rat(1n, 1n), bad),
					TypeError
				);
			}
		});

		it('rejects sparse arrays', () => {
			// eslint-disable-next-line no-sparse-arrays
			const sparse1 = [rat(1n, 1n), , rat(2n, 1n)];
			const sparse2 = new Array(3);

			assert.throws(() => tensorProductRationalRecursive(sparse1, rat(1n, 1n)), TypeError);
			assert.throws(() => tensorProductRationalRecursive(rat(1n, 1n), sparse2), TypeError);
		});
	});

	describe('independent cross-checks and algebraic identities', () => {
		it('matches an independent iterative flat-index oracle across multiple shapes and ranks', () => {
			const tensors = [
				rat(-7n, 12n),
				[rat(1n, 3n), rat(-5n, 6n), rat(0n, 1n), rat(7n, 2n)],
				[
					[rat(2n, 5n), rat(-3n, 7n), rat(11n, 13n)],
					[rat(-4n, 9n), rat(0n, 1n), rat(5n, 8n)],
				],
				[
					[
						[rat(1n, 2n), rat(-1n, 3n)],
						[rat(3n, 4n), rat(-2n, 5n)],
					],
					[
						[rat(5n, 6n), rat(0n, 1n)],
						[rat(-7n, 8n), rat(9n, 10n)],
					],
				],
			];

			for (const a of tensors) {
				for (const b of tensors) {
					const actual = tensorProductRationalRecursive(a, b);
					const expected = iterativeTensorProductOracle(a, b);
					assert.deepStrictEqual(actual, expected);
					assertAllLeavesNormalized(actual);
				}
			}
		});

		it('satisfies associativity: (A ⊗ B) ⊗ C === A ⊗ (B ⊗ C)', () => {
			const A = [rat(1n, 2n), rat(-3n, 5n)];
			const B = [
				[rat(2n, 3n), rat(4n, 7n)],
				[rat(-5n, 6n), rat(0n, 1n)],
			];
			const C = [rat(7n, 8n), rat(-9n, 11n), rat(13n, 15n)];

			const leftGrouped = tensorProductRationalRecursive(
				tensorProductRationalRecursive(A, B),
				C
			);
			const rightGrouped = tensorProductRationalRecursive(
				A,
				tensorProductRationalRecursive(B, C)
			);

			assert.deepStrictEqual(leftGrouped, rightGrouped);
			assertAllLeavesNormalized(leftGrouped);
		});

		it('satisfies bilinearity (left/right distributivity and scalar compatibility)', () => {
			const A1 = [rat(1n, 3n), rat(-2n, 5n), rat(4n, 7n)];
			const A2 = [rat(5n, 6n), rat(3n, 10n), rat(-1n, 14n)];
			const B1 = [
				[rat(2n, 9n), rat(-1n, 4n)],
				[rat(3n, 8n), rat(5n, 12n)],
			];
			const B2 = [
				[rat(-7n, 9n), rat(3n, 4n)],
				[rat(1n, 8n), rat(-11n, 12n)],
			];
			const c = rat(-7n, 11n);

			// Left distributivity: (A1 + A2) ⊗ B1 === (A1 ⊗ B1) + (A2 ⊗ B1)
			const lhsLeft = tensorProductRationalRecursive(addTensorsOracle(A1, A2), B1);
			const rhsLeft = addTensorsOracle(
				tensorProductRationalRecursive(A1, B1),
				tensorProductRationalRecursive(A2, B1)
			);
			assert.deepStrictEqual(lhsLeft, rhsLeft);

			// Right distributivity: A1 ⊗ (B1 + B2) === (A1 ⊗ B1) + (A1 ⊗ B2)
			const lhsRight = tensorProductRationalRecursive(A1, addTensorsOracle(B1, B2));
			const rhsRight = addTensorsOracle(
				tensorProductRationalRecursive(A1, B1),
				tensorProductRationalRecursive(A1, B2)
			);
			assert.deepStrictEqual(lhsRight, rhsRight);

			// Scalar compatibility: (c ⊗ A1) ⊗ B1 === A1 ⊗ (c ⊗ B1) === c ⊗ (A1 ⊗ B1)
			const s1 = tensorProductRationalRecursive(
				tensorProductRationalRecursive(c, A1),
				B1
			);
			const s2 = tensorProductRationalRecursive(
				A1,
				tensorProductRationalRecursive(c, B1)
			);
			const s3 = tensorProductRationalRecursive(
				c,
				tensorProductRationalRecursive(A1, B1)
			);
			assert.deepStrictEqual(s1, s2);
			assert.deepStrictEqual(s2, s3);
		});

		it('satisfies exact sum-of-entries and Frobenius norm squared multiplicativity', () => {
			const A = [
				[rat(3n, 7n), rat(-5n, 9n), rat(11n, 4n)],
				[rat(-2n, 3n), rat(7n, 12n), rat(1n, 6n)],
			];
			const B = [
				[rat(-4n, 5n), rat(9n, 11n)],
				[rat(2n, 13n), rat(-3n, 8n)],
				[rat(5n, 6n), rat(7n, 10n)],
			];

			const prod = tensorProductRationalRecursive(A, B);

			assert.deepStrictEqual(
				sumTensorEntries(prod),
				mulRatOracle(sumTensorEntries(A), sumTensorEntries(B))
			);
			assert.deepStrictEqual(
				frobeniusNormSquared(prod),
				mulRatOracle(frobeniusNormSquared(A), frobeniusNormSquared(B))
			);
		});
	});
});
