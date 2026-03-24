// Debug final trim-and-fill calculation

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

// Given: k0=1, side='right', converged beta (on flipped scale) = 0.6557
const k0 = 1;
const side = 'right';
const k = bcgStudies.length;

// The converged beta is on the original scale (since metafor reports original scale)
// metafor trimfill estimate = -0.6561
const targetBeta = -0.6561;

console.log('=== Final Trim-Fill Calculation Debug ===\n');

// Sort studies by original yi
const sortedStudies = [...bcgStudies].sort((a, b) => a.yi - b.yi);
console.log('Sorted yi (original scale):');
sortedStudies.forEach((s, i) => console.log(`  ${i}: yi=${s.yi.toFixed(4)}`));

// For side='right', we're filling in missing positive effects
// The k0=1 most extreme on the RIGHT side means the study with LARGEST yi
// We reflect that study to the LEFT of the mean
const extremeStudy = sortedStudies[k - 1];  // Last one (most positive)
console.log('\nMost extreme study on RIGHT:', extremeStudy.yi.toFixed(4));

// Reflect around the trimfill estimate (not around original DL!)
// The imputed yi should be: 2 * theta - yi_extreme
const imputedYi = 2 * targetBeta - extremeStudy.yi;
console.log('Imputed study yi:', imputedYi.toFixed(4));
console.log('(Reflected around theta=' + targetBeta + ')');

// Now compute DL with 14 studies (13 original + 1 imputed)
const allStudies = [...bcgStudies, { yi: imputedYi, vi: extremeStudy.vi }];
const result = calculateDL(allStudies);

console.log('\n=== Final result with imputed study ===');
console.log('DL estimate:', result.estimate.toFixed(6));
console.log('Expected:', targetBeta);
console.log('Match:', Math.abs(result.estimate - targetBeta) < 0.01 ? 'YES' : 'NO');

// The issue: we need to iterate to find the correct theta for reflection
// The theta for reflection should be the converged value from the iterative procedure
console.log('\n=== Check what happens with iterative theta ===');

// Using the converged beta from iteration (0.6557 on flipped scale = -0.6557 on original)
const iterBeta = -0.6557;
const imputedYi2 = 2 * iterBeta - extremeStudy.yi;
console.log('Using converged beta from iteration:', iterBeta);
console.log('Imputed yi:', imputedYi2.toFixed(4));

const allStudies2 = [...bcgStudies, { yi: imputedYi2, vi: extremeStudy.vi }];
const result2 = calculateDL(allStudies2);
console.log('DL estimate:', result2.estimate.toFixed(6));
