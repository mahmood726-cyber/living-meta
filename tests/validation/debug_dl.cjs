// Debug DL calculation for BCG

const bcgStudies = [
  { yi: -0.9386941409, vi: 0.3571249523 },
  { yi: -1.6661907290, vi: 0.2081323937 },
  { yi: -1.3862943611, vi: 0.3385128316 },
  { yi: -0.2175839780, vi: 0.0039825574 },
  { yi: -0.7861515372, vi: 0.0137796997 },
  { yi: -1.6197385306, vi: 0.0645057934 },
  { yi: -0.2006706954, vi: 0.0180158968 },
  { yi:  0.0122447893, vi: 0.0001146893 },
  { yi: -0.4694143518, vi: 0.0095824098 },
  { yi:  0.0197296928, vi: 0.0099399089 },
  { yi: -0.0173038920, vi: 0.0001920155 },
  { yi:  0.4466400219, vi: 0.0549022847 },
  { yi: -0.0172771003, vi: 0.0006050614 }
];

const k = bcgStudies.length;
console.log('k:', k);

// FE weights
const weights = bcgStudies.map(s => 1 / s.vi);
console.log('\nFE weights:');
bcgStudies.forEach((s, i) => console.log(`  study ${i+1}: 1/${s.vi.toFixed(6)} = ${weights[i].toFixed(2)}`));

const sumW = weights.reduce((a, b) => a + b, 0);
const sumW2 = weights.reduce((a, w) => a + w * w, 0);
console.log('\nsumW:', sumW.toFixed(2));
console.log('sumW2:', sumW2.toFixed(2));

// Fixed-effect estimate
const weighted_sum = bcgStudies.reduce((sum, s, i) => sum + weights[i] * s.yi, 0);
console.log('weighted sum:', weighted_sum.toFixed(4));
const thetaFE = weighted_sum / sumW;
console.log('theta_FE:', thetaFE.toFixed(6));

// Q statistic
let Q = 0;
bcgStudies.forEach((s, i) => {
  const term = weights[i] * Math.pow(s.yi - thetaFE, 2);
  console.log(`  Q term ${i+1}: ${weights[i].toFixed(2)} * (${s.yi.toFixed(4)} - ${thetaFE.toFixed(4)})^2 = ${term.toFixed(4)}`);
  Q += term;
});
console.log('\nQ:', Q.toFixed(4));
console.log('df = k-1:', k-1);

// c factor
const c = sumW - sumW2 / sumW;
console.log('c:', c.toFixed(4));

// tau2
const tau2_raw = (Q - (k - 1)) / c;
const tau2 = Math.max(0, tau2_raw);
console.log('tau2_raw:', tau2_raw.toFixed(6));
console.log('tau2:', tau2.toFixed(6));
console.log('');
console.log('Expected tau2: ~0.35 (from metafor)');

// RE estimate
const reW = bcgStudies.map(s => 1 / (s.vi + tau2));
const sumREW = reW.reduce((a, b) => a + b, 0);
const estimate = bcgStudies.reduce((sum, s, i) => sum + reW[i] * s.yi, 0) / sumREW;

console.log('\nRE estimate:', estimate.toFixed(6));
console.log('Expected: -0.747392');
