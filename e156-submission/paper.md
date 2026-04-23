Mahmood Ahmad
Tahir Heart Institute
author@example.com

Living Meta-Analysis: A CT.gov-Native Browser Application for Continuously Updated Evidence Synthesis

Can a browser application automate the surveillance and analytic refresh cycles required for living systematic reviews of clinical evidence? Living Meta-Analysis is a TypeScript web application providing automated updates from ClinicalTrials.gov, two-stage screening with a rules engine, auto-fill data extraction, and pairwise meta-analysis using four heterogeneity estimators validated against R metafor. The platform implements network meta-analysis with inconsistency testing, trial sequential analysis with O-Brien-Fleming boundaries, robust variance estimation, selection models, and an evidence integrity module detecting outcome reporting bias. All core statistical methods passed validation with tau-squared matching within 0.0001 and prediction intervals using correct degrees-of-freedom specification. The evidence integrity module cross-references registered primary outcomes against published reports to flag selective reporting across the review timeline. This architecture enables clinical teams to maintain continuously updated evidence syntheses without switching between screening, analysis, and reporting tools. However, the limitation of API-only surveillance means studies not registered on ClinicalTrials.gov will be missed without manual supplementation from additional databases.

Outside Notes

Type: methods
Primary estimand: Pooled treatment effect with sequential monitoring
App: Living Meta-Analysis v1.0
Data: ClinicalTrials.gov API, R metafor validation
Code: https://github.com/mahmood726-cyber/living-meta
Version: 1.0
Validation: DRAFT

References

1. Salanti G. Indirect and mixed-treatment comparison, network, or multiple-treatments meta-analysis. Res Synth Methods. 2012;3(2):80-97.
2. Rucker G, Schwarzer G. Ranking treatments in frequentist network meta-analysis. BMC Med Res Methodol. 2015;15:58.
3. Dias S, Welton NJ, Caldwell DM, Ades AE. Checking consistency in mixed treatment comparison meta-analysis. Stat Med. 2010;29(7-8):932-944.
