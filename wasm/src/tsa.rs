//! Trial Sequential Analysis (TSA)
//!
//! Implements sequential monitoring for living meta-analysis with
//! O'Brien-Fleming boundaries using Lan-DeMets alpha spending.

use crate::Study;
use serde::{Serialize, Deserialize};

/// TSA configuration
#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct TSAConfig {
    pub alpha: f64,            // Type I error (default 0.05)
    pub beta: f64,             // Type II error (default 0.2)
    pub anticipated_effect: f64, // Expected effect size
    pub heterogeneity: f64,    // Expected τ² (for DARIS)
    pub one_sided: bool,       // One-sided or two-sided test
}

impl Default for TSAConfig {
    fn default() -> Self {
        TSAConfig {
            alpha: 0.05,
            beta: 0.2,
            anticipated_effect: 0.3, // Log(OR) of ~1.35
            heterogeneity: 0.1,
            one_sided: false,
        }
    }
}

/// TSA result structure
#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct TSAResult {
    pub ris: f64,                   // Required Information Size
    pub daris: f64,                 // Diversity-adjusted RIS
    pub information_fraction: f64,  // Current I/RIS
    pub cumulative_z: Vec<CumulativePoint>,
    pub boundaries: TSABoundaries,
    pub conclusion: TSAConclusion,
    pub monitoring_points: Vec<MonitoringPoint>,
}

/// Point on cumulative Z-curve
#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct CumulativePoint {
    pub study_index: usize,
    pub study_id: String,
    pub cumulative_n: f64,
    pub cumulative_effect: f64,
    pub cumulative_se: f64,
    pub z_score: f64,
    pub information: f64,
}

/// TSA boundaries
#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct TSABoundaries {
    pub alpha_upper: Vec<(f64, f64)>,  // (information_fraction, z_boundary)
    pub alpha_lower: Vec<(f64, f64)>,  // For two-sided
    pub beta_boundary: Vec<(f64, f64)>, // Futility boundary
    pub boundary_type: String,
}

/// Monitoring point for real-time tracking
#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct MonitoringPoint {
    pub information_fraction: f64,
    pub z_score: f64,
    pub upper_boundary: f64,
    pub lower_boundary: Option<f64>,
    pub crossed_upper: bool,
    pub crossed_lower: bool,
    pub crossed_futility: bool,
}

/// TSA conclusion
#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct TSAConclusion {
    pub firm_evidence: bool,
    pub direction: Option<String>,  // "benefit", "harm", "futility", or None
    pub sufficient_information: bool,
    pub message: String,
}

/// Calculate TSA with O'Brien-Fleming boundaries
pub fn calculate_tsa(
    studies: &[Study],
    alpha: f64,
    beta: f64,
    anticipated_effect: f64,
    heterogeneity: f64,
) -> Result<TSAResult, String> {
    if studies.is_empty() {
        return Err("No studies provided".to_string());
    }

    let config = TSAConfig {
        alpha,
        beta,
        anticipated_effect,
        heterogeneity,
        one_sided: false,
    };

    // Calculate Required Information Size
    let ris = calculate_ris(&config);
    let daris = calculate_daris(ris, heterogeneity);

    // Calculate cumulative Z-curve
    let cumulative = calculate_cumulative_z(studies);

    // Current information
    let current_info = if let Some(last) = cumulative.last() {
        last.information
    } else {
        0.0
    };

    let info_fraction = current_info / daris;

    // Calculate boundaries at standard information fractions
    let boundaries = calculate_boundaries(&config, daris);

    // Generate monitoring points
    let monitoring = generate_monitoring_points(&cumulative, &boundaries, daris);

    // Determine conclusion
    let conclusion = determine_conclusion(&monitoring, info_fraction, &config);

    Ok(TSAResult {
        ris,
        daris,
        information_fraction: info_fraction,
        cumulative_z: cumulative,
        boundaries,
        conclusion,
        monitoring_points: monitoring,
    })
}

/// Calculate Required Information Size (sample size for meta-analysis)
fn calculate_ris(config: &TSAConfig) -> f64 {
    let alpha = if config.one_sided { config.alpha } else { config.alpha / 2.0 };

    let z_alpha = norm_quantile(1.0 - alpha);
    let z_beta = norm_quantile(1.0 - config.beta);

    // For log-scale effects: n = 4 * (z_α + z_β)² / δ²
    // Information = 1/Var ≈ n/4 for OR/RR
    let effect = config.anticipated_effect;
    if effect.abs() < 1e-10 {
        return f64::INFINITY;
    }

    4.0 * (z_alpha + z_beta).powi(2) / effect.powi(2)
}

/// Diversity-Adjusted Required Information Size
fn calculate_daris(ris: f64, heterogeneity: f64) -> f64 {
    // DARIS = RIS × (1 + D²) where D² is diversity
    // D² ≈ τ² / (τ² + typical_variance)
    // Simplified: use heterogeneity directly as adjustment factor
    ris * (1.0 + heterogeneity)
}

/// Calculate cumulative Z-statistics
fn calculate_cumulative_z(studies: &[Study]) -> Vec<CumulativePoint> {
    let mut points = Vec::new();
    let mut cumulative_weighted_effect = 0.0;
    let mut cumulative_weight = 0.0;
    let mut cumulative_n = 0.0;

    for (i, study) in studies.iter().enumerate() {
        let weight = 1.0 / study.vi;
        cumulative_weighted_effect += study.yi * weight;
        cumulative_weight += weight;
        cumulative_n += study.ni.unwrap_or(0.0);

        let theta = cumulative_weighted_effect / cumulative_weight;
        let se = (1.0 / cumulative_weight).sqrt();
        let z = theta / se;

        points.push(CumulativePoint {
            study_index: i,
            study_id: study.id.clone(),
            cumulative_n,
            cumulative_effect: theta,
            cumulative_se: se,
            z_score: z,
            information: cumulative_weight,
        });
    }

    points
}

/// Calculate O'Brien-Fleming boundaries using Lan-DeMets spending
fn calculate_boundaries(config: &TSAConfig, daris: f64) -> TSABoundaries {
    let mut alpha_upper = Vec::new();
    let mut alpha_lower = Vec::new();
    let mut beta_boundary = Vec::new();

    // Calculate at standard information fractions
    let fractions = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0];

    for &t in &fractions {
        // O'Brien-Fleming spending function
        let spent_alpha = obf_spending(t, config.alpha);
        let z_upper = norm_quantile(1.0 - spent_alpha / 2.0);

        alpha_upper.push((t, z_upper));
        if !config.one_sided {
            alpha_lower.push((t, -z_upper));
        }

        // Beta spending for futility
        let spent_beta = obf_spending(t, config.beta);
        let z_futility = norm_quantile(spent_beta);
        beta_boundary.push((t, z_futility));
    }

    TSABoundaries {
        alpha_upper,
        alpha_lower,
        beta_boundary,
        boundary_type: "OBrien-Fleming".to_string(),
    }
}

/// O'Brien-Fleming alpha spending function
fn obf_spending(t: f64, alpha: f64) -> f64 {
    // α*(t) = 2 - 2Φ(z_{α/2} / √t)
    let z = norm_quantile(1.0 - alpha / 2.0);
    2.0 * (1.0 - norm_cdf(z / t.sqrt()))
}

/// Lan-DeMets O'Brien-Fleming approximation
fn lan_demets_obf(t: f64, alpha: f64) -> f64 {
    2.0 - 2.0 * norm_cdf(norm_quantile(1.0 - alpha / 2.0) / t.sqrt())
}

/// Generate monitoring points
fn generate_monitoring_points(
    cumulative: &[CumulativePoint],
    boundaries: &TSABoundaries,
    daris: f64,
) -> Vec<MonitoringPoint> {
    cumulative.iter().map(|point| {
        let info_frac = point.information / daris;
        let z = point.z_score;

        // Interpolate boundary at this information fraction
        let upper = interpolate_boundary(&boundaries.alpha_upper, info_frac);
        let lower = if boundaries.alpha_lower.is_empty() {
            None
        } else {
            Some(interpolate_boundary(&boundaries.alpha_lower, info_frac))
        };

        MonitoringPoint {
            information_fraction: info_frac,
            z_score: z,
            upper_boundary: upper,
            lower_boundary: lower,
            crossed_upper: z >= upper,
            crossed_lower: lower.map(|l| z <= l).unwrap_or(false),
            crossed_futility: false, // Would need beta boundary interpolation
        }
    }).collect()
}

/// Interpolate boundary value at given information fraction
fn interpolate_boundary(boundary: &[(f64, f64)], t: f64) -> f64 {
    if boundary.is_empty() {
        return norm_quantile(0.975);
    }

    // Find surrounding points
    for i in 1..boundary.len() {
        if t <= boundary[i].0 {
            let (t0, z0) = boundary[i - 1];
            let (t1, z1) = boundary[i];
            // Linear interpolation
            return z0 + (z1 - z0) * (t - t0) / (t1 - t0);
        }
    }

    // Beyond last point, use final value
    boundary.last().map(|&(_, z)| z).unwrap_or(1.96)
}

/// Determine TSA conclusion
fn determine_conclusion(
    monitoring: &[MonitoringPoint],
    info_fraction: f64,
    config: &TSAConfig,
) -> TSAConclusion {
    let last = monitoring.last();

    // Check if boundary crossed
    let crossed_upper = last.map(|m| m.crossed_upper).unwrap_or(false);
    let crossed_lower = last.map(|m| m.crossed_lower).unwrap_or(false);
    let sufficient_info = info_fraction >= 1.0;

    let (firm_evidence, direction, message) = if crossed_upper {
        (true, Some("benefit".to_string()),
         "Firm evidence of benefit: Sequential monitoring boundary crossed.".to_string())
    } else if crossed_lower {
        (true, Some("harm".to_string()),
         "Firm evidence of harm: Sequential monitoring boundary crossed.".to_string())
    } else if sufficient_info {
        (false, None,
         "Required information size reached. No significant effect detected.".to_string())
    } else {
        (false, None,
         format!("More data needed: {:.1}% of required information accumulated.",
                 info_fraction * 100.0))
    };

    TSAConclusion {
        firm_evidence,
        direction,
        sufficient_information: sufficient_info,
        message,
    }
}

// Statistical helpers

fn norm_cdf(x: f64) -> f64 {
    0.5 * (1.0 + erf(x / std::f64::consts::SQRT_2))
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

fn erf(x: f64) -> f64 {
    // Horner form coefficients for erf approximation
    let a1 =  0.254829592;
    let a2 = -0.284496736;
    let a3 =  1.421413741;
    let a4 = -1.453152027;
    let a5 =  1.061405429;
    let p  =  0.3275911;

    let sign = if x < 0.0 { -1.0 } else { 1.0 };
    let x = x.abs();

    let t = 1.0 / (1.0 + p * x);
    let y = 1.0 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * (-x * x).exp();

    sign * y
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_ris_calculation() {
        let config = TSAConfig::default();
        let ris = calculate_ris(&config);
        assert!(ris > 0.0);
        assert!(ris.is_finite());
    }

    #[test]
    fn test_obf_spending() {
        // At t=1, should spend full alpha
        let spent = obf_spending(1.0, 0.05);
        assert!((spent - 0.05).abs() < 0.01);

        // At t=0, should spend almost nothing
        let spent_early = obf_spending(0.1, 0.05);
        assert!(spent_early < 0.01);
    }

    #[test]
    fn test_cumulative_z() {
        let studies = vec![
            Study { id: "1".to_string(), yi: 0.2, vi: 0.04, sei: 0.2, ni: Some(100.0) },
            Study { id: "2".to_string(), yi: 0.3, vi: 0.05, sei: 0.22, ni: Some(80.0) },
        ];

        let cum = calculate_cumulative_z(&studies);
        assert_eq!(cum.len(), 2);
        assert!(cum[1].information > cum[0].information);
    }
}
