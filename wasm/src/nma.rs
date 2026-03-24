//! Network Meta-Analysis (NMA) Module
//!
//! Placeholder for frequentist NMA implementation.
//! Full implementation coming in Milestone 7.

use serde::{Serialize, Deserialize};

/// Treatment node in network
#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct Treatment {
    pub id: String,
    pub name: String,
    pub is_reference: bool,
}

/// Direct comparison in network
#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct Comparison {
    pub treatment1: String,
    pub treatment2: String,
    pub effect: f64,      // Log-scale effect
    pub variance: f64,
    pub num_studies: usize,
}

/// Network structure
#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct Network {
    pub treatments: Vec<Treatment>,
    pub comparisons: Vec<Comparison>,
    pub is_connected: bool,
    pub num_loops: usize,
}

/// NMA result structure
#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct NMAResult {
    pub network: Network,
    pub relative_effects: Vec<RelativeEffect>,
    pub league_table: Vec<Vec<LeagueTableCell>>,
    pub rankings: Vec<TreatmentRanking>,
    pub heterogeneity: HeterogeneityStats,
    pub inconsistency: InconsistencyResult,
}

/// Relative effect between treatments
#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct RelativeEffect {
    pub treatment1: String,
    pub treatment2: String,
    pub effect: f64,
    pub se: f64,
    pub ci_lower: f64,
    pub ci_upper: f64,
    pub direct: bool,
    pub indirect: bool,
}

/// League table cell
#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct LeagueTableCell {
    pub effect: f64,
    pub ci_lower: f64,
    pub ci_upper: f64,
}

/// Treatment ranking
#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct TreatmentRanking {
    pub treatment: String,
    pub mean_rank: f64,
    pub sucra: f64,
    pub p_best: f64,
    pub rank_probabilities: Vec<f64>,
}

/// Heterogeneity statistics
#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct HeterogeneityStats {
    pub tau2: f64,
    pub tau: f64,
    pub i2: f64,
    pub q: f64,
    pub df: usize,
    pub p_value: f64,
}

/// Inconsistency assessment
#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct InconsistencyResult {
    pub global_q: f64,
    pub global_p: f64,
    pub node_splits: Vec<NodeSplit>,
    pub has_inconsistency: bool,
}

/// Node-splitting result
#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct NodeSplit {
    pub comparison: String,
    pub direct_effect: f64,
    pub indirect_effect: f64,
    pub difference: f64,
    pub p_value: f64,
}

/// Build network from comparisons
pub fn build_network(
    treatments: Vec<Treatment>,
    comparisons: Vec<Comparison>,
) -> Result<Network, String> {
    if treatments.is_empty() {
        return Err("No treatments provided".to_string());
    }

    if comparisons.is_empty() {
        return Err("No comparisons provided".to_string());
    }

    // Check connectivity using union-find
    let is_connected = check_connectivity(&treatments, &comparisons);

    // Count closed loops
    let num_loops = count_loops(&treatments, &comparisons);

    Ok(Network {
        treatments,
        comparisons,
        is_connected,
        num_loops,
    })
}

/// Check if network is connected
fn check_connectivity(treatments: &[Treatment], comparisons: &[Comparison]) -> bool {
    if treatments.len() <= 1 {
        return true;
    }

    // Simple BFS/DFS connectivity check
    let mut visited = std::collections::HashSet::new();
    let mut queue = std::collections::VecDeque::new();

    // Start from first treatment
    queue.push_back(&treatments[0].id);

    while let Some(current) = queue.pop_front() {
        if visited.contains(current) {
            continue;
        }
        visited.insert(current.clone());

        // Find all connected treatments
        for comp in comparisons {
            if &comp.treatment1 == current && !visited.contains(&comp.treatment2) {
                queue.push_back(&comp.treatment2);
            }
            if &comp.treatment2 == current && !visited.contains(&comp.treatment1) {
                queue.push_back(&comp.treatment1);
            }
        }
    }

    visited.len() == treatments.len()
}

/// Count number of independent loops in network
fn count_loops(treatments: &[Treatment], comparisons: &[Comparison]) -> usize {
    // Number of loops = edges - vertices + 1 (for connected graph)
    let n = treatments.len();
    let e = comparisons.len();
    if e > n { e - n + 1 } else { 0 }
}

/// Run NMA analysis (placeholder - returns empty result)
pub fn run_nma(network: &Network) -> Result<NMAResult, String> {
    if !network.is_connected {
        return Err("Network is not connected. Cannot perform NMA.".to_string());
    }

    // Placeholder implementation
    // Full frequentist NMA will be implemented in Milestone 7

    Ok(NMAResult {
        network: network.clone(),
        relative_effects: Vec::new(),
        league_table: Vec::new(),
        rankings: Vec::new(),
        heterogeneity: HeterogeneityStats {
            tau2: 0.0,
            tau: 0.0,
            i2: 0.0,
            q: 0.0,
            df: 0,
            p_value: 1.0,
        },
        inconsistency: InconsistencyResult {
            global_q: 0.0,
            global_p: 1.0,
            node_splits: Vec::new(),
            has_inconsistency: false,
        },
    })
}

/// Calculate SUCRA (Surface Under Cumulative Ranking)
pub fn calculate_sucra(rank_probs: &[f64]) -> f64 {
    if rank_probs.is_empty() {
        return 0.0;
    }

    let n = rank_probs.len();
    let mut cumulative = 0.0;
    let mut sucra = 0.0;

    for prob in rank_probs.iter().take(n - 1) {
        cumulative += prob;
        sucra += cumulative;
    }

    sucra / (n - 1) as f64
}

/// Validate network requirements for NMA
pub fn validate_network(network: &Network) -> Vec<String> {
    let mut warnings = Vec::new();

    if !network.is_connected {
        warnings.push("Network is disconnected. Some treatments cannot be compared.".to_string());
    }

    if network.num_loops == 0 {
        warnings.push("Network has no closed loops. Cannot assess inconsistency.".to_string());
    }

    // Check for sparse comparisons
    for comp in &network.comparisons {
        if comp.num_studies < 2 {
            warnings.push(format!(
                "Comparison {}-{} has only {} study. Results may be imprecise.",
                comp.treatment1, comp.treatment2, comp.num_studies
            ));
        }
    }

    // Check for treatments with single connection
    let mut connection_count: std::collections::HashMap<&str, usize> = std::collections::HashMap::new();
    for comp in &network.comparisons {
        *connection_count.entry(&comp.treatment1).or_insert(0) += 1;
        *connection_count.entry(&comp.treatment2).or_insert(0) += 1;
    }

    for treatment in &network.treatments {
        let count = connection_count.get(treatment.id.as_str()).unwrap_or(&0);
        if *count == 1 {
            warnings.push(format!(
                "Treatment '{}' has only one connection. Consider excluding or note limitations.",
                treatment.name
            ));
        }
    }

    warnings
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_connectivity() {
        let treatments = vec![
            Treatment { id: "A".to_string(), name: "A".to_string(), is_reference: true },
            Treatment { id: "B".to_string(), name: "B".to_string(), is_reference: false },
            Treatment { id: "C".to_string(), name: "C".to_string(), is_reference: false },
        ];

        let connected_comps = vec![
            Comparison { treatment1: "A".to_string(), treatment2: "B".to_string(), effect: 0.1, variance: 0.01, num_studies: 2 },
            Comparison { treatment1: "B".to_string(), treatment2: "C".to_string(), effect: 0.2, variance: 0.01, num_studies: 2 },
        ];

        assert!(check_connectivity(&treatments, &connected_comps));

        // Disconnected network
        let disconnected_comps = vec![
            Comparison { treatment1: "A".to_string(), treatment2: "B".to_string(), effect: 0.1, variance: 0.01, num_studies: 2 },
        ];

        assert!(!check_connectivity(&treatments, &disconnected_comps));
    }

    #[test]
    fn test_sucra() {
        // Best treatment: all probability on rank 1
        assert!((calculate_sucra(&[1.0, 0.0, 0.0]) - 1.0).abs() < 0.01);

        // Worst treatment: all probability on last rank
        assert!((calculate_sucra(&[0.0, 0.0, 1.0]) - 0.0).abs() < 0.01);

        // Uniform distribution
        let uniform_sucra = calculate_sucra(&[0.33, 0.34, 0.33]);
        assert!(uniform_sucra > 0.4 && uniform_sucra < 0.6);
    }
}
