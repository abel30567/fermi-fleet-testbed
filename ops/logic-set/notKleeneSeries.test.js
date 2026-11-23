import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { notKleeneSeries } from './notKleeneSeries.js';

describe('notKleeneSeries', () => {
  describe('scalar Kleene logic (K3)', () => {
    it('negates true, false, null, and "unknown"', () => {
      assert.strictEqual(notKleeneSeries(true), false);
      assert.strictEqual(notKleeneSeries(false), true);
      assert.strictEqual(notKleeneSeries(null), null);
      assert.strictEqual(notKleeneSeries('unknown'), 'unknown');
    });

    it('satisfies involution not(not(x)) === x for all K3 scalars', () => {
      for (const v of [true, false, null, 'unknown']) {
        assert.strictEqual(notKleeneSeries(notKleeneSeries(v)), v);
      }
    });
  });

  describe('partial sets', () => {
    it('negates Array partial sets without mutating input', () => {
      const input = [true, false, null, 'unknown', true];
      const snapshot = [...input];
      const out = notKleeneSeries(input);
      assert.deepStrictEqual(out, [false, true, null, 'unknown', false]);
      assert.deepStrictEqual(input, snapshot);
      assert.notStrictEqual(out, input);
    });

    it('negates Map partial sets preserving arbitrary key types and immutability', () => {
      const objKey = { id: 1 };
      const symKey = Symbol('k');
      const input = new Map([
        ['a', true],
        [42, false],
        [objKey, null],
        [symKey, 'unknown'],
      ]);
      const out = notKleeneSeries(input);
      assert.ok(out instanceof Map);
      assert.notStrictEqual(out, input);
      assert.strictEqual(out.get('a'), false);
      assert.strictEqual(out.get(42), true);
      assert.strictEqual(out.get(objKey), null);
      assert.strictEqual(out.get(symKey), 'unknown');
      // Input unchanged
      assert.strictEqual(input.get('a'), true);
      assert.strictEqual(input.get(42), false);
    });

    it('negates plain object characteristic partial sets without mutating input', () => {
      const input = { x: true, y: false, z: null, w: 'unknown' };
      const out = notKleeneSeries(input);
      assert.deepStrictEqual(out, { x: false, y: true, z: null, w: 'unknown' });
      assert.deepStrictEqual(input, { x: true, y: false, z: null, w: 'unknown' });
    });

    it('preserves null-prototype plain objects', () => {
      const input = Object.create(null);
      input.a = true;
      input.b = null;
      const out = notKleeneSeries(input);
      assert.strictEqual(Object.getPrototypeOf(out), null);
      assert.strictEqual(out.a, false);
      assert.strictEqual(out.b, null);
    });

    it('negates dual-set { include, exclude } partial sets by swapping extensions', () => {
      const input = {
        include: new Set(['a', 'b']),
        exclude: new Set(['c']),
      };
      const out = notKleeneSeries(input);
      assert.deepStrictEqual(out, {
        include: new Set(['c']),
        exclude: new Set(['a', 'b']),
      });
      // Mutating returned sets must not affect input
      out.include.add('z');
      assert.strictEqual(input.exclude.has('z'), false);
      assert.strictEqual(input.include.has('a'), true);
    });

    it('handles plain objects whose keys happen to be named include/exclude with boolean values', () => {
      const input = { include: true, exclude: false };
      assert.deepStrictEqual(notKleeneSeries(input), { include: false, exclude: true });
    });
  });

  describe('edge cases', () => {
    it('handles empty containers cleanly', () => {
      assert.deepStrictEqual(notKleeneSeries([]), []);
      assert.deepStrictEqual(notKleeneSeries(new Map()), new Map());
      assert.deepStrictEqual(notKleeneSeries({}), {});
      const nullProtoEmpty = Object.create(null);
      const outNullProto = notKleeneSeries(nullProtoEmpty);
      assert.strictEqual(Object.getPrototypeOf(outNullProto), null);
      assert.deepStrictEqual(Object.keys(outNullProto), []);
      assert.deepStrictEqual(
        notKleeneSeries({ include: new Set(), exclude: new Set() }),
        { include: new Set(), exclude: new Set() }
      );
    });

    it('handles dual partial sets containing NaN and -0/+0 cleanly', () => {
      const out = notKleeneSeries({
        include: new Set([NaN, 0]),
        exclude: new Set([1]),
      });
      assert.strictEqual(out.exclude.has(NaN), true);
      assert.strictEqual(out.exclude.has(0), true);
      assert.strictEqual(out.include.has(1), true);
    });

    it('handles large partial sets consistently', () => {
      const size = 1000;
      const values = [true, false, null, 'unknown'];
      const arr = Array.from({ length: size }, (_, i) => values[i % 4]);
      const negated = notKleeneSeries(arr);
      assert.strictEqual(negated.length, size);
      assert.deepStrictEqual(notKleeneSeries(negated), arr);
    });
  });

  describe('invalid inputs', () => {
    it('rejects unsupported primitives and non-plain objects', () => {
      const badInputs = [
        undefined,
        0,
        1,
        0.5,
        -1,
        NaN,
        '',
        'true',
        'false',
        'UNKNOWN',
        Symbol('s'),
        1n,
        () => true,
        new Date(),
        /regex/,
        new Set([true]),
        new Boolean(true),
      ];
      for (const bad of badInputs) {
        assert.throws(() => notKleeneSeries(bad), TypeError);
      }
    });

    it('rejects sparse arrays and arrays with invalid elements', () => {
      const sparse = [];
      sparse[2] = true;
      assert.throws(() => notKleeneSeries(sparse), TypeError);
      assert.throws(() => notKleeneSeries([true, 1]), TypeError);
      assert.throws(() => notKleeneSeries([undefined]), TypeError);
      assert.throws(() => notKleeneSeries([[true]]), TypeError);
    });

    it('rejects Maps and plain objects with invalid values or malformed dual-set shapes', () => {
      assert.throws(() => notKleeneSeries(new Map([['a', 1]])), TypeError);
      assert.throws(() => notKleeneSeries(new Map([['a', undefined]])), TypeError);
      assert.throws(() => notKleeneSeries({ a: 'true' }), TypeError);
      assert.throws(() => notKleeneSeries({ a: 0 }), TypeError);
      assert.throws(() => notKleeneSeries({ include: new Set(['a']) }), TypeError);
      assert.throws(
        () => notKleeneSeries({ include: new Set(['a']), exclude: ['b'] }),
        TypeError
      );
      assert.throws(
        () => notKleeneSeries({ include: new Set(['a']), exclude: new Set(['b']), extra: true }),
        TypeError
      );
      assert.throws(() => notKleeneSeries({ [Symbol('k')]: true }), TypeError);
    });

    it('rejects inconsistent dual partial sets with overlapping include and exclude', () => {
      assert.throws(
        () => notKleeneSeries({ include: new Set(['a', 'b']), exclude: new Set(['b', 'c']) }),
        RangeError
      );
      assert.throws(
        () => notKleeneSeries({ include: new Set([NaN]), exclude: new Set([NaN]) }),
        RangeError
      );
    });
  });

  describe('independent mathematical cross-checks', () => {
    it('matches balanced-ternary Lagrange interpolation P(v) = v(v-1)/2 - v(v+1)/2', () => {
      const toBalanced = (k) => (k === true ? 1 : k === false ? -1 : 0);
      const fromBalanced = (v) => (v === 1 ? true : v === -1 ? false : null);
      const lagrangeNot = (v) => (v * (v - 1)) / 2 - (v * (v + 1)) / 2;

      for (const k of [true, false, null]) {
        const expected = fromBalanced(lagrangeNot(toBalanced(k)));
        assert.strictEqual(notKleeneSeries(k), expected);
      }
    });

    it('satisfies Strong Kleene De Morgan laws over all 9 pairs in K3 x K3', () => {
      const rank = (v) => (v === false ? 0 : v === null ? 1 : 2);
      const unrank = (r) => (r === 0 ? false : r === 1 ? null : true);
      const kleeneAnd = (a, b) => unrank(Math.min(rank(a), rank(b)));
      const kleeneOr = (a, b) => unrank(Math.max(rank(a), rank(b)));

      const domain = [false, null, true];
      for (const a of domain) {
        for (const b of domain) {
          assert.strictEqual(
            notKleeneSeries(kleeneAnd(a, b)),
            kleeneOr(notKleeneSeries(a), notKleeneSeries(b))
          );
          assert.strictEqual(
            notKleeneSeries(kleeneOr(a, b)),
            kleeneAnd(notKleeneSeries(a), notKleeneSeries(b))
          );
        }
      }
    });

    it('is monotonic in the Kleene information ordering (unknown <= true, unknown <= false)', () => {
      const infoLeq = (a, b) => a === null || a === b;
      const domain = [false, null, true];
      for (const a of domain) {
        for (const b of domain) {
          if (infoLeq(a, b)) {
            assert.strictEqual(infoLeq(notKleeneSeries(a), notKleeneSeries(b)), true);
          }
        }
      }
    });

    it('commutes with the isomorphism between dual partial sets and characteristic Maps', () => {
      const universe = ['u1', 'u2', 'u3', 'u4', 'u5'];
      const dual = {
        include: new Set(['u1', 'u2']),
        exclude: new Set(['u3']),
        // u4 and u5 have unknown membership
      };

      const toCharMap = (d) =>
        new Map(
          universe.map((u) => [u, d.include.has(u) ? true : d.exclude.has(u) ? false : null])
        );

      const negatedViaDual = toCharMap(notKleeneSeries(dual));
      const negatedViaMap = notKleeneSeries(toCharMap(dual));

      assert.deepStrictEqual(negatedViaDual, negatedViaMap);
      assert.deepStrictEqual(notKleeneSeries(notKleeneSeries(dual)), dual);
    });
  });
});
