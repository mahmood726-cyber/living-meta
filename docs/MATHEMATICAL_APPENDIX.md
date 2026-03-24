# Mathematical Appendix

## Living Meta-Analysis Platform - Statistical Formulas and Methods

**Version:** 3.0.0
**Last Updated:** January 2025

This appendix provides detailed mathematical formulations for all statistical methods implemented in the Living Meta-Analysis platform, with references to the original literature and R package implementations.

---

## Table of Contents

1. [Effect Size Calculations](#1-effect-size-calculations)
2. [Fixed Effect Meta-Analysis](#2-fixed-effect-meta-analysis)
3. [Random Effects Meta-Analysis](#3-random-effects-meta-analysis)
4. [Heterogeneity Measures](#4-heterogeneity-measures)
5. [Meta-Regression](#5-meta-regression)
6. [Publication Bias Assessment](#6-publication-bias-assessment)
7. [Network Meta-Analysis](#7-network-meta-analysis)
8. [Bayesian Methods](#8-bayesian-methods)
9. [Inconsistency Testing](#9-inconsistency-testing)
10. [Ranking Methods](#10-ranking-methods)

---

## 1. Effect Size Calculations

### 1.1 Odds Ratio (OR)

For binary outcomes with events $a$ and $c$ in treatment group, events $b$ and $d$ in control group:

$$ \text{OR} = \frac{a/b}{c/d} = \frac{ad}{bc} $$

Log odds ratio:

$$ y_i = \log(\text{OR}_i) = \log\left(\frac{a_i d_i}{b_i c_i}\right) $$

Variance:

$$ v_i = \frac{1}{a_i} + \frac{1}{b_i} + \frac{1}{c_i} + \frac{1}{d_i} $$

**Reference:** Mantel and Haenszel (1959); Woolf (1955)
**R Implementation:** `metabin()` in `meta` package

### 1.2 Risk Ratio (RR)

$$ \text{RR} = \frac{a/(a+b)}{c/(c+d)} $$

Log risk ratio:

$$ y_i = \log(\text{RR}_i) $$

Variance (delta method):

$$ v_i = \frac{1}{a_i} - \frac{1}{a_i+b_i} + \frac{1}{c_i} - \frac{1}{c_i+d_i} $$

**Reference:** Mantel and Haenszel (1959)
**R Implementation:** `metabin()` with `sm = "RR"`

### 1.3 Risk Difference (RD)

$$ \text{RD} = \frac{a}{a+b} - \frac{c}{c+d} $$

Variance:

$$ v_i = \frac{a_i b_i}{(a_i+b_i)^3} + \frac{c_i d_i}{(c_i+d_i)^3} $$

**Reference:** Mantel and Haenszel (1959)
**R Implementation:** `metabin()` with `sm = "RD"`

### 1.4 Standardized Mean Difference (Hedges' g)

For continuous outcomes with means $\bar{x}_1$, $\bar{x}_2$, standard deviations $s_1$, $s_2$, and sample sizes $n_1$, $n_2$:

Pooled standard deviation:

$$ s_{\text{pooled}} = \sqrt{\frac{(n_1-1)s_1^2 + (n_2-1)s_2^2}{n_1+n_2-2}} $$

Cohen's d:

$$ d = \frac{\bar{x}_1 - \bar{x}_2}{s_{\text{pooled}}} $$

Hedges' bias correction:

$$ J = 1 - \frac{3}{4(n_1+n_2) - 5} $$

$$ g = J \cdot d $$

Variance:

$$ v_g = J^2 \left( \frac{n_1+n_2}{n_1 n_2} + \frac{g^2}{2(n_1+n_2)} \right) $$

**Reference:** Hedges and Olkin (1985)
**R Implementation:** `metacont()` with `sm = "SMD"` in `meta` package

### 1.5 Mean Difference (MD)

$$ y_i = \bar{x}_1 - \bar{x}_2 $$

$$ v_i = \frac{s_1^2}{n_1} + \frac{s_2^2}{n_2} $$

**Reference:** Cooper and Hedges (1994)
**R Implementation:** `metacont()` with `sm = "MD"`

---

## 2. Fixed Effect Meta-Analysis

### 2.1 Inverse Variance Weighting

Weight for study $i$:

$$ w_i = \frac{1}{v_i} $$

Pooled effect:

$$ \hat{\theta}_{FE} = \frac{\sum_{i=1}^k w_i y_i}{\sum_{i=1}^k w_i} $$

Standard error:

$$ \text{SE}(\hat{\theta}_{FE}) = \sqrt{\frac{1}{\sum_{i=1}^k w_i}} $$

### 2.2 Confidence Interval

$$ 95\% \text{ CI}: \hat{\theta}_{FE} \pm 1.96 \times \text{SE}(\hat{\theta}_{FE}) $$

### 2.3 Z-test

$$ z = \frac{\hat{\theta}_{FE}}{\text{SE}(\hat{\theta}_{FE})} $$

$$ p = 2 \times (1 - \Phi(|z|)) $$

where $\Phi$ is the standard normal CDF.

**Reference:** DerSimonian and Laird (1986); Cooper and Hedges (1994)
**R Implementation:** `metagen()` with `method = "Fixed"` in `meta` package

---

## 3. Random Effects Meta-Analysis

### 3.1 DerSimonian-Laird Estimator

Cochrane's Q statistic:

$$ Q = \sum_{i=1}^k w_i (y_i - \hat{\theta}_{FE})^2 $$

where $w_i = 1/v_i$.

Between-study variance:

$$ \hat{\tau}^2 = \max\left(0, \frac{Q - (k-1)}{C}\right) $$

$$ C = \sum_{i=1}^k w_i - \frac{\sum_{i=1}^k w_i^2}{\sum_{i=1}^k w_i} $$

### 3.2 Random Effects Weights

$$ w_i^* = \frac{1}{v_i + \hat{\tau}^2} $$

### 3.3 Pooled Effect

$$ \hat{\theta}_{RE} = \frac{\sum_{i=1}^k w_i^* y_i}{\sum_{i=1}^k w_i^*} $$

$$ \text{SE}(\hat{\theta}_{RE}) = \sqrt{\frac{1}{\sum_{i=1}^k w_i^*}} $$

### 3.4 Prediction Interval

$$ \hat{\theta}_{RE} \pm 1.96 \sqrt{\hat{\tau}^2 + \text{SE}(\hat{\theta}_{RE})^2} $$

**Reference:** DerSimonian and Laird (1986)
**R Implementation:** `metagen()` with `method = "DL"` in `meta` package

### 3.5 Paule-Mandel Estimator

Iteratively solve for $\tau^2$:

$$ \sum_{i=1}^k \frac{(y_i - \hat{\theta}_{RE})^2}{(v_i + \tau^2)^2} = k - 1 $$

**Reference:** Paule and Mandel (1982); DerSimonian and Kacker (2007)
**R Implementation:** `rma.uni()` with `method = "PM"` in `metafor` package

### 3.6 Restricted Maximum Likelihood (REML)

Maximize the restricted log-likelihood:

$$ \ell_R(\tau^2) = -\frac{1}{2} \left[ \sum_{i=1}^k \log(v_i + \tau^2) + \frac{\sum_{i=1}^k w_i^*(y_i - \hat{\theta}_{RE})^2 + \hat{\theta}_{RE}^2 / (\sum_{i=1}^k w_i^*)^{-1}}{\sigma^2} \right] $$

**Reference:** Viechtbauer (2005)
**R Implementation:** `rma.uni()` with `method = "REML"` in `metafor` package

---

## 4. Heterogeneity Measures

### 4.1 Cochran's Q

$$ Q = \sum_{i=1}^k w_i (y_i - \hat{\theta}_{FE})^2 $$

Under null hypothesis of homogeneity, $Q \sim \chi^2_{k-1}$.

### 4.2 I² Statistic

$$ I^2 = \max\left(0, \frac{Q - (k-1)}{Q}\right) \times 100\% $$

Interpretation:
- 0-25%: Low heterogeneity
- 25-50%: Moderate heterogeneity
- 50-75%: Substantial heterogeneity
- 75-100%: Considerable heterogeneity

**Reference:** Higgins et al. (2003)
**R Implementation:** `heterogeneity()` in `meta` package

### 4.3 H² Statistic

$$ H^2 = \frac{Q}{k-1} $$

### 4.4 Tau and Tau²

$$ \hat{\tau} = \sqrt{\hat{\tau}^2} $$

**Reference:** DerSimonian and Laird (1986)

---

## 5. Meta-Regression

### 5.1 Simple Meta-Regression

Model:

$$ y_i = \beta_0 + \beta_1 x_i + \varepsilon_i $$

$$ \varepsilon_i \sim N(0, v_i + \tau^2) $$

Weighted least squares:

$$ \hat{\beta} = (X^T W^{-1} X)^{-1} X^T W^{-1} y $$

where $W = \text{diag}(v_i + \hat{\tau}^2)$.

### 5.2 Multiple Meta-Regression

$$ y_i = \beta_0 + \beta_1 x_{i1} + \cdots + \beta_p x_{ip} + \varepsilon_i $$

Same weighted least squares formulation with $p$ covariates.

### 5.3 Knapp-Hartung Adjustment

Adjusted variance:

$$ \widehat{\text{Var}}(\hat{\beta}_j) = \hat{\sigma}^2 \cdot [(X^T W^{-1} X)^{-1}]_{jj} $$

$$ \hat{\sigma}^2 = \frac{\sum_{i=1}^k w_i^* (y_i - \hat{y}_i)^2}{k - p} $$

Use t-distribution with $k-p$ degrees of freedom.

**Reference:** Knapp and Hartung (2003); Viechtbauer et al. (2015)
**R Implementation:** `rma.uni()` with `test = "knha"` in `metafor` package

### 5.4 Permutation Test

For $B$ permutations:

1. Shuffle covariate values
2. Fit model and record slope
3. P-value: $p = \frac{1 + \#\{|\hat{\beta}^{(b)}| \geq |\hat{\beta}_{\text{obs}}|\}}{B + 1}$

**Reference:** Higgins and Thompson (2004)
**R Implementation:** Custom permutation in `metafor`

### 5.5 Variance Inflation Factor (VIF)

$$ \text{VIF}_j = \frac{1}{1 - R_j^2} $$

where $R_j^2$ is R² from regression of predictor $j$ on all other predictors.

**Reference:** Belsley et al. (1980)

---

## 6. Publication Bias Assessment

### 6.1 Egger's Test

Regression model:

$$ \frac{y_i}{\text{SE}_i} = \beta_0 + \beta_1 \left(\frac{1}{\text{SE}_i}\right) + \varepsilon_i $$

Test: $H_0: \beta_0 = 0$ (no asymmetry)

$$ t = \frac{\hat{\beta}_0}{\text{SE}(\hat{\beta}_0)} $$

**Reference:** Egger et al. (1997)
**R Implementation:** `regtest()` in `metafor` package

### 6.2 Begg's Test

Kendall's tau rank correlation between standardized residuals and variances:

$$ \tau = \frac{C - D}{\sqrt{(n_0 - n_1)(n_0 - n_2)}} $$

where $C$ = concordant pairs, $D$ = discordant pairs.

**Reference:** Begg and Mazumdar (1994)
**R Implementation:** `ranktest()` in `metafor` package

### 6.3 Trim-and-Fill

Iteratively:
1. Trim $k_0$ most extreme studies
2. Re-estimate effect
3. Fill in imputed studies
4. Continue until convergence

L0 estimator:

$$ k_0 = \frac{4S - k(k+1)}{2k} $$

where $S$ = sum of ranks of extreme studies.

**Reference:** Duval and Tweedie (2000a, 2000b)
**R Implementation:** `trimfill()` in `meta` package

### 6.4 PET-PEESE

Precision Effect Test (PET):

$$ y_i = \beta_0 + \beta_1 \text{SE}_i + \varepsilon_i $$

Precision Effect Estimate (PEESE):

$$ y_i = \beta_0 + \beta_1 \text{SE}_i^2 + \varepsilon_i $$

Decision rule:
- If PET significant ($p < 0.10$): use PET estimate
- Else if PEESE significant ($p < 0.10$): use PEESE estimate
- Otherwise: use standard estimate

**Reference:** Stanley and Doucouliagos (2014)
**R Implementation:** `petpeese()` in `metafor` package

### 6.5 P-Curve

Tests for evidential value:

$$ p = P(\chi^2_1 > \text{sum of } z^2) $$

**Reference:** Simonsohn et al. (2014)
**R Implementation:** `pcurve()` in `pcurve` package

### 6.6 Selection Models

Weight function:

$$ w(\theta_i) = \Phi\left(\frac{\theta_c - \theta_i}{\sigma}\right) $$

where $\theta_c$ is cutoff for publication.

**Reference:** Hedges (1992); Vevea and Hedges (1995)
**R Implementation:** `selmodel()` in `metafor` package

---

## 7. Network Meta-Analysis

### 7.1 Contrast-Based Approach

For studies comparing treatments $A$ and $B$:

$$ y_{AB}^{(s)} \sim N(\theta_{AB}, \sigma_{AB}^{(s)2}) $$

### 7.2 Consistency Model

$$ \theta_{AB} = \theta_{A} - \theta_{B} $$

with reference treatment $\theta_1 = 0$.

### 7.3 Inconsistency Model (Design-by-Treatment)

$$ y_{ds}^{(i)} = \delta_d + \theta_{B} - \theta_{A} + \omega_{dB} - \omega_{dA} + \varepsilon_{ds}^{(i)} $$

where $\omega$ parameters represent inconsistency.

### 7.4 Node-Splitting

For node $T$:

1. Direct estimate: $\hat{\theta}_{AB}^{\text{direct}}$ from studies comparing A-B
2. Indirect estimate: $\hat{\theta}_{AB}^{\text{indirect}} = \hat{\theta}_{AT} - \hat{\theta}_{BT}$
3. Difference: $D = \hat{\theta}_{AB}^{\text{direct}} - \hat{\theta}_{AB}^{\text{indirect}}$
4. Test: $z = D / \text{SE}(D)$

**Reference:** Dias et al. (2010); White et al. (2012)
**R Implementation:** `netsplit()` in `netmeta` package

### 7.5 Side-Splitting

For loop $A \to B \to C$:

Test if sum of effects around loop equals zero:

$$ S = \theta_{AB} + \theta_{BC} + \theta_{CA} $$

$$ z = S / \text{SE}(S) $$

**Reference:** Krahn et al. (2013)

---

## 8. Bayesian Methods

### 8.1 Hierarchical Model

$$ y_i | \theta_i, v_i \sim N(\theta_i, v_i) $$
$$ \theta_i | \mu, \tau^2 \sim N(\mu, \tau^2) $$
$$ \mu \sim N(0, 1000) $$
$$ \tau \sim \text{Half-Cauchy}(0, 2) $$

### 8.2 Gibbs Sampling Steps

1. **Sample $\theta_i$:**
   $$ \theta_i | \cdot \sim N\left(\frac{y_i/\tau^2 + \mu/v_i}{1/\tau^2 + 1/v_i}, \frac{1}{1/\tau^2 + 1/v_i}\right) $$

2. **Sample $\mu$:**
   $$ \mu | \cdot \sim N\left(\frac{\sum_i \theta_i/\tau^2}{k/\tau^2}, \frac{1}{k/\tau^2}\right) $$

3. **Sample $\tau^2$:**
   $$ \tau^2 | \cdot \sim \text{Inverse-Gamma}\left(\frac{k}{2}, \frac{\sum_i (\theta_i - \mu)^2}{2}\right) $$

### 8.3 Convergence Diagnostics

Gelman-Rubin R-hat:

$$ \hat{R} = \sqrt{\frac{\hat{V}}{W}} $$

where $W$ = within-chain variance, $\hat{V}$ = pooled variance.

**Reference:** Gelman et al. (2013); Gelman and Rubin (1992)
**R Implementation:** `rma.mv()` in `metafor`; `bugsjags` in `R2jags`

### 8.4 Effective Sample Size

$$ n_{\text{eff}} = \frac{m \cdot n}{1 + 2\sum_{k=1}^\infty \rho_k} $$

where $m$ = chains, $n$ = iterations per chain, $\rho_k$ = autocorrelation at lag $k$.

**Reference:** Gelman et al. (2013)

---

## 9. Inconsistency Testing

### 9.1 Q-statistic for Inconsistency

$$ Q_{\text{inc}} = \sum_d \sum_s w_{ds}^{(i)} (y_{ds}^{(i)} - \hat{y}_{ds}^{(i)})^2 $$

### 9.2 Inconsistency I²

$$ I_c^2 = \frac{Q_{\text{inc}} - df}{Q_{\text{inc}}} \times 100\% $$

**Reference:** Higgins et al. (2003)

---

## 10. Ranking Methods

### 10.1 SUCRA (Surface Under the Cumulative Ranking Curve)

For treatment $j$:

$$ \text{SUCRA}_j = \frac{1}{k-1} \sum_{b=1}^{k-1} \text{cumprob}_{jb} $$

where $\text{cumprob}_{jb}$ is cumulative probability of treatment $j$ being better than $b$ other treatments.

**Reference:** Salanti et al. (2011)
**R Implementation:** `sucra()` in `netsmeta` package

### 10.2 P-Score

$$ \text{P-score}_j = \frac{\sum_{s=1}^{N_s} p_{js}}{N_s} $$

where $p_{js}$ is probability that treatment $j$ is best in study $s$.

**Reference:** Rücker and Schwarzer (2015)

---

## References

- Begg CB, Mazumdar M. Operating characteristics of a rank correlation test for publication bias. *Biometrics*. 1994;50(4):1088-1101.
- Belsley DA, Kuh E, Welsch RE. *Regression Diagnostics: Identifying Influential Data and Sources of Collinearity*. Wiley; 1980.
- Cooper H, Hedges LV (eds). *The Handbook of Research Synthesis*. Russell Sage Foundation; 1994.
- DerSimonian R, Laird N. Meta-analysis in clinical trials. *Controlled Clinical Trials*. 1986;7(3):177-188.
- DerSimonian R, Kacker R. Random-effects model for meta-analysis of clinical trials: an update. *Contemporary Clinical Trials*. 2007;28(2):105-114.
- Dias S, et al. Checking consistency in mixed treatment comparison meta-analysis. *Statistics in Medicine*. 2010;29(7):932-944.
- Duval S, Tweedie R. A nonparametric "trim and fill" method of assessing publication bias in meta-analysis. *Biometrics*. 2000a;56(2):455-463.
- Duval S, Tweedie R. Trim and fill: A simple funnel plot-based method of testing and adjusting for publication bias in meta-analysis. *Biometrics*. 2000b;56(2):455-463.
- Egger M, Smith GD, Schneider M, Minder C. Bias in meta-analysis detected by a simple, graphical test. *BMJ*. 1997;315(7109):629-634.
- Gelman A, et al. *Bayesian Data Analysis* (3rd ed.). CRC Press; 2013.
- Gelman A, Rubin DB. Inference from iterative simulation using multiple sequences. *Statistical Science*. 1992;7(4):457-472.
- Hedges LV. Modeling publication selection effects in meta-analysis. *Statistical Science*. 1992;7(2):246-255.
- Hedges LV, Olkin I. *Statistical Methods for Meta-Analysis*. Academic Press; 1985.
- Higgins JP, Thompson SG. Controlling the risk of spurious findings from meta-regression. *Statistics in Medicine*. 2004;23(11):1663-1680.
- Higgins JP, Thompson SG, Deeks JJ, Altman DG. Measuring inconsistency in meta-analyses. *BMJ*. 2003;327(7414):557-560.
- Knapp G, Hartung J. Improved tests for a random effects meta-regression with a single covariate. *Statistics in Medicine*. 2003;22(17):2693-2710.
- Paule RC, Mandel J. Consensus values and weighting factors. *Journal of Research of the National Bureau of Standards*. 1982;87(5):377-385.
- Rücker G, Schwarzer G. Ranking treatments in frequentist network meta-analysis works without rescaling. *BMC Medical Research Methodology*. 2015;15:64.
- Salanti G, et al. Evaluating the quality of evidence from a network meta-analysis. *PLoS Medicine*. 2011;8(1):e1000106.
- Simonsohn U, Nelson LD, Simmons JP. P-curve: a key to the file-drawer. *Journal of Experimental Psychology: General*. 2014;143(2):534-547.
- Stanley TD, Doucouliagos H. Meta-regression approximations to reduce publication selection bias. *Research Synthesis Methods*. 2014;5(1):60-78.
- Vevea JL, Hedges LV. A general linear model for estimating effect size heterogeneity. *Psychological Bulletin*. 1995;117(2):369-382.
- Viechtbauer W. Bias and efficiency of meta-analytic variance estimators in the random-effects model. *Journal of Educational and Behavioral Statistics*. 2005;30(3):261-293.
- Viechtbauer W, et al. The thin line between explanation and prediction: methodological aspects of meta-regression. *Research Synthesis Methods*. 2015;6(1):52-60.
- White IR, et al. Network meta-analysis of randomized interventions: should the threshold for statistical significance be reduced? *Research Synthesis Methods*. 2012;3(2):80-100.

---

## R Package Correspondences

| Method | Living Meta | R Package | Function |
|--------|-------------|-----------|----------|
| Fixed Effect | `fixedEffects()` | `meta` | `metagen(method = "Fixed")` |
| DerSimonian-Laird | `derSimonianLaird()` | `meta` | `metagen(method = "DL")` |
| Paule-Mandel | `pauleMandel()` | `metafor` | `rma.uni(method = "PM")` |
| REML | `remlEstimator()` | `metafor` | `rma.uni(method = "REML")` |
| Meta-regression | `simpleMetaRegression()` | `metafor` | `rma.uni()` |
| Permutation test | `permutationTestMetaRegression()` | Custom | - |
| Egger test | `eggerTest()` | `metafor` | `regtest()` |
| Begg test | `beggTest()` | `metafor` | `ranktest()` |
| Trim-and-fill | `trimAndFill()` | `meta` | `trimfill()` |
| PET-PEESE | `petPeese()` | `metafor` | `regtest()` variants |
| NMA | `networkMetaAnalysis()` | `netmeta` | `netmeta()` |
| SUCRA | `calculateSUCRA()` | `netsmeta` | `sucra()` |
| Node-splitting | `nodeSplitting()` | `netmeta` | `netsplit()` |
| Bayesian RE | `bayesianRandomEffects()` | `R2jags` | `rma.mv()` |

---

**Document Version:** 1.0
**Generated for:** Living Meta-Analysis v3.0.0
**Corresponding Author:** Living Meta-Analysis Development Team
