import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { xorKleeneRecursive } from './xorKleeneRecursive.js';

/**
 * Independent Kleene K3 logic primitives for cross-checking:
 * A ⊕ B = (A ∨ B) ∧ ¬(A ∧ B)
 */
const K3_VALUES = [true, false, 'unknown'];

function independentNot(a) {
  if (a === 'unknown') return 'unknown';
  return !a;
}

function independentAnd(a, b) {
  if (a === false || b === false) return false;
  if (a === 'unknown' || b === 'unknown') return 'unknown';
  return true;
}

function independentOr(a, b) {
  if (a === true || b === true) return true;
  if (a === 'unknown' || b === 'unknown') return 'unknown';
  return false;
}

function independentXorK3(a, b) {
  return independentAnd(independentOr(a, b), independentNot(independentAnd(a, b)));
}

function independentArrayXorK3(values) {
  return values.reduce((acc, v) => independentXorK3(acc, v), false);
}

function independentPlainSetXorK3(sets) {
  const keys = new Set();
  for (const s of sets) {
    for (const k of Object.keys(s)) {
      keys.add(k);
    }
  }
  const result = {};
  for (const k of keys) {
    let acc = false;
    for (const s of sets) {
      const val = Object.hasOwn(s, k) ? s[k] : false;
      acc = independentXorK3(acc, val);
    }
    Object.defineProperty(result, k, {
      value: acc,
      enumerable: true,
      writable: true,
      configurable: true,
    });
  }
  return result;
}

describe('xorKleeneRecursive', () => {
  describe('Kleene K3 truth table (all 9 combinations)', () => {
    const expectedTable = [
      [true, true, false],
      [true, false, true],
      [true, 'unknown', 'unknown'],
      [false, true, true],
      [false, false, false],
      [false, 'unknown', 'unknown'],
      ['unknown', true, 'unknown'],
      ['unknown', false, 'unknown'],
      ['unknown', 'unknown', 'unknown'],
    ];

    for (const [a, b, expected] of expectedTable) {
      it(`xor(${String(a)}, ${String(b)}) === ${String(expected)}`, () => {
        assert.strictEqual(xorKleeneRecursive(a, b), expected);
      });
    }
  });

  describe('independent K3 algebraic cross-checks', () => {
    it('matches (a || b) && !(a && b) in Kleene K3 logic for all 9 pairs', () => {
      for (const a of K3_VALUES) {
        for (const b of K3_VALUES) {
          assert.strictEqual(
            xorKleeneRecursive(a, b),
            independentXorK3(a, b),
            `Mismatch for (${String(a)}, ${String(b)})`
          );
        }
      }
    });

    it('satisfies commutativity for all 9 pairs', () => {
      for (const a of K3_VALUES) {
        for (const b of K3_VALUES) {
          assert.strictEqual(
            xorKleeneRecursive(a, b),
            xorKleeneRecursive(b, a),
            `Commutativity failed for (${String(a)}, ${String(b)})`
          );
        }
      }
    });

    it('satisfies associativity for all 27 triples', () => {
      for (const a of K3_VALUES) {
        for (const b of K3_VALUES) {
          for (const c of K3_VALUES) {
            const leftGrouped = xorKleeneRecursive(xorKleeneRecursive(a, b), c);
            const rightGrouped = xorKleeneRecursive(a, xorKleeneRecursive(b, c));
            const nAry = xorKleeneRecursive(a, b, c);
            const expected = independentXorK3(independentXorK3(a, b), c);

            assert.strictEqual(leftGrouped, rightGrouped);
            assert.strictEqual(nAry, expected);
            assert.strictEqual(leftGrouped, expected);
          }
        }
      }
    });

    it('treats false as identity and unknown as absorbing element', () => {
      for (const a of K3_VALUES) {
        assert.strictEqual(xorKleeneRecursive(a, false), a);
        assert.strictEqual(xorKleeneRecursive(false, a), a);
        assert.strictEqual(xorKleeneRecursive(a, 'unknown'), 'unknown');
        assert.strictEqual(xorKleeneRecursive('unknown', a), 'unknown');
      }
    });
  });

  describe('n-ary scalar and array reduction', () => {
    it('reduces variadic scalar arguments accurately', () => {
      assert.strictEqual(xorKleeneRecursive(true, false, true), false);
      assert.strictEqual(xorKleeneRecursive(true, true, true), true);
      assert.strictEqual(xorKleeneRecursive(false, false, false, true), true);
      assert.strictEqual(xorKleeneRecursive(true, false, 'unknown', true), 'unknown');
    });

    it('reduces arrays of Kleene values across various sizes', () => {
      assert.strictEqual(xorKleeneRecursive([true, false]), true);
      assert.strictEqual(xorKleeneRecursive([true, true, false]), false);
      assert.strictEqual(xorKleeneRecursive([true, true, true, false, false]), true);
      assert.strictEqual(xorKleeneRecursive([false, false, false, false]), false);
      assert.strictEqual(xorKleeneRecursive([true, false, true, 'unknown', false]), 'unknown');
    });

    it('matches independent iterative reduction on larger arrays', () => {
      const sequences = [
        Array.from({ length: 101 }, (_, i) => i % 2 === 0),
        Array.from({ length: 64 }, (_, i) => i % 3 === 0),
        Array.from({ length: 127 }, (_, i) => (i === 73 ? 'unknown' : i % 5 === 0)),
        Array.from({ length: 50 }, (_, i) => (i === 0 ? 'unknown' : false)),
        Array.from({ length: 50 }, (_, i) => (i === 49 ? 'unknown' : true)),
      ];

      for (const seq of sequences) {
        assert.strictEqual(xorKleeneRecursive(seq), independentArrayXorK3(seq));
      }
    });
  });

  describe('partial sets (plain objects)', () => {
    it('computes Kleene K3 symmetric difference for overlapping and disjoint keys', () => {
      const setA = { a: true, b: true, c: false, d: 'unknown', onlyA: true, onlyAUnknown: 'unknown' };
      const setB = { a: true, b: false, c: false, d: true, onlyB: true, onlyBFalse: false };

      assert.deepStrictEqual(xorKleeneRecursive(setA, setB), {
        a: false,
        b: true,
        c: false,
        d: 'unknown',
        onlyA: true,
        onlyAUnknown: 'unknown',
        onlyB: true,
        onlyBFalse: false,
      });
    });

    it('computes n-ary symmetric difference across 3+ plain-object partial sets', () => {
      const s1 = { x: true, y: true, z: false, u: true };
      const s2 = { x: true, y: false, w: true, u: 'unknown' };
      const s3 = { x: true, y: true, w: true, v: false };
      const s4 = { z: true, v: true };

      const actual = xorKleeneRecursive(s1, s2, s3, s4);
      const expected = independentPlainSetXorK3([s1, s2, s3, s4]);
      assert.deepStrictEqual(actual, expected);
      assert.deepStrictEqual(xorKleeneRecursive([s1, s2, s3, s4]), expected);
    });

    it('satisfies commutativity and associativity on plain-object partial sets', () => {
      const a = { k1: true, k2: false, k3: 'unknown', k4: true };
      const b = { k1: false, k2: true, k3: false, k5: 'unknown' };
      const c = { k1: true, k4: true, k5: true, k6: false };

      assert.deepStrictEqual(xorKleeneRecursive(a, b), xorKleeneRecursive(b, a));
      assert.deepStrictEqual(
        xorKleeneRecursive(xorKleeneRecursive(a, b), c),
        xorKleeneRecursive(a, xorKleeneRecursive(b, c))
      );
      assert.deepStrictEqual(
        xorKleeneRecursive(a, b, c),
        independentPlainSetXorK3([a, b, c])
      );
    });

    it('supports null-prototype objects and special keys safely', () => {
      const a = Object.create(null);
      a.alpha = true;
      a.constructor = true;
      Object.defineProperty(a, '__proto__', {
        value: true,
        enumerable: true,
        writable: true,
        configurable: true,
      });

      const b = { alpha: true, toString: 'unknown' };
      const result = xorKleeneRecursive(a, b);

      assert.strictEqual(Object.getPrototypeOf(result), Object.prototype);
      assert.strictEqual(result.alpha, false);
      assert.strictEqual(result.constructor, true);
      assert.strictEqual(result.toString, 'unknown');
      assert.strictEqual(Object.hasOwn(result, '__proto__'), true);
      assert.strictEqual(Object.getOwnPropertyDescriptor(result, '__proto__').value, true);
    });

    it('does not mutate input plain objects', () => {
      const a = { x: true, y: 'unknown' };
      const b = { y: false, z: true };
      const res = xorKleeneRecursive(a, b);
      res.x = false;

      assert.deepStrictEqual(a, { x: true, y: 'unknown' });
      assert.deepStrictEqual(b, { y: false, z: true });
    });
  });

  describe('partial sets (Map)', () => {
    it('computes Kleene K3 symmetric difference for Maps with diverse key types', () => {
      const symKey = Symbol('sym');
      const objKey = { id: 1 };

      const mapA = new Map([
        ['a', true],
        [1, 'unknown'],
        [symKey, true],
        [objKey, false],
      ]);
      const mapB = new Map([
        ['a', true],
        [1, false],
        [symKey, false],
        [objKey, true],
        ['extra', 'unknown'],
      ]);

      const result = xorKleeneRecursive(mapA, mapB);
      assert.ok(result instanceof Map);
      assert.strictEqual(result.get('a'), false);
      assert.strictEqual(result.get(1), 'unknown');
      assert.strictEqual(result.get(symKey), true);
      assert.strictEqual(result.get(objKey), true);
      assert.strictEqual(result.get('extra'), 'unknown');
      assert.strictEqual(result.size, 5);
    });

    it('supports n-ary Maps and arrays of Maps with associativity', () => {
      const m1 = new Map([['a', true], ['b', 'unknown']]);
      const m2 = new Map([['a', false], ['c', true]]);
      const m3 = new Map([['a', true], ['b', true], ['c', true]]);

      const left = xorKleeneRecursive(xorKleeneRecursive(m1, m2), m3);
      const right = xorKleeneRecursive(m1, xorKleeneRecursive(m2, m3));
      const direct = xorKleeneRecursive(m1, m2, m3);
      const fromArray = xorKleeneRecursive([m1, m2, m3]);

      const expected = new Map([
        ['a', false],
        ['b', 'unknown'],
        ['c', false],
      ]);
      assert.deepStrictEqual(left, expected);
      assert.deepStrictEqual(right, expected);
      assert.deepStrictEqual(direct, expected);
      assert.deepStrictEqual(fromArray, expected);
    });

    it('clones single Map without mutating input', () => {
      const m = new Map([['k', true], ['u', 'unknown']]);
      const out = xorKleeneRecursive(m);
      assert.notStrictEqual(out, m);
      assert.deepStrictEqual(out, m);
      out.set('k', false);
      assert.strictEqual(m.get('k'), true);
    });
  });

  describe('edge cases', () => {
    it('handles single operands of all supported kinds', () => {
      assert.strictEqual(xorKleeneRecursive(true), true);
      assert.strictEqual(xorKleeneRecursive(false), false);
      assert.strictEqual(xorKleeneRecursive('unknown'), 'unknown');
      assert.strictEqual(xorKleeneRecursive([true]), true);
      assert.strictEqual(xorKleeneRecursive([false]), false);
      assert.strictEqual(xorKleeneRecursive(['unknown']), 'unknown');

      const singleObj = { a: true, b: false, c: 'unknown' };
      const outObj = xorKleeneRecursive(singleObj);
      assert.notStrictEqual(outObj, singleObj);
      assert.deepStrictEqual(outObj, singleObj);
    });

    it('handles empty array and empty partial sets', () => {
      assert.strictEqual(xorKleeneRecursive([]), false);
      assert.deepStrictEqual(xorKleeneRecursive({}), {});
      assert.deepStrictEqual(xorKleeneRecursive({}, {}), {});
      assert.deepStrictEqual(xorKleeneRecursive({}, { a: true, b: 'unknown' }), {
        a: true,
        b: 'unknown',
      });
      assert.deepStrictEqual(xorKleeneRecursive(new Map()), new Map());
      assert.deepStrictEqual(xorKleeneRecursive(new Map(), new Map()), new Map());
      assert.deepStrictEqual(
        xorKleeneRecursive(new Map(), new Map([['x', 'unknown']])),
        new Map([['x', 'unknown']])
      );
    });

    it('propagates unknown regardless of position in operands', () => {
      assert.strictEqual(xorKleeneRecursive('unknown', true, false, true), 'unknown');
      assert.strictEqual(xorKleeneRecursive(true, false, true, 'unknown'), 'unknown');
      assert.strictEqual(
        xorKleeneRecursive({ a: true }, { a: 'unknown' }, { a: true }).a,
        'unknown'
      );
    });
  });

  describe('input validation errors', () => {
    it('throws TypeError when called with no arguments', () => {
      assert.throws(() => xorKleeneRecursive(), TypeError);
    });

    it('throws TypeError for invalid scalar values', () => {
      const invalidValues = [
        null,
        undefined,
        0,
        1,
        NaN,
        '',
        'true',
        'false',
        'UNKNOWN',
        Symbol('x'),
        () => true,
        new Date(),
        new Set(),
        /regex/,
      ];

      for (const bad of invalidValues) {
        assert.throws(() => xorKleeneRecursive(bad), TypeError);
        assert.throws(() => xorKleeneRecursive(true, bad), TypeError);
        assert.throws(() => xorKleeneRecursive('unknown', bad), TypeError);
      }
    });

    it('throws TypeError for invalid array elements even after unknown', () => {
      assert.throws(() => xorKleeneRecursive(['unknown', 1]), TypeError);
      assert.throws(() => xorKleeneRecursive([true, null]), TypeError);
      assert.throws(() => xorKleeneRecursive([true, 'maybe']), TypeError);
      assert.throws(() => xorKleeneRecursive([new Set()]), TypeError);
    });

    it('throws TypeError for invalid values inside partial sets', () => {
      assert.throws(() => xorKleeneRecursive({ a: 1 }), TypeError);
      assert.throws(() => xorKleeneRecursive({ a: 'unknown' }, { b: null }), TypeError);
      assert.throws(() => xorKleeneRecursive(new Map([['a', 'yes']])), TypeError);
      assert.throws(
        () => xorKleeneRecursive(new Map([['a', true]]), new Map([['b', undefined]])),
        TypeError
      );
    });

    it('throws TypeError when mixing incompatible operand kinds', () => {
      assert.throws(() => xorKleeneRecursive(true, { a: true }), TypeError);
      assert.throws(() => xorKleeneRecursive({ a: true }, true), TypeError);
      assert.throws(() => xorKleeneRecursive({ a: true }, new Map([['a', true]])), TypeError);
      assert.throws(() => xorKleeneRecursive(new Map([['a', true]]), { a: true }), TypeError);
      assert.throws(() => xorKleeneRecursive([true], [false]), TypeError);
      assert.throws(() => xorKleeneRecursive([true, { a: true }]), TypeError);
      assert.throws(() => xorKleeneRecursive([{ a: true }, new Map([['a', true]])]), TypeError);

      class CustomSet {
        constructor() {
          this.a = true;
        }
      }
      assert.throws(() => xorKleeneRecursive(new CustomSet()), TypeError);
    });
  });
});
