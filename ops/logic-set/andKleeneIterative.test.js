import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { andKleeneIterative } from './andKleeneIterative.js';

const VALUES = [false, 'unknown', true];

/**
 * Independent reference oracle using numeric lattice min isomorphism:
 * false -> 0, 'unknown' -> 1, true -> 2.
 */
function oracleMin(values) {
	const toNum = (v) => (v === false ? 0 : v === 'unknown' ? 1 : 2);
	const fromNum = (n) => (n === 0 ? false : n === 1 ? 'unknown' : true);
	let m = 2;
	for (const v of values) {
		const n = toNum(v);
		if (n < m) m = n;
	}
	return fromNum(m);
}

/**
 * Independent Kleene NOT and OR for De Morgan's law cross-checks.
 */
function kleeneNot(v) {
	if (v === true) return false;
	if (v === false) return true;
	return 'unknown';
}

function kleeneOr(a, b) {
	if (a === true || b === true) return true;
	if (a === 'unknown' || b === 'unknown') return 'unknown';
	return false;
}

/**
 * Independent partial-set intersection oracle using explicit positive (A+) and negative (A-)
 * extensions: (∩ A_i)+ = ∩ (A_i+) and (∩ A_i)- = ∪ (A_i-).
 */
function oraclePartialSetIntersection(sets) {
	const universe = new Set();
	const positives = [];
	const negatives = [];

	for (const s of sets) {
		const pos = new Set();
		const neg = new Set();
		const entries = s instanceof Map ? s.entries() : Object.entries(s);
		for (const [k, v] of entries) {
			universe.add(k);
			if (v === true) pos.add(k);
			else if (v === false) neg.add(k);
		}
		positives.push(pos);
		negatives.push(neg);
	}

	const result = sets[0] instanceof Map ? new Map() : {};
	for (const k of universe) {
		const inAllPos = positives.every((p) => p.has(k));
		const inAnyNeg = negatives.some((n) => n.has(k));
		const val = inAnyNeg ? false : inAllPos ? true : 'unknown';
		if (result instanceof Map) {
			result.set(k, val);
		} else {
			result[k] = val;
		}
	}
	return result;
}

describe('andKleeneIterative', () => {
	describe('scalar three-valued Kleene logic', () => {
		it('matches the complete 3x3 Strong Kleene truth table', () => {
			assert.equal(andKleeneIterative(true, true), true);
			assert.equal(andKleeneIterative(true, 'unknown'), 'unknown');
			assert.equal(andKleeneIterative(true, false), false);

			assert.equal(andKleeneIterative('unknown', true), 'unknown');
			assert.equal(andKleeneIterative('unknown', 'unknown'), 'unknown');
			assert.equal(andKleeneIterative('unknown', false), false);

			assert.equal(andKleeneIterative(false, true), false);
			assert.equal(andKleeneIterative(false, 'unknown'), false);
			assert.equal(andKleeneIterative(false, false), false);
		});

		it('handles unary, variadic, and array inputs including empty array identity', () => {
			assert.equal(andKleeneIterative([]), true);
			assert.equal(andKleeneIterative(true), true);
			assert.equal(andKleeneIterative(false), false);
			assert.equal(andKleeneIterative('unknown'), 'unknown');
			assert.equal(andKleeneIterative([true]), true);
			assert.equal(andKleeneIterative([false]), false);
			assert.equal(andKleeneIterative(['unknown']), 'unknown');

			assert.equal(andKleeneIterative(true, true, true, true), true);
			assert.equal(andKleeneIterative(true, true, 'unknown', true), 'unknown');
			assert.equal(andKleeneIterative(true, 'unknown', false, true), false);
			assert.equal(andKleeneIterative([true, 'unknown', true, 'unknown']), 'unknown');
			assert.equal(andKleeneIterative([true, 'unknown', false, 'unknown']), false);
		});

		it('handles large iterative arrays without recursion stack overflow', () => {
			const allTrue = new Array(50_000).fill(true);
			assert.equal(andKleeneIterative(allTrue), true);

			const withUnknownAtEnd = new Array(50_000).fill(true);
			withUnknownAtEnd[49_999] = 'unknown';
			assert.equal(andKleeneIterative(withUnknownAtEnd), 'unknown');

			const withFalseAtEnd = new Array(50_000).fill('unknown');
			withFalseAtEnd[49_999] = false;
			assert.equal(andKleeneIterative(withFalseAtEnd), false);
		});
	});

	describe('partial sets (plain objects and Maps)', () => {
		it('computes pointwise Kleene AND over plain-object partial sets with open-world missing keys', () => {
			const a = { x: true, y: true, z: false, onlyA_t: true, onlyA_f: false, onlyA_u: 'unknown' };
			const b = { x: true, y: 'unknown', z: 'unknown', onlyB_t: true, onlyB_f: false };

			const out = andKleeneIterative(a, b);
			assert.deepEqual(out, {
				x: true,
				y: 'unknown',
				z: false,
				onlyA_t: 'unknown',
				onlyA_f: false,
				onlyA_u: 'unknown',
				onlyB_t: 'unknown',
				onlyB_f: false,
			});
		});

		it('supports variadic and array forms for plain-object partial sets without mutating inputs', () => {
			const s1 = { a: true, b: true, c: 'unknown' };
			const s2 = { a: true, b: 'unknown', c: 'unknown' };
			const s3 = { a: true, b: false, d: false };

			const expected = { a: true, b: false, c: 'unknown', d: false };
			assert.deepEqual(andKleeneIterative(s1, s2, s3), expected);
			assert.deepEqual(andKleeneIterative([s1, s2, s3]), expected);

			// Inputs remain unmutated
			assert.deepEqual(s1, { a: true, b: true, c: 'unknown' });
			assert.deepEqual(s2, { a: true, b: 'unknown', c: 'unknown' });
			assert.deepEqual(s3, { a: true, b: false, d: false });
		});

		it('handles edge cases for plain objects (empty objects, null-prototype objects, single set)', () => {
			assert.deepEqual(andKleeneIterative({}, {}), {});
			assert.deepEqual(andKleeneIterative({ a: true, b: false, c: 'unknown' }), {
				a: true,
				b: false,
				c: 'unknown',
			});

			const nullProto = Object.create(null);
			nullProto.k1 = true;
			nullProto.k2 = false;
			const plain = { k1: 'unknown', k3: true };
			assert.deepEqual(andKleeneIterative(nullProto, plain), {
				k1: 'unknown',
				k2: false,
				k3: 'unknown',
			});
		});

		it('computes pointwise Kleene AND over Map partial sets including non-string keys', () => {
			const objKey = { id: 1 };
			const m1 = new Map([
				[1, true],
				[2, 'unknown'],
				[objKey, true],
				['only1', false],
			]);
			const m2 = new Map([
				[1, true],
				[2, false],
				[objKey, 'unknown'],
				['only2', true],
			]);

			const out = andKleeneIterative(m1, m2);
			assert.ok(out instanceof Map);
			assert.deepEqual(
				out,
				new Map([
					[1, true],
					[2, false],
					[objKey, 'unknown'],
					['only1', false],
					['only2', 'unknown'],
				]),
			);
			// Also works in array form and does not mutate input Maps
			assert.deepEqual(andKleeneIterative([m1, m2]), out);
			assert.equal(m1.size, 4);
			assert.equal(m2.size, 4);
		});

		it('handles empty Maps and single Map input', () => {
			assert.deepEqual(andKleeneIterative(new Map(), new Map()), new Map());
			const single = new Map([
				['a', true],
				['b', 'unknown'],
			]);
			const res = andKleeneIterative(single);
			assert.deepEqual(res, single);
			assert.notEqual(res, single);
		});
	});

	describe('independent cross-checks and algebraic laws', () => {
		it('cross-checks all 2-ary, 3-ary, and 4-ary combinations against numeric lattice min oracle', () => {
			for (const a of VALUES) {
				for (const b of VALUES) {
					assert.equal(andKleeneIterative(a, b), oracleMin([a, b]));
					for (const c of VALUES) {
						assert.equal(andKleeneIterative(a, b, c), oracleMin([a, b, c]));
						for (const d of VALUES) {
							assert.equal(andKleeneIterative([a, b, c, d]), oracleMin([a, b, c, d]));
						}
					}
				}
			}
		});

		it('cross-checks De Morgan law a ∧ b === ¬(¬a ∨ ¬b) exhaustively', () => {
			for (const a of VALUES) {
				for (const b of VALUES) {
					assert.equal(andKleeneIterative(a, b), kleeneNot(kleeneOr(kleeneNot(a), kleeneNot(b))));
				}
			}
		});

		it('satisfies commutativity, associativity, idempotence, identity, and annihilation', () => {
			for (const a of VALUES) {
				assert.equal(andKleeneIterative(a, a), a);
				assert.equal(andKleeneIterative(a, true), a);
				assert.equal(andKleeneIterative(true, a), a);
				assert.equal(andKleeneIterative(a, false), false);
				assert.equal(andKleeneIterative(false, a), false);
				for (const b of VALUES) {
					assert.equal(andKleeneIterative(a, b), andKleeneIterative(b, a));
					for (const c of VALUES) {
						assert.equal(
							andKleeneIterative(andKleeneIterative(a, b), c),
							andKleeneIterative(a, andKleeneIterative(b, c)),
						);
					}
				}
			}
		});

		it('cross-checks partial-set intersection against positive/negative extension oracle', () => {
			// Enumerate partial sets over a 2-element universe {p, q} where each key may be
			// absent, false, 'unknown', or true (4 states per key => 16 partial sets).
			const states = [undefined, false, 'unknown', true];
			const allSets = [];
			for (const p of states) {
				for (const q of states) {
					const obj = {};
					if (p !== undefined) obj.p = p;
					if (q !== undefined) obj.q = q;
					allSets.push(obj);
				}
			}

			for (const s1 of allSets) {
				for (const s2 of allSets) {
					assert.deepEqual(andKleeneIterative(s1, s2), oraclePartialSetIntersection([s1, s2]));

					const m1 = new Map(Object.entries(s1));
					const m2 = new Map(Object.entries(s2));
					assert.deepEqual(andKleeneIterative(m1, m2), oraclePartialSetIntersection([m1, m2]));
				}
			}
		});
	});

	describe('input validation', () => {
		it('throws TypeError on missing or invalid scalar arguments', () => {
			assert.throws(() => andKleeneIterative(), TypeError);
			assert.throws(() => andKleeneIterative(undefined), TypeError);
			assert.throws(() => andKleeneIterative(null), TypeError);
			assert.throws(() => andKleeneIterative(1), TypeError);
			assert.throws(() => andKleeneIterative(0), TypeError);
			assert.throws(() => andKleeneIterative('true'), TypeError);
			assert.throws(() => andKleeneIterative('false'), TypeError);
			assert.throws(() => andKleeneIterative(new Set([true])), TypeError);
			assert.throws(() => andKleeneIterative(new Date()), TypeError);
			assert.throws(() => andKleeneIterative([[true]]), TypeError);
		});

		it('validates all operands even after encountering false', () => {
			assert.throws(() => andKleeneIterative(false, 42), TypeError);
			assert.throws(() => andKleeneIterative([false, null]), TypeError);
			assert.throws(() => andKleeneIterative({ a: false }, { a: 123 }), TypeError);
			assert.throws(
				() => andKleeneIterative(new Map([['a', false]]), new Map([['a', undefined]])),
				TypeError,
			);
		});

		it('throws TypeError on mixed operand kinds or invalid partial set values', () => {
			assert.throws(() => andKleeneIterative(true, { a: true }), TypeError);
			assert.throws(() => andKleeneIterative({ a: true }, true), TypeError);
			assert.throws(() => andKleeneIterative({ a: true }, new Map([['a', true]])), TypeError);
			assert.throws(() => andKleeneIterative(new Map([['a', true]]), { a: true }), TypeError);
			assert.throws(() => andKleeneIterative({ a: 'maybe' }), TypeError);
			assert.throws(() => andKleeneIterative(new Map([['a', 0]])), TypeError);
		});
	});
});
