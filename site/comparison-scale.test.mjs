import test from 'node:test';
import assert from 'node:assert/strict';
import { presidentialVoteDeviation, formatVoteDeviation, deviationFill } from './comparison-scale.js';

test('presidential vote equality is zero and counts below/above retain their signs', () => {
  for (const [current, historical, expected] of [[80, 100, -20], [100, 100, 0], [120, 100, 20], [0, 100, -100], [300, 100, 200]]) {
    assert.equal(presidentialVoteDeviation(100 * current / historical), expected);
  }
  for (const missing of [null, undefined, NaN, Infinity, -1]) assert.equal(presidentialVoteDeviation(missing), null);
});

test('signed deviation labels distinguish above and below without displaying negative zero', () => {
  for (const [value, expected] of [[-20, '−20.0%'], [0, '0.0%'], [20, '+20.0%'], [-0, '0.0%'], [-0.01, '0.0%'], [0.01, '0.0%'], [200, '+200.0%']]) assert.equal(formatVoteDeviation(value), expected);
  for (const missing of [null, undefined, NaN, Infinity]) assert.equal(formatVoteDeviation(missing), '');
});

test('below/equal/above map colors diverge around zero and saturate without changing numeric values', () => {
  assert.equal(deviationFill(0), 'rgb(245,243,240)');
  assert.equal(deviationFill(-100), 'rgb(188,126,65)');
  assert.equal(deviationFill(100), 'rgb(111,76,154)');
  assert.notEqual(deviationFill(-20), deviationFill(20));
  assert.notEqual(deviationFill(-20), deviationFill(0));
  assert.notEqual(deviationFill(20), deviationFill(0));
  assert.equal(deviationFill(200), deviationFill(100));
  assert.equal(presidentialVoteDeviation(300), 200);
  assert.equal(deviationFill(null), null);
});
