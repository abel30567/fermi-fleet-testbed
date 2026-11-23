import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { crossProductBigIntIterative } from './crossProductBigIntIterative.js';

function dotBigInt(u, v) {
	return u[0] * v[0] + u[1] * v[1] + u[2] * v[2];
}

function addBigInt(u, v) {
	return [u[0] + v[0], u[1] + v[1], u[2] + v[2]];
}

function scaleBigInt(s, v) {
	return [s * v[0], s * v[1], s * v[2]];
}

/**
 * Independent reference using the Levi-Civita symbol ε_{ijk}:
 * (a × b)_k = Σ_{i=0..2} Σ_{j=0..2} ε_{ijk} * a_i * b_j
 */
function crossProductLeviCivita(a, b) {
	const leviCivita = (i, j, k) => {
		if (i === j || j === k || i === k) return 0n;
		return ((j - i) * (k - j) * (k - i)) > 0 ? 1n : -1n;
	};
	const out = [0n, 0n, 0n];
	for (let k = 0; k < 3; k++) {
		let sum = 0n;
		for (let i = 0; i < 3; i++) {
			for (let j = 0; j < 3; j++) {
				sum += leviCivita(i, j, k) * a[i] * b[j];
			}
		}
		out[k] = sum;
	}
	return out;
}

describe('crossProductBigIntIterative', () => {
	it('computes right-handed standard basis cross products', () => {
		const i = [1n, 0n, 0n];
		const j = [0n, 1n, 0n];
		const k = [0n, 0n, 1n];

		assert.deepStrictEqual(crossProductBigIntIterative(i, j), k);
		assert.deepStrictEqual(crossProductBigIntIterative(j, k), i);
		assert.deepStrictEqual(crossProductBigIntIterative(k, i), j);

		assert.deepStrictEqual(crossProductBigIntIterative(j, i), [0n, 0n, -1n]);
		assert.deepStrictEqual(crossProductBigIntIterative(k, j), [-1n, 0n, 0n]);
		assert.deepStrictEqual(crossProductBigIntIterative(i, k), [0n, -1n, 0n]);
	});

	it('computes general 3D vector cross products accurately', () => {
		assert.deepStrictEqual(
			crossProductBigIntIterative([1n, 2n, 3n], [4n, 5n, 6n]),
			[-3n, 6n, -3n],
		);
		assert.deepStrictEqual(
			crossProductBigIntIterative([-2n, 3n, -5n], [7n, -11n, 13n]),
			[-16n, -9n, 1n],
		);
		assert.deepStrictEqual(
			crossProductBigIntIterative([3n, -3n, 1n], [4n, 9n, 2n]),
			[-15n, -2n, 39n],
		);
	});

	it('handles zero, identical, and collinear vectors', () => {
		const zero = [0n, 0n, 0n];
		const v = [7n, -13n, 29n];

		assert.deepStrictEqual(crossProductBigIntIterative(zero, zero), zero);
		assert.deepStrictEqual(crossProductBigIntIterative(zero, v), zero);
		assert.deepStrictEqual(crossProductBigIntIterative(v, zero), zero);
		assert.deepStrictEqual(crossProductBigIntIterative(v, v), zero);
		assert.deepStrictEqual(crossProductBigIntIterative(v, scaleBigInt(-19n, v)), zero);
	});

	it('preserves exact precision for huge BigInt values beyond MAX_SAFE_INTEGER', () => {
		const base = 10n ** 30n;
		const a = [base + 1n, base + 2n, base + 3n];
		const b = [2n * base + 5n, 2n * base + 7n, 2n * base + 11n];

		// (base+2)*(2*base+11) - (base+3)*(2*base+7)
		// = (2b^2 + 15b + 22) - (2b^2 + 13b + 21) = 2b + 1
		// (base+3)*(2*base+5) - (base+1)*(2*base+11)
		// = (2b^2 + 11b + 15) - (2b^2 + 13b + 11) = -2b + 4
		// (base+1)*(2*base+7) - (base+2)*(2*base+5)
		// = (2b^2 + 9b + 7) - (2b^2 + 9b + 10) = -3
		const expected = [2n * base + 1n, -2n * base + 4n, -3n];
		assert.deepStrictEqual(crossProductBigIntIterative(a, b), expected);
	});

	it('does not mutate input vectors', () => {
		const a = [2n, 3n, 4n];
		const b = [5n, 6n, 7n];
		const out = crossProductBigIntIterative(a, b);

		assert.deepStrictEqual(a, [2n, 3n, 4n]);
		assert.deepStrictEqual(b, [5n, 6n, 7n]);
		assert.notStrictEqual(out, a);
		assert.notStrictEqual(out, b);
	});

	it('validates input types, lengths, and element types', () => {
		const valid = [1n, 2n, 3n];

		assert.throws(() => crossProductBigIntIterative(null, valid), TypeError);
		assert.throws(() => crossProductBigIntIterative(valid, undefined), TypeError);
		assert.throws(() => crossProductBigIntIterative('123', valid), TypeError);
		assert.throws(() => crossProductBigIntIterative(valid, { 0: 1n, 1: 2n, 2: 3n, length: 3 }), TypeError);

		assert.throws(() => crossProductBigIntIterative([], valid), RangeError);
		assert.throws(() => crossProductBigIntIterative([1n, 2n], valid), RangeError);
		assert.throws(() => crossProductBigIntIterative(valid, [1n, 2n, 3n, 4n]), RangeError);

		assert.throws(() => crossProductBigIntIterative([1, 2n, 3n], valid), TypeError);
		assert.throws(() => crossProductBigIntIterative(valid, [1n, '2', 3n]), TypeError);
		assert.throws(() => crossProductBigIntIterative(valid, [1n, 2n, null]), TypeError);
		assert.throws(() => crossProductBigIntIterative(new Array(3), valid), TypeError);
	});

	it('cross-checks against independent Levi-Civita tensor summation', () => {
		const pairs = [
			[[1n, 0n, -1n], [2n, 3n, 4n]],
			[[-17n, 23n, -31n], [41n, -53n, 67n]],
			[[-(2n ** 90n) + 7n, 2n ** 80n - 11n, 3n ** 50n], [5n ** 40n, -(2n ** 95n), 10n ** 25n + 1n]],
			[[0n, 10n ** 18n, -(10n ** 18n)], [10n ** 18n, 0n, 10n ** 18n]],
		];

		for (const [a, b] of pairs) {
			assert.deepStrictEqual(
				crossProductBigIntIterative(a, b),
				crossProductLeviCivita(a, b),
			);
		}
	});

	it('satisfies algebraic vector cross product identities', () => {
		const a = [12345678901234567890n, -9876543210987654321n, 424242424242424242n];
		const b = [-3141592653589793238n, 2718281828459045235n, -1618033988749894848n];
		const c = [1111111111111111111n, 2222222222222222222n, -3333333333333333333n];
		const scalar = -7777777777777777n;

		const axb = crossProductBigIntIterative(a, b);
		const bxa = crossProductBigIntIterative(b, a);

		// Orthogonality: (a × b) · a = 0 and (a × b) · b = 0
		assert.strictEqual(dotBigInt(axb, a), 0n);
		assert.strictEqual(dotBigInt(axb, b), 0n);

		// Anticommutativity: a × b = -(b × a)
		assert.deepStrictEqual(axb, scaleBigInt(-1n, bxa));

		// Bilinearity / distributivity
		assert.deepStrictEqual(
			crossProductBigIntIterative(a, addBigInt(b, c)),
			addBigInt(axb, crossProductBigIntIterative(a, c)),
		);
		assert.deepStrictEqual(
			crossProductBigIntIterative(scaleBigInt(scalar, a), b),
			scaleBigInt(scalar, axb),
		);

		// Lagrange's identity: |a × b|^2 + (a · b)^2 = |a|^2 * |b|^2
		const normSqCross = dotBigInt(axb, axb);
		const dotAB = dotBigInt(a, b);
		assert.strictEqual(
			normSqCross + dotAB * dotAB,
			dotBigInt(a, a) * dotBigInt(b, b),
		);

		// BAC-CAB identity: a × (b × c) = b(a · c) - c(a · b)
		const bxc = crossProductBigIntIterative(b, c);
		const ax_bxc = crossProductBigIntIterative(a, bxc);
		const bacMinusCab = addBigInt(
			scaleBigInt(dotBigInt(a, c), b),
			scaleBigInt(-dotBigInt(a, b), c),
		);
		assert.deepStrictEqual(ax_bxc, bacMinusCab);

		// Jacobi identity: a × (b × c) + b × (c × a) + c × (a × b) = 0
		const cxa = crossProductBigIntIterative(c, a);
		const bx_cxa = crossProductBigIntIterative(b, cxa);
		const cx_axb = crossProductBigIntIterative(c, axb);
		assert.deepStrictEqual(
			addBigInt(addBigInt(ax_bxc, bx_cxa), cx_axb),
			[0n, 0n, 0n],
		);
	});
});
