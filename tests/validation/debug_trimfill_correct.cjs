// Debug trim-and-fill with CORRECT metafor algorithm

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
  return { estimate, tau2, k, Q, se: Math.sqrt(1/sumREW) };
}

// Determine side using Egger-type test (metafor default)
function determineSide(studies, estimate) {
  // metafor uses regression of yi on sqrt(vi) to determine side
  const x = studies.map(s => Math.sqrt(s.vi));
  const y = studies.map(s => s.yi);
  const w = studies.map(s => 1 / s.vi);

  // Weighted regression
  const sumW = w.reduce((a, b) => a + b, 0);
  const meanX = w.reduce((sum, wi, i) => sum + wi * x[i], 0) / sumW;
  const meanY = w.reduce((sum, wi, i) => sum + wi * y[i], 0) / sumW;

  let num = 0, den = 0;
  for (let i = 0; i < studies.length; i++) {
    num += w[i] * (x[i] - meanX) * (y[i] - meanY);
    den += w[i] * Math.pow(x[i] - meanX, 2);
  }
  const slope = num / den;

  // If slope < 0, missing studies on right (positive effects suppressed)
  return slope < 0 ? 'right' : 'left';
}

// Corrected L0 estimator using metafor's algorithm
function runTrimAndFillCorrect(studies) {
  let yi = studies.map(s => s.yi);
  let vi = studies.map(s => s.vi);
  const k = yi.length;

  // Determine side
  const dlResult = calculateDL(studies);
  const side = determineSide(studies, dlResult.estimate);
  console.log('Determined side:', side);

  // If side='right', negate yi values (looking for missing positive effects)
  if (side === 'right') {
    yi = yi.map(y => -y);
  }

  // Sort by yi
  const indices = yi.map((_, i) => i).sort((a, b) => yi[a] - yi[b]);
  const sorted_yi = indices.map(i => yi[i]);
  const sorted_vi = indices.map(i => vi[i]);

  console.log('Sorted yi (after flip if right):', sorted_yi.map(x => x.toFixed(4)));

  // Iterative procedure
  let k0 = 0;
  let k0_prev = -1;
  let iter = 0;
  let beta;

  while (k0 !== k0_prev && iter < 50) {
    k0_prev = k0;
    iter++;

    // Use studies 0 to (k - k0 - 1), i.e., exclude k0 most extreme
    const trimmed_yi = sorted_yi.slice(0, k - k0);
    const trimmed_vi = sorted_vi.slice(0, k - k0);

    // Compute DL estimate on trimmed data
    const trimmed_studies = trimmed_yi.map((y, i) => ({ yi: y, vi: trimmed_vi[i] }));
    const trimmed_dl = calculateDL(trimmed_studies);
    beta = trimmed_dl.estimate;

    // Compute centered values
    const yi_c = sorted_yi.map(y => y - beta);

    // Rank by absolute value (ties='first' in R means first occurrence gets lower rank)
    const absRanked = yi_c.map((y, i) => ({ idx: i, val: Math.abs(y) }))
                         .sort((a, b) => a.val - b.val || a.idx - b.idx);
    const ranks = new Array(k);
    absRanked.forEach((item, rank) => { ranks[item.idx] = rank + 1; });

    // Signed ranks
    const signedRanks = yi_c.map((y, i) => Math.sign(y) * ranks[i]);

    // Sr = sum of positive signed ranks
    const Sr = signedRanks.filter(r => r > 0).reduce((a, b) => a + b, 0);

    // L0 formula (metafor version - NO division by 2!)
    const L0_raw = (4 * Sr - k * (k + 1)) / (2 * k - 1);
    k0 = Math.max(0, Math.round(L0_raw));

    console.log(`Iter ${iter}: k0=${k0}, beta=${beta.toFixed(4)}, Sr=${Sr}, L0_raw=${L0_raw.toFixed(4)}`);
  }

  console.log(`\nConverged after ${iter} iterations`);
  console.log(`Final k0: ${k0}`);
  console.log(`Expected k0: 1`);

  return { k0, side };
}

console.log('=== Corrected Trim-and-Fill Debug ===\n');
const dlResult = calculateDL(bcgStudies);
console.log('DL estimate:', dlResult.estimate.toFixed(6));
console.log('');

const result = runTrimAndFillCorrect(bcgStudies);
