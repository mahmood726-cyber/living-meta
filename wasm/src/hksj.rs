//! HKSJ (Hartung-Knapp-Sidik-Jonkman) Adjustment
//!
//! Provides improved confidence intervals for random effects meta-analysis.

use crate::Study;
use serde::{Serialize, Deserialize};

/// Result of HKSJ adjustment
#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct HKSJResult {
    pub theta: f64,
    pub se: f64,
    pub se_hksj: f64,
    pub ci_lower: f64,
    pub ci_upper: f64,
    pub t_critical: f64,
    pub df: usize,
    pub q_star: f64,
    pub multiplier: f64,
    pub applied: bool,  // Whether HKSJ widened CI (never narrows)
}

/// Apply HKSJ adjustment to meta-analysis
pub fn hksj_adjustment(theta: f64, se: f64, tau2: f64, studies: &[Study]) -> Result<HKSJResult, String> {
    if studies.len() < 2 {
        return Err("Need at least 2 studies".to_string());
    }

    let k = studies.len();
    let df = k - 1;

    // Random effects weights
    let wi: Vec<f64> = studies.iter().map(|s| 1.0 / (s.vi + tau2)).collect();
    let sum_wi: f64 = wi.iter().sum();

    // Calculate Q* with random effects weights
    let q_star: f64 = studies.iter()
        .zip(&wi)
        .map(|(s, &w)| w * (s.yi - theta).powi(2))
        .sum();

    // HKSJ multiplier
    let multiplier = (q_star / (k - 1) as f64).max(1.0);

    // HKSJ-adjusted SE (never narrower than original)
    let se_hksj = se * multiplier.sqrt();

    // t critical value
    let t_crit = t_quantile(0.975, df as f64);

    // Confidence interval using t-distribution
    let ci_lower = theta - t_crit * se_hksj;
    let ci_upper = theta + t_crit * se_hksj;

    Ok(HKSJResult {
        theta,
        se,
        se_hksj,
        ci_lower,
        ci_upper,
        t_critical: t_crit,
        df,
        q_star,
        multiplier,
        applied: multiplier > 1.0,
    })
}

/// Calculate HKSJ-adjusted prediction interval
pub fn hksj_prediction_interval(
    theta: f64,
    se: f64,
    tau2: f64,
    k: usize,
    q_star: f64,
) -> Result<(f64, f64), String> {
    if k < 3 {
        return Err("Need at least 3 studies for prediction interval".to_string());
    }

    let df = k - 2;
    let t_crit = t_quantile(0.975, df as f64);

    // HKSJ multiplier
    let multiplier = (q_star / (k - 1) as f64).max(1.0);
    let se_adj = se * multiplier.sqrt();

    // Prediction interval SE includes τ²
    let pi_se = (se_adj.powi(2) + tau2).sqrt();

    let lower = theta - t_crit * pi_se;
    let upper = theta + t_crit * pi_se;

    Ok((lower, upper))
}

/// Compare HKSJ CI to standard CI
pub fn compare_intervals(
    theta: f64,
    se_standard: f64,
    se_hksj: f64,
    k: usize,
) -> serde_json::Value {
    let df = k - 1;
    let z = 1.96;
    let t_crit = t_quantile(0.975, df as f64);

    let ci_standard_lower = theta - z * se_standard;
    let ci_standard_upper = theta + z * se_standard;
    let ci_hksj_lower = theta - t_crit * se_hksj;
    let ci_hksj_upper = theta + t_crit * se_hksj;

    let width_standard = ci_standard_upper - ci_standard_lower;
    let width_hksj = ci_hksj_upper - ci_hksj_lower;
    let ratio = width_hksj / width_standard;

    serde_json::json!({
        "standard": {
            "lower": ci_standard_lower,
            "upper": ci_standard_upper,
            "width": width_standard
        },
        "hksj": {
            "lower": ci_hksj_lower,
            "upper": ci_hksj_upper,
            "width": width_hksj
        },
        "ratio": ratio,
        "hksj_wider": ratio > 1.0
    })
}

// Statistical helper: t-distribution quantile
pub fn t_quantile(p: f64, df: f64) -> f64 {
    if df <= 0.0 { return f64::NAN; }
    if p <= 0.0 { return f64::NEG_INFINITY; }
    if p >= 1.0 { return f64::INFINITY; }
    if p == 0.5 { return 0.0; }

    // Start with normal approximation
    let mut t = norm_quantile(p);

    // Newton-Raphson refinement
    for _ in 0..10 {
        let cdf = t_cdf(t, df);
        let pdf = t_pdf(t, df);
        if pdf.abs() < 1e-10 { break; }

        let diff = cdf - p;
        if diff.abs() < 1e-10 { break; }

        t -= diff / pdf;
    }

    t
}

fn t_cdf(t: f64, df: f64) -> f64 {
    let x = df / (df + t * t);
    1.0 - 0.5 * incomplete_beta(df / 2.0, 0.5, x)
}

fn t_pdf(t: f64, df: f64) -> f64 {
    (ln_gamma((df + 1.0) / 2.0) - ln_gamma(df / 2.0)).exp()
        / (df * std::f64::consts::PI).sqrt()
        * (1.0 + t * t / df).powf(-(df + 1.0) / 2.0)
}

fn norm_quantile(p: f64) -> f64 {
    if p <= 0.0 { return f64::NEG_INFINITY; }
    if p >= 1.0 { return f64::INFINITY; }
    if p == 0.5 { return 0.0; }

    let a = [
        -3.969683028665376e+01, 2.209460984245205e+02,
        -2.759285104469687e+02, 1.383577518672690e+02,
        -3.066479806614716e+01, 2.506628277459239e+00,
    ];
    let b = [
        -5.447609879822406e+01, 1.615858368580409e+02,
        -1.556989798598866e+02, 6.680131188771972e+01,
        -1.328068155288572e+01,
    ];
    let c = [
        -7.784894002430293e-03, -3.223964580411365e-01,
        -2.400758277161838e+00, -2.549732539343734e+00,
        4.374664141464968e+00, 2.938163982698783e+00,
    ];
    let d = [
        7.784695709041462e-03, 3.224671290700398e-01,
        2.445134137142996e+00, 3.754408661907416e+00,
    ];

    let p_low = 0.02425;
    let p_high = 1.0 - p_low;

    if p < p_low {
        let q = (-2.0 * p.ln()).sqrt();
        (((((c[0]*q+c[1])*q+c[2])*q+c[3])*q+c[4])*q+c[5]) /
        ((((d[0]*q+d[1])*q+d[2])*q+d[3])*q+1.0)
    } else if p <= p_high {
        let q = p - 0.5;
        let r = q * q;
        (((((a[0]*r+a[1])*r+a[2])*r+a[3])*r+a[4])*r+a[5])*q /
        (((((b[0]*r+b[1])*r+b[2])*r+b[3])*r+b[4])*r+1.0)
    } else {
        let q = (-2.0 * (1.0 - p).ln()).sqrt();
        -(((((c[0]*q+c[1])*q+c[2])*q+c[3])*q+c[4])*q+c[5]) /
        ((((d[0]*q+d[1])*q+d[2])*q+d[3])*q+1.0)
    }
}

fn incomplete_beta(a: f64, b: f64, x: f64) -> f64 {
    if x == 0.0 { return 0.0; }
    if x == 1.0 { return 1.0; }

    let bt = (ln_gamma(a + b) - ln_gamma(a) - ln_gamma(b)
        + a * x.ln() + b * (1.0 - x).ln()).exp();

    if x < (a + 1.0) / (a + b + 2.0) {
        bt * beta_cf(a, b, x) / a
    } else {
        1.0 - bt * beta_cf(b, a, 1.0 - x) / b
    }
}

fn beta_cf(a: f64, b: f64, x: f64) -> f64 {
    let qab = a + b;
    let qap = a + 1.0;
    let qam = a - 1.0;
    let mut c = 1.0;
    let mut d = 1.0 - qab * x / qap;
    if d.abs() < 1e-30 { d = 1e-30; }
    d = 1.0 / d;
    let mut h = d;

    for m in 1..100 {
        let m2 = 2.0 * m as f64;
        let mut aa = m as f64 * (b - m as f64) * x / ((qam + m2) * (a + m2));
        d = 1.0 + aa * d;
        if d.abs() < 1e-30 { d = 1e-30; }
        c = 1.0 + aa / c;
        if c.abs() < 1e-30 { c = 1e-30; }
        d = 1.0 / d;
        h *= d * c;

        aa = -(a + m as f64) * (qab + m as f64) * x / ((a + m2) * (qap + m2));
        d = 1.0 + aa * d;
        if d.abs() < 1e-30 { d = 1e-30; }
        c = 1.0 + aa / c;
        if c.abs() < 1e-30 { c = 1e-30; }
        d = 1.0 / d;
        let del = d * c;
        h *= del;

        if (del - 1.0).abs() < 1e-10 { break; }
    }

    h
}

fn ln_gamma(x: f64) -> f64 {
    let coef = [
        76.18009172947146,
        -86.50532032941677,
        24.01409824083091,
        -1.231739572450155,
        0.1208650973866179e-2,
        -0.5395239384953e-5,
    ];

    let mut y = x;
    let mut tmp = x + 5.5;
    tmp -= (x + 0.5) * tmp.ln();

    let mut ser = 1.000000000190015;
    for c in &coef {
        y += 1.0;
        ser += c / y;
    }

    -tmp + (2.5066282746310005 * ser / x).ln()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_t_quantile() {
        // Known values
        assert!((t_quantile(0.975, 10.0) - 2.228).abs() < 0.01);
        assert!((t_quantile(0.975, 30.0) - 2.042).abs() < 0.01);
        assert!((t_quantile(0.975, 100.0) - 1.984).abs() < 0.01);
    }

    #[test]
    fn test_hksj_never_narrows() {
        let studies = vec![
            Study { id: "1".to_string(), yi: 0.1, vi: 0.01, sei: 0.1, ni: Some(100.0) },
            Study { id: "2".to_string(), yi: 0.2, vi: 0.02, sei: 0.141, ni: Some(50.0) },
            Study { id: "3".to_string(), yi: 0.15, vi: 0.015, sei: 0.122, ni: Some(67.0) },
        ];

        let theta = 0.15;
        let se = 0.08;
        let tau2 = 0.001;

        let result = hksj_adjustment(theta, se, tau2, &studies).unwrap();

        // HKSJ SE should never be smaller than original
        assert!(result.se_hksj >= se);
    }
}
