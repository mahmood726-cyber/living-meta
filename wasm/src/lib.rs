//! Living Meta-Analysis WASM Module
//!
//! High-performance statistical calculations for meta-analysis.
//! Includes REML estimation, HKSJ adjustment, TSA, and NMA.

use wasm_bindgen::prelude::*;
use serde::{Serialize, Deserialize};

pub mod reml;
pub mod hksj;
pub mod tsa;
pub mod nma;

// Initialize panic hook for better error messages in browser
#[wasm_bindgen(start)]
pub fn start() {
    #[cfg(feature = "console_error_panic_hook")]
    console_error_panic_hook::set_once();
}

/// Study data for meta-analysis
#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct Study {
    pub id: String,
    pub yi: f64,       // Effect estimate
    pub vi: f64,       // Variance
    pub sei: f64,      // Standard error
    pub ni: Option<f64>, // Sample size (optional)
}

/// Meta-analysis result structure
#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct MetaAnalysisResult {
    pub theta: f64,        // Pooled effect
    pub se: f64,           // Standard error
    pub ci_lower: f64,     // 95% CI lower
    pub ci_upper: f64,     // 95% CI upper
    pub tau2: f64,         // Between-study variance
    pub tau: f64,          // Between-study SD
    pub i2: f64,           // I-squared (%)
    pub q: f64,            // Cochran's Q
    pub df: usize,         // Degrees of freedom
    pub p_q: f64,          // P-value for Q
    pub pi_lower: Option<f64>, // Prediction interval lower
    pub pi_upper: Option<f64>, // Prediction interval upper
    pub k: usize,          // Number of studies
    pub method: String,    // Estimation method
    pub converged: bool,   // Whether estimation converged
}

/// Run random effects meta-analysis with REML
#[wasm_bindgen]
pub fn meta_reml(studies_js: JsValue) -> Result<JsValue, JsValue> {
    let studies: Vec<Study> = serde_wasm_bindgen::from_value(studies_js)
        .map_err(|e| JsValue::from_str(&format!("Failed to parse studies: {}", e)))?;

    let result = reml::reml_meta_analysis(&studies)
        .map_err(|e| JsValue::from_str(&e))?;

    serde_wasm_bindgen::to_value(&result)
        .map_err(|e| JsValue::from_str(&format!("Failed to serialize result: {}", e)))
}

/// Apply HKSJ adjustment to meta-analysis
#[wasm_bindgen]
pub fn apply_hksj(theta: f64, se: f64, tau2: f64, studies_js: JsValue) -> Result<JsValue, JsValue> {
    let studies: Vec<Study> = serde_wasm_bindgen::from_value(studies_js)
        .map_err(|e| JsValue::from_str(&format!("Failed to parse studies: {}", e)))?;

    let result = hksj::hksj_adjustment(theta, se, tau2, &studies)
        .map_err(|e| JsValue::from_str(&e))?;

    serde_wasm_bindgen::to_value(&result)
        .map_err(|e| JsValue::from_str(&format!("Failed to serialize result: {}", e)))
}

/// Calculate TSA boundaries
#[wasm_bindgen]
pub fn tsa_boundaries(
    studies_js: JsValue,
    alpha: f64,
    beta: f64,
    anticipated_effect: f64,
    heterogeneity: f64,
) -> Result<JsValue, JsValue> {
    let studies: Vec<Study> = serde_wasm_bindgen::from_value(studies_js)
        .map_err(|e| JsValue::from_str(&format!("Failed to parse studies: {}", e)))?;

    let result = tsa::calculate_tsa(&studies, alpha, beta, anticipated_effect, heterogeneity)
        .map_err(|e| JsValue::from_str(&e))?;

    serde_wasm_bindgen::to_value(&result)
        .map_err(|e| JsValue::from_str(&format!("Failed to serialize result: {}", e)))
}

/// Calculate prediction interval
#[wasm_bindgen]
pub fn prediction_interval(theta: f64, se: f64, tau2: f64, k: usize) -> Result<JsValue, JsValue> {
    if k < 3 {
        return Err(JsValue::from_str("Need at least 3 studies for prediction interval"));
    }

    let df = k - 2;
    let t_crit = hksj::t_quantile(0.975, df as f64);
    let pi_se = (se * se + tau2).sqrt();

    let result = serde_json::json!({
        "lower": theta - t_crit * pi_se,
        "upper": theta + t_crit * pi_se,
        "df": df,
        "t_critical": t_crit
    });

    serde_wasm_bindgen::to_value(&result)
        .map_err(|e| JsValue::from_str(&format!("Failed to serialize: {}", e)))
}

/// Calculate I² with confidence interval
#[wasm_bindgen]
pub fn i2_with_ci(q: f64, k: usize) -> Result<JsValue, JsValue> {
    if k < 2 {
        return Err(JsValue::from_str("Need at least 2 studies"));
    }

    let df = (k - 1) as f64;
    let i2 = ((q - df) / q * 100.0).max(0.0);

    // CI using non-central chi-square (approximation)
    let q_lower = chi2_quantile(0.025, df);
    let q_upper = chi2_quantile(0.975, df);

    let i2_lower = if q > q_upper { ((q - q_upper) / q * 100.0).max(0.0) } else { 0.0 };
    let i2_upper = if q > q_lower { ((q - q_lower) / q * 100.0).max(0.0).min(100.0) } else { 0.0 };

    let result = serde_json::json!({
        "i2": i2,
        "i2_lower": i2_lower,
        "i2_upper": i2_upper,
        "q": q,
        "df": df
    });

    serde_wasm_bindgen::to_value(&result)
        .map_err(|e| JsValue::from_str(&format!("Failed to serialize: {}", e)))
}

// Helper: Chi-square quantile (approximation using Wilson-Hilferty)
fn chi2_quantile(p: f64, df: f64) -> f64 {
    let z = norm_quantile(p);
    let h = 2.0 / (9.0 * df);
    df * (1.0 - h + z * h.sqrt()).powi(3)
}

// Helper: Normal quantile (Rational approximation)
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_norm_quantile() {
        assert!((norm_quantile(0.5) - 0.0).abs() < 1e-10);
        assert!((norm_quantile(0.975) - 1.96).abs() < 0.01);
        assert!((norm_quantile(0.025) - (-1.96)).abs() < 0.01);
    }
}
