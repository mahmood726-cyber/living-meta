// Debug trim-and-fill for BCG

// BCG data (exact from metafor)
const bcgStudies = [
  { yi: -0.8893113339, vi: 0.3255847650 },
  { yi: -1.5853886572, vi: 0.1945811214 },
  { yi: -1.3480731483, vi: 0.4153679654 },
  { yi: -1.4415511900, vi: 0.0200100319 },
  { yi: -0.2175473222, vi: 0.0512101722 },
  { yi: -0.7861155858, vi: 0.0069056185 },
  { yi: -1.6208982236, vi: 0.2230172476 },
  { yi: 0.0119523335, vi: 0.0039615793 },
  { yi: -0.4694176487, vi: 0.0564342105 },
  { yi: -1.3713448035, vi: 0.0730247936 },
  { yi: -0.3393588283, vi: 0.0124122140 },
  { yi: 0.4459134006, vi: 0.5325058452 },
  { yi: -0.0173139482, vi: 0.0714046597 }
];

function calculateDL(studies) {
  const k = studies.length;
  const weights = studies.map(s => 1 / s.vi);
  const sumW = weights.reduce((a, b) => a + b, 0);
  const sumW2 = weights.reduce((a, w) => a + w * w, 0);
  const thetaFE = studies.reduce((sum, s, i) => sum + weights[i] * s.yi, 0) / sumW;
  const Q = studies.reduce((sum, s, i) => sum + weights[i] * Math.pow(s.yi - thetaFE, 2), 0);
  const c = sumW - sumW2 / sumW;
  const tau2 = Math.max(0, (Q - (k - 1)) / c);
  const reW = studies.map(s => 1 / (s.vi + tau2));
  const sumREW = reW.reduce((a, b) => a + b, 0);
  const estimate = studies.reduce((sum, s, i) => sum + reW[i] * s.yi, 0) / sumREW;
  return { estimate, tau2, k, Q };
}

const dlResult = calculateDL(bcgStudies);
console.log('BCG DL estimate:', dlResult.estimate);
console.log('BCG tau2:', dlResult.tau2);
console.log('Expected: -0.747392');
console.log('');

// Step through trim-and-fill
const k = bcgStudies.length;
const pooledEstimate = dlResult.estimate;

console.log('=== Trim-and-Fill Debug ===');
console.log('k:', k);
console.log('Initial pooled estimate:', pooledEstimate);
console.log('');

// Sort by effect size
const sorted = [...bcgStudies].sort((a, b) => a.yi - b.yi);
console.log('Sorted effect sizes:');
sorted.forEach((s, i) => console.log(`  ${i+1}: yi=${s.yi.toFixed(4)}`));
console.log('');

// Calculate deviations
const deviations = sorted.map(s => s.yi - pooledEstimate);
console.log('Deviations from pooled estimate:');
deviations.forEach((d, i) => console.log(`  ${i+1}: dev=${d.toFixed(4)}`));
console.log('');

// Rank by absolute deviation
const absDevs = deviations.map((d, i) => ({ dev: d, absD: Math.abs(d), idx: i, sign: Math.sign(d) }));
absDevs.sort((a, b) => a.absD - b.absD);
absDevs.forEach((item, rank) => { item.rank = rank + 1; });

console.log('Ranked by absolute deviation:');
absDevs.forEach(item => console.log(`  rank ${item.rank}: absD=${item.absD.toFixed(4)}, sign=${item.sign > 0 ? '+' : '-'}`));
console.log('');

// Count ranks on each side
let rightRankSum = 0, leftRankSum = 0;
for (const item of absDevs) {
  if (item.sign > 0) rightRankSum += item.rank;
  else if (item.sign < 0) leftRankSum += item.rank;
}

console.log('Right rank sum (positive):', rightRankSum);
console.log('Left rank sum (negative):', leftRankSum);
console.log('');

// L0 estimator
const S = Math.min(rightRankSum, leftRankSum);
const asymmetricSide = rightRankSum > leftRankSum ? 'right' : 'left';
console.log('S (smaller rank sum):', S);
console.log('Asymmetric side:', asymmetricSide);

// L0 formula: k0 = max(0, round((4*S - k*(k+1)/2) / (2*k - 1)))
const L0_numerator = 4 * S - k * (k + 1) / 2;
const L0_denominator = 2 * k - 1;
const L0_raw = L0_numerator / L0_denominator;
const k0 = Math.max(0, Math.round(L0_raw));

console.log('');
console.log('L0 calculation:');
console.log(`  numerator: 4*${S} - ${k}*${k+1}/2 = ${L0_numerator}`);
console.log(`  denominator: 2*${k} - 1 = ${L0_denominator}`);
console.log(`  L0_raw: ${L0_raw.toFixed(4)}`);
console.log(`  k0 (rounded): ${k0}`);
console.log('');
console.log('Expected k0: 0');
