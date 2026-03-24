/**
 * Memoization Utilities Test Suite
 */

import {
  LRUCache,
  memoize,
  memoizeWeak,
  memoizeAsync,
  createSelector,
  debounce,
  throttle
} from '../../src/lib/memoize.js';

const results = { passed: 0, failed: 0, tests: [] };

function assert(condition, testName) {
  if (condition) {
    results.passed++;
    results.tests.push({ name: testName, passed: true });
  } else {
    results.failed++;
    results.tests.push({ name: testName, passed: false });
  }
}

/**
 * Test LRU Cache
 */
function testLRUCache() {
  console.log('\n=== LRU Cache Tests ===');

  const cache = new LRUCache(3);

  // Basic set/get
  cache.set('a', 1);
  cache.set('b', 2);
  cache.set('c', 3);
  assert(cache.get('a') === 1, 'LRUCache get returns stored value');
  assert(cache.size === 3, 'LRUCache size is correct');

  // Eviction
  cache.set('d', 4); // Should evict 'b' (least recently used after 'a' was accessed)
  assert(cache.get('b') === undefined, 'LRUCache evicts oldest entry');
  assert(cache.get('d') === 4, 'LRUCache stores new entry');

  // Has
  assert(cache.has('a') === true, 'LRUCache has returns true for existing');
  assert(cache.has('b') === false, 'LRUCache has returns false for evicted');

  // Delete
  cache.delete('a');
  assert(cache.has('a') === false, 'LRUCache delete removes entry');

  // Clear
  cache.clear();
  assert(cache.size === 0, 'LRUCache clear empties cache');
}

/**
 * Test memoize function
 */
function testMemoize() {
  console.log('\n=== Memoize Tests ===');

  let callCount = 0;
  const expensiveFn = (a, b) => {
    callCount++;
    return a + b;
  };

  const memoized = memoize(expensiveFn);

  // First call
  assert(memoized(1, 2) === 3, 'Memoized function returns correct result');
  assert(callCount === 1, 'First call executes function');

  // Cached call
  assert(memoized(1, 2) === 3, 'Cached call returns correct result');
  assert(callCount === 1, 'Cached call does not execute function');

  // Different args
  assert(memoized(2, 3) === 5, 'Different args returns correct result');
  assert(callCount === 2, 'Different args executes function');

  // Clear cache
  memoized.clear();
  memoized(1, 2);
  assert(callCount === 3, 'After clear, function is executed again');
}

/**
 * Test memoize with TTL
 */
async function testMemoizeWithTTL() {
  console.log('\n=== Memoize with TTL Tests ===');

  let callCount = 0;
  const fn = (x) => {
    callCount++;
    return x * 2;
  };

  const memoized = memoize(fn, { ttl: 50 }); // 50ms TTL

  memoized(5);
  assert(callCount === 1, 'First call executes');

  memoized(5);
  assert(callCount === 1, 'Cached call within TTL');

  // Wait for TTL to expire
  await new Promise(r => setTimeout(r, 60));

  memoized(5);
  assert(callCount === 2, 'After TTL, function is executed again');
}

/**
 * Test memoizeWeak
 */
function testMemoizeWeak() {
  console.log('\n=== MemoizeWeak Tests ===');

  let callCount = 0;
  const fn = (obj) => {
    callCount++;
    return obj.value * 2;
  };

  const memoized = memoizeWeak(fn);
  const obj1 = { value: 5 };
  const obj2 = { value: 10 };

  assert(memoized(obj1) === 10, 'WeakMap memoized returns correct result');
  assert(callCount === 1, 'First call executes');

  assert(memoized(obj1) === 10, 'Same object returns cached');
  assert(callCount === 1, 'Same object uses cache');

  assert(memoized(obj2) === 20, 'Different object executes');
  assert(callCount === 2, 'Different object not cached');
}

/**
 * Test createSelector
 */
function testCreateSelector() {
  console.log('\n=== CreateSelector Tests ===');

  let computeCount = 0;
  const getItems = state => state.items;
  const getFilter = state => state.filter;

  const getFilteredItems = createSelector(
    getItems,
    getFilter,
    (items, filter) => {
      computeCount++;
      return items.filter(i => i.includes(filter));
    }
  );

  const state1 = { items: ['apple', 'banana', 'apricot'], filter: 'ap' };
  const result1 = getFilteredItems(state1);
  assert(result1.length === 2, 'Selector returns correct result');
  assert(computeCount === 1, 'Selector computes on first call');

  // Same state reference
  getFilteredItems(state1);
  assert(computeCount === 1, 'Same state uses cached result');

  // Changed filter
  const state2 = { items: ['apple', 'banana', 'apricot'], filter: 'ban' };
  const result2 = getFilteredItems(state2);
  assert(result2.length === 1, 'Changed input recomputes');
  assert(computeCount === 2, 'Changed input increments count');
}

/**
 * Run all tests
 */
async function runTests() {
  console.log('Starting Memoization Test Suite...\n');

  try { testLRUCache(); } catch (e) { console.error('LRUCache tests error:', e); }
  try { testMemoize(); } catch (e) { console.error('Memoize tests error:', e); }
  try { await testMemoizeWithTTL(); } catch (e) { console.error('TTL tests error:', e); }
  try { testMemoizeWeak(); } catch (e) { console.error('WeakMap tests error:', e); }
  try { testCreateSelector(); } catch (e) { console.error('Selector tests error:', e); }

  console.log('\n================================');
  console.log(`RESULTS: ${results.passed} passed, ${results.failed} failed`);
  console.log('================================\n');

  if (results.failed > 0) {
    console.log('Failed tests:');
    results.tests.filter(t => !t.passed).forEach(t => {
      console.log(`  ✗ ${t.name}`);
    });
  }

  return results;
}

export { runTests, results };
