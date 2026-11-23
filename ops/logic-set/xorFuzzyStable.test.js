import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { xorFuzzyStable } from './xorFuzzyStable.js';

/**
 * Independent exact arbitrary-precision dyadic rational representation of any
 * IEEE-754 binary64 number in [0, 1], used as an oracle for Zadeh XOR.
 *
 * Represents x = num / 2^shift with BigInt num >= 0 and integer shift >= 0.
 */
function float64ToDyadic(x) {
	if (x === 0) {
		return { num: 0n, shift: 0 };
	}
	if (x === 1) {
		return { num: 1n, shift: 0 };
	}
	const buf = new ArrayBuffer(8);
	const view = new DataView(buf);
	view.setFloat64(0, x, false);
	const bits = view.getBigUint64(0, false);
	const expBits = Number((bits >> 52n) & 0x7ffn);
	const fracBits = bits & 0x000fffffffffffffn;

	let mantissa;
	let exp;
	if (expBits === 0) {
		// Subnormal: fracBits * 2^(-1074)
		mantissa = fracBits;
		exp = -1074;
	} else {
		// Normal: (2^52 + fracBits) * 2^(expBits - 1023 - 52)
		mantissa = (1n << 52n) | fracBits;
		exp = expBits - 1075;
	}
	// Since x in (0, 1), exp < 0.
	return { num: mantissa, shift: -exp };
}

function dyadicCmp(p, q) {
	const maxShift = Math.max(p.shift, q.shift);
	const pn = p.num << BigInt(maxShift - p.shift);
	const qn = q.num << BigInt(maxShift - q.shift);
	return pn < qn ? -1 : pn > qn ? 1 : 0;
}

function dyadicMin(p, q) {
	return dyadicCmp(p, q) <= 0 ? p : q;
}

function dyadicMax(p, q) {
	return dyadicCmp(p, q) >= 0 ? p : q;
}

function dyadicNot(p) {
	return { num: (1n << BigInt(p.shift)) - p.num, shift: p.shift };
}

/**
 * Independent exact Zadeh XOR via DNF: max(min(a, 1 - b), min(1 - a, b)).
 */
function exactZadehXorDNF(a, b) {
	return dyadicMax(dyadicMin(a, dyadicNot(b)), dyadicMin(dyadicNot(a), b));
}

/**
 * Independent exact Zadeh XOR via CNF: min(max(a, b), 1 - min(a, b)).
 */
function exactZadehXorCNF(a, b) {
	return dyadicMin(dyadicMax(a, b), dyadicNot(dyadicMin(a, b)));
}

/**
 * Absolute difference |got - exact| as a float64 upper bound, compared against
 * 0.5 ulp at got.
 */
function assertWithinHalfUlp(got, exactDyadic) {
	const gotDyadic = float64ToDyadic(got);
	const maxShift = Math.max(gotDyadic.shift, exactDyadic.shift);
	const gn = gotDyadic.num << BigInt(maxShift - gotDyadic.shift);
	const en = exactDyadic.num << BigInt(maxShift - exactDyadic.shift);
	const diffNum = gn >= en ? gn - en : en - gn;

	if (diffNum === 0n) {
		return;
	}

	// Compute 0.5 ulp of got in [0, 1]:
	// For got in [0.5, 1], ulp = 2^-53, so 0.5 ulp = 2^-54.
	// More generally, halfUlp = 2^(floor(log2(got)) - 53) for normal numbers.
	assert.ok(got > 0, `expected exact 0, got diff ${diffNum}/2^${maxShift}`);
	const exp = Math.floor(Math.log2(got));
	const halfUlpShift = Math.max(54, 53 - exp);
	const cmpShift = Math.max(maxShift, halfUlpShift);
	const lhs = diffNum << BigInt(cmpShift - maxShift);
	const rhs = 1n << BigInt(cmpShift - halfUlpShift);
	assert.ok(
		lhs <= rhs,
		`result ${got} deviates from exact rational by more than 0.5 ulp`
	);
}

describe('xorFuzzyStable', () => {
	it('matches the crisp Boolean XOR truth table', () => {
		assert.equal(xorFuzzyStable(0, 0), 0);
		assert.equal(xorFuzzyStable(0, 1), 1);
		assert.equal(xorFuzzyStable(1, 0), 1);
		assert.equal(xorFuzzyStable(1, 1), 0);
	});

	it('computes standard fuzzy Zadeh XOR values accurately', () => {
		assert.equal(xorFuzzyStable(0.2, 0.7), 0.7);
		assert.equal(xorFuzzyStable(0.3, 0.8), 0.7);
		assert.equal(xorFuzzyStable(0.2, 0.4), 0.4);
		assert.equal(xorFuzzyStable(0.7, 0.9), 0.30000000000000004);
		assert.equal(xorFuzzyStable(0.5, 0.2), 0.5);
		assert.equal(xorFuzzyStable(0.5, 0.9), 0.5);
		assert.equal(xorFuzzyStable(0.5, 0.5), 0.5);
	});

	it('satisfies algebraic identities of Zadeh XOR', () => {
		const samples = [0, 0.1, 0.25, 0.49, 0.5, 0.51, 0.75, 0.9, 1];
		for (const a of samples) {
			// Identity with 0
			assert.equal(xorFuzzyStable(a, 0), a);
			assert.equal(xorFuzzyStable(0, a), a);
			// Complement with 1
			assert.equal(xorFuzzyStable(a, 1), 1 - a);
			// Absorbing fixed point at 0.5
			assert.equal(xorFuzzyStable(a, 0.5), 0.5);
			// Self-XOR equals min(a, 1 - a)
			assert.equal(xorFuzzyStable(a, a), Math.min(a, 1 - a));
			for (const b of samples) {
				// Commutativity
				assert.equal(xorFuzzyStable(a, b), xorFuzzyStable(b, a));
				// Complement invariance: XOR(1 - a, 1 - b) === XOR(a, b)
				const lhs = xorFuzzyStable(1 - a, 1 - b);
				const rhs = xorFuzzyStable(a, b);
				assert.ok(Math.abs(lhs - rhs) <= Number.EPSILON);
			}
		}
	});

	it('avoids catastrophic cancellation in n-ary chains near 0 and 1', () => {
		// Naive sequential evaluation: xor(xor(1e-20, 1), 1) -> xor(1, 1) -> 0
		assert.equal(xorFuzzyStable(1e-20, 1, 1), 1e-20);
		assert.equal(xorFuzzyStable(Number.MIN_VALUE, 1, 1), Number.MIN_VALUE);
		assert.equal(xorFuzzyStable(Number.MIN_VALUE, 1, 1, 1, 1), Number.MIN_VALUE);
		assert.equal(xorFuzzyStable(1, 1e-300, 1, 0), 1e-300);

		// Values very close to 1 (Sterbenz exact)
		const nearOneA = 1 - Number.EPSILON / 2;
		const nearOneB = 1 - Number.EPSILON;
		assert.equal(xorFuzzyStable(nearOneA, nearOneB), Number.EPSILON);
		assert.equal(xorFuzzyStable(nearOneA, nearOneB, 1e-30), Number.EPSILON);

		// Negative zero normalization
		assert.ok(Object.is(xorFuzzyStable(-0, -0), 0));
		assert.ok(Object.is(xorFuzzyStable(-0, 0), 0));
		assert.ok(Object.is(xorFuzzyStable(1, 1), 0));
	});

	it('cross-checks binary and n-ary outputs against an independent exact BigInt dyadic oracle', () => {
		const edgeValues = [
			0,
			Number.MIN_VALUE,
			1e-300,
			1e-20,
			2 ** -55,
			2 ** -54,
			3 * 2 ** -54,
			2 ** -53,
			0.25,
			0.5 - 2 ** -53,
			0.5 - 2 ** -54,
			0.5,
			0.5 + 2 ** -53,
			0.75,
			1 - Number.EPSILON,
			1 - Number.EPSILON / 2,
			1,
		];

		// Pairwise exhaustive cross-check against both DNF and CNF exact oracles
		for (const a of edgeValues) {
			const da = float64ToDyadic(a);
			for (const b of edgeValues) {
				const db = float64ToDyadic(b);
				const exactDNF = exactZadehXorDNF(da, db);
				const exactCNF = exactZadehXorCNF(da, db);
				assert.equal(dyadicCmp(exactDNF, exactCNF), 0);

				const got = xorFuzzyStable(a, b);
				assert.ok(got >= 0 && got <= 1);
				assertWithinHalfUlp(got, exactDNF);
			}
		}

		// Deterministic PRNG n-ary cross-check (3 to 7 operands)
		let seed = 0x5eed1234;
		const nextRand = () => {
			seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
			return seed / 0x100000000;
		};

		for (let trial = 0; trial < 200; trial++) {
			const count = 2 + (trial % 6);
			const xs = [];
			for (let i = 0; i < count; i++) {
				// Mix random floats with extreme edge values
				xs.push(
					i === 0 && trial % 3 === 0
						? edgeValues[trial % edgeValues.length]
						: nextRand()
				);
			}
			const got = xorFuzzyStable(...xs);
			let exact = float64ToDyadic(xs[0]);
			for (let i = 1; i < xs.length; i++) {
				exact = exactZadehXorDNF(exact, float64ToDyadic(xs[i]));
			}
			assertWithinHalfUlp(got, exact);
		}
	});

	it('supports elementwise fuzzy sets as Arrays and TypedArrays', () => {
		assert.deepEqual(
			xorFuzzyStable([0, 0.2, 0.5, 0.8, 1], [1, 0.7, 0.1, 0.9, 1]),
			[1, 0.7, 0.5, 1 - 0.8, 0]
		);

		assert.deepEqual(xorFuzzyStable([], []), []);

		// N-ary arrays
		assert.deepEqual(
			xorFuzzyStable([1e-20, 0.3], [1, 0.7], [1, 0.8]),
			[1e-20, 1 - 0.7]
		);

		// TypedArrays return Float64Array
		const ta = new Float64Array([0, 0.25, 0.75, 1]);
		const tb = new Float64Array([0, 0.75, 0.75, 0]);
		const res = xorFuzzyStable(ta, tb);
		assert.ok(res instanceof Float64Array);
		assert.deepEqual(Array.from(res), [0, 0.75, 0.25, 1]);

		// Mixed Array and TypedArray returns Array
		const mixed = xorFuzzyStable([0.2, 0.8], new Float64Array([0.4, 0.9]));
		assert.ok(Array.isArray(mixed));
		assert.deepEqual(mixed, [0.4, 1 - 0.8]);
	});

	it('supports fuzzy sets as plain objects and Maps with implicit 0 for missing keys', () => {
		const setA = { a: 0.8, b: 0.3, c: 1 };
		const setB = { b: 0.6, c: 1, d: 0.9 };
		assert.deepEqual(xorFuzzyStable(setA, setB), {
			a: 0.8,
			b: 0.6,
			c: 0,
			d: 0.9,
		});

		// Null-prototype objects and n-ary sets
		const nullProto = Object.assign(Object.create(null), { x: 1e-20 });
		assert.deepEqual(xorFuzzyStable(nullProto, { x: 1 }, { x: 1 }), { x: 1e-20 });

		// Maps
		const mapA = new Map([
			['x', 0.2],
			['y', 0.9],
		]);
		const mapB = new Map([
			['y', 0.8],
			['z', 0.4],
		]);
		const mapRes = xorFuzzyStable(mapA, mapB);
		assert.ok(mapRes instanceof Map);
		assert.deepEqual(Array.from(mapRes.entries()), [
			['x', 0.2],
			['y', 1 - 0.8],
			['z', 0.4],
		]);
	});

	it('validates all inputs strictly and rejects invalid arguments', () => {
		// Arity errors
		assert.throws(() => xorFuzzyStable(), TypeError);
		assert.throws(() => xorFuzzyStable(0.5), TypeError);

		// Range and type errors for scalars
		assert.throws(() => xorFuzzyStable(-0.01, 0.5), RangeError);
		assert.throws(() => xorFuzzyStable(0.5, 1.01), RangeError);
		assert.throws(() => xorFuzzyStable(NaN, 0.5), RangeError);
		assert.throws(() => xorFuzzyStable(0.5, Infinity), RangeError);
		assert.throws(() => xorFuzzyStable(0.5, -Infinity), RangeError);
		// Must still validate operands that appear after 0.5
		assert.throws(() => xorFuzzyStable(0.5, 2), RangeError);
		assert.throws(() => xorFuzzyStable(0.5, '0.5'), TypeError);

		// Unsupported or mismatched types
		assert.throws(() => xorFuzzyStable('0.5', '0.5'), TypeError);
		assert.throws(() => xorFuzzyStable(null, null), TypeError);
		assert.throws(() => xorFuzzyStable(0.5, [0.5]), TypeError);
		assert.throws(() => xorFuzzyStable([0.5], { a: 0.5 }), TypeError);
		assert.throws(() => xorFuzzyStable({ a: 0.5 }, new Map([['a', 0.5]])), TypeError);
		assert.throws(() => xorFuzzyStable(new Set([0.5]), new Set([0.5])), TypeError);
		assert.throws(
			() => xorFuzzyStable(new BigInt64Array([0n]), new BigInt64Array([1n])),
			TypeError
		);

		// Sequence length mismatch and invalid element
		assert.throws(() => xorFuzzyStable([0.1, 0.2], [0.1]), RangeError);
		assert.throws(() => xorFuzzyStable([0.5, 0.2], [0.5, -1]), RangeError);

		// Invalid values inside objects and Maps
		assert.throws(() => xorFuzzyStable({ a: 0.5 }, { a: 1.5 }), RangeError);
		assert.throws(
			() => xorFuzzyStable(new Map([['a', 0.5]]), new Map([['a', NaN]])),
			RangeError
		);
	});
});
