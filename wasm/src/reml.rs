//! REML (Restricted Maximum Likelihood) estimation for τ²
//!
//! Implements iterative REML algorithm for random effects meta-analysis.

use crate::{Study, MetaAnalysisResult};

/// Perform REML meta-analysis
pub fn reml_meta_analysis(studies: &[Study]) -> Result<MetaAnalysisResult, String> {
    if studies.len() < 2 {
        return Err("Need at least 2 studies for meta-analysis".to_string());
    }

    let k = studies.len();
    let yi: Vec<f64> = studies.iter().map(|s| s.yi).collect();
    let vi: Vec<f64> = studies.iter().map(|s| s.vi).collect();

    // Check for valid variances
    if vi.iter().any(|&v| v <= 0.0 || v.is_nan()) {
        return Err("All variances must be positive".to_string());
    }

    // Start with DerSimonian-Laird estimate
    let tau2_dl = dl_tau2(&yi, &vi);
    let mut tau2 = tau2_dl.max(0.0);

    // REML iteration
    let max_iter = 100;
    let tol = 1e-8;
    let mut converged = false;

    for _ in 0..max_iter {
        let tau2_new = reml_update(tau2, &yi, &vi);

        if (tau2_new - tau2).abs() < tol {
            tau2 = tau2_new.max(0.0);
            converged = true;
            break;
        }
        tau2 = tau2_new.max(0.0);
    }

    // Calculate pooled estimate with final τ²
    let wi: Vec<f64> = vi.iter().map(|&v| 1.0 / (v + tau2)).collect();
    let sum_wi: f64 = wi.iter().sum();
    let theta: f64 = yi.iter().zip(&wi).map(|(&y, &w)| y * w).sum::<f64>() / sum_wi;
    let variance = 1.0 / sum_wi;
    let se = variance.sqrt();

    // Cochran's Q
    let q: f64 = yi.iter().zip(&vi)
        .map(|(&y, &v)| (y - theta).powi(2) / v)
        .sum();

    // P-value for Q
    let df = k - 1;
    let p_q = 1.0 - chi2_cdf(q, df as f64);

    // I²
    let i2 = ((q - df as f64) / q * 100.0).max(0.0);

    // Confidence interval
    let z = 1.96;
    let ci_lower = theta - z * se;
    let ci_upper = theta + z * se;

    // Prediction interval
    let (pi_lower, pi_upper) = if k >= 3 {
        let df_pi = k - 2;
        let t_crit = t_quantile(0.975, df_pi as f64);
        let pi_se = (variance + tau2).sqrt();
        (Some(theta - t_crit * pi_se), Some(theta + t_crit * pi_se))
    } else {
        (None, None)
    };

    Ok(MetaAnalysisResult {
        theta,
        se,
        ci_lower,
        ci_upper,
        tau2,
        tau: tau2.sqrt(),
        i2,
        q,
        df,
        p_q,
        pi_lower,
        pi_upper,
        k,
        method: "REML".to_string(),
        converged,
    })
}

/// DerSimonian-Laird τ² estimator (starting value for REML)
fn dl_tau2(yi: &[f64], vi: &[f64]) -> f64 {
    let k = yi.len();
    if k < 2 { return 0.0; }

    let wi: Vec<f64> = vi.iter().map(|&v| 1.0 / v).collect();
    let sum_wi: f64 = wi.iter().sum();
    let sum_wi2: f64 = wi.iter().map(|&w| w * w).sum();

    let theta: f64 = yi.iter().zip(&wi).map(|(&y, &w)| y * w).sum::<f64>() / sum_wi;

    let q: f64 = yi.iter().zip(&vi)
        .map(|(&y, &v)| (y - theta).powi(2) / v)
        .sum();

    let c = sum_wi - sum_wi2 / sum_wi;

    ((q - (k - 1) as f64) / c).max(0.0)
}

/// Single REML update step using Fisher scoring
fn reml_update(tau2: f64, yi: &[f64], vi: &[f64]) -> f64 {
    let wi: Vec<f64> = vi.iter().map(|&v| 1.0 / (v + tau2)).collect();
    let sum_wi: f64 = wi.iter().sum();
    let sum_wi2: f64 = wi.iter().map(|&w| w * w).sum();

    let theta: f64 = yi.iter().zip(&wi).map(|(&y, &w)| y * w).sum::<f64>() / sum_wi;

    // REML log-likelihood derivative
    let dl: f64 = -0.5 * sum_wi2 / sum_wi
        + 0.5 * yi.iter().zip(&wi)
            .map(|(&y, &w)| w * w * (y - theta).powi(2))
            .sum::<f64>();

    // Fisher information
    let d2l: f64 = 0.5 * wi.iter()
        .map(|&w| w * w * (1.0 - 2.0 * w / sum_wi))
        .sum::<f64>();

    if d2l.abs() < 1e-10 {
        return tau2;
    }

    tau2 + dl / d2l.abs()
}

/// Paule-Mandel τ² estimator
pub fn pm_tau2(yi: &[f64], vi: &[f64]) -> f64 {
    let k = yi.len();
    if k < 2 { return 0.0; }

    let mut tau2 = dl_tau2(yi, vi);
    let max_iter = 100;
    let tol = 1e-5;

    for _ in 0..max_iter {
        let wi: Vec<f64> = vi.iter().map(|&v| 1.0 / (v + tau2)).collect();
        let sum_wi: f64 = wi.iter().sum();
        let theta: f64 = yi.iter().zip(&wi).map(|(&y, &w)| y * w).sum::<f64>() / sum_wi;

        let q_star: f64 = yi.iter().zip(&wi)
            .map(|(&y, &w)| w * (y - theta).powi(2))
            .sum();

        let sum_wi3: f64 = wi.iter().map(|&w| w * w).sum();

        let tau2_new = tau2 + (q_star - (k - 1) as f64) / sum_wi3;

        if (tau2_new - tau2).abs() < tol {
            return tau2_new.max(0.0);
        }
        tau2 = tau2_new.max(0.0);
    }

    tau2
}

// Statistical helper functions

fn chi2_cdf(x: f64, df: f64) -> f64 {
    if x <= 0.0 { return 0.0; }
    regularized_gamma_p(df / 2.0, x / 2.0)
}

fn regularized_gamma_p(a: f64, x: f64) -> f64 {
    if x < 0.0 || a <= 0.0 { return 0.0; }
    if x == 0.0 { return 0.0; }

    if x < a + 1.0 {
        // Series representation
        let mut sum = 1.0 / a;
        let mut term = 1.0 / a;
        for n in 1..100 {
            term *= x / (a + n as f64);
            sum += term;
            if term.abs() < 1e-10 * sum.abs() { break; }
        }
        sum * (-x + a * x.ln() - ln_gamma(a)).exp()
    } else {
        // Continued fraction
        1.0 - regularized_gamma_q(a, x)
    }
}

fn regularized_gamma_q(a: f64, x: f64) -> f64 {
    let fpmin = 1e-30;
    let mut b = x + 1.0 - a;
    let mut c = 1.0 / fpmin;
    let mut d = 1.0 / b;
    let mut h = d;

    for i in 1..100 {
        let an = -(i as f64) * (i as f64 - a);
        b += 2.0;
        d = an * d + b;
        if d.abs() < fpmin { d = fpmin; }
        c = b + an / c;
        if c.abs() < fpmin { c = fpmin; }
        d = 1.0 / d;
        let del = d * c;
        h *= del;
        if (del - 1.0).abs() < 1e-10 { break; }
    }

    (-x + a * x.ln() - ln_gamma(a)).exp() * h
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

pub fn t_quantile(p: f64, df: f64) -> f64 {
    // Newton-Raphson for t quantile
    let mut t = norm_quantile(p);

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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_dl_tau2() {
        // Test with known values
        let yi = vec![0.1, 0.2, 0.3, 0.15, 0.25];
        let vi = vec![0.01, 0.02, 0.015, 0.012, 0.018];
        let tau2 = dl_tau2(&yi, &vi);
        assert!(tau2 >= 0.0);
    }

    #[test]
    fn test_reml_meta() {
        let studies = vec![
            Study { id: "1".to_string(), yi: 0.1, vi: 0.01, sei: 0.1, ni: Some(100.0) },
            Study { id: "2".to_string(), yi: 0.2, vi: 0.02, sei: 0.141, ni: Some(50.0) },
            Study { id: "3".to_string(), yi: 0.15, vi: 0.015, sei: 0.122, ni: Some(67.0) },
        ];

        let result = reml_meta_analysis(&studies).unwrap();
        assert!(result.converged);
        assert!(result.tau2 >= 0.0);
        assert!(result.i2 >= 0.0 && result.i2 <= 100.0);
    }
}
