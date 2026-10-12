// _harness — a zero-dependency assert harness for terminal-engine proofs.

let passed = 0;

export function ok(condition, label) {
  if (!condition) {
    console.error(`  ✗ ${label}`);
    process.exit(1);
  }
  passed += 1;
  console.log(`  ✓ ${label}`);
}

export function eq(actual, expected, label) {
  const observed = JSON.stringify(actual);
  const wanted = JSON.stringify(expected);
  if (observed !== wanted) {
    console.error(`  ✗ ${label}\n      expected ${wanted}\n      got      ${observed}`);
    process.exit(1);
  }
  passed += 1;
  console.log(`  ✓ ${label}`);
}

export function done(name) {
  console.log(`${name}: ${passed} assertion(s) passed`);
}
