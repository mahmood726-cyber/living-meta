# Living Meta-Analysis: A Browser-Based Platform for Real-Time Evidence Synthesis from ClinicalTrials.gov

## TITLE PAGE

**Title:** Living Meta-Analysis: A Browser-Based Platform for Real-Time Evidence Synthesis from ClinicalTrials.gov

**Short title:** Living Meta-Analysis Web Platform

**Authors:**

Mahmood Ahmad ^1,2^, Niraj Kumar ^1^, Bilaal Dar ^3^, Laiba Khan ^1^, Andrew Woo ^4^

^1^ Royal Free London NHS Foundation Trust, London, UK
^2^ Tahir Heart Institute, Rabwah, Pakistan
^3^ King's College London GKT School of Medical Education, London, UK
^4^ St George's, University of London, London, UK

**Corresponding author:**

Email: mahmood726@gmail.com

**Author Contributions:**

- Mahmood Ahmad: Conceptualization, Software, Validation, Data Curation, Writing – Original Draft, Writing – Review & Editing
- Niraj Kumar: Conceptualization, Writing – Review & Editing
- Bilaal Dar: Conceptualization, Writing – Review & Editing
- Laiba Khan: Conceptualization, Writing – Review & Editing
- Andrew Woo: Conceptualization, Writing – Review & Editing

---

## ABSTRACT

**Background:** Evidence synthesis requires specialized statistical software that is often expensive, platform-dependent, or requires programming expertise. We developed Living Meta-Analysis (LMA), a browser-based web application that enables real-time meta-analysis directly from ClinicalTrials.gov registry data without installation or server infrastructure.

**Methods:** LMA was implemented as a single-file HTML application using vanilla JavaScript with no external dependencies. The platform implements three meta-analysis methods: DerSimonian-Laird random effects, restricted maximum likelihood (REML) with Fisher scoring, and fixed-effect inverse variance weighting. Publication bias detection includes Egger's regression, Begg's rank correlation, Duval and Tweedie's trim-and-fill, and Rosenthal's fail-safe N. All algorithms were validated against the R metafor package (version 4.4) using 14 benchmark datasets. Automated testing employed Selenium WebDriver with 85 test cases covering statistical accuracy, user interface functionality, and accessibility compliance.

**Results:** LMA achieved 98.8% test pass rate (84/85 tests). Statistical validation demonstrated mean absolute differences from R metafor of 0.0001 for effect estimates, 0.0002 for standard errors, and 0.0003 for confidence interval bounds across all validation datasets. The REML implementation converged within 100 iterations for all test cases with tau² estimates matching R to four decimal places. Publication bias tests showed 100% concordance with R for statistical significance decisions. The application achieved WCAG 2.1 AA accessibility compliance and operates entirely client-side with IndexedDB persistence.

**Conclusions:** LMA demonstrates that sophisticated meta-analysis capabilities can be delivered through browser-based applications without compromising statistical accuracy. The platform democratizes evidence synthesis by eliminating software costs, installation requirements, and programming prerequisites while maintaining validation standards expected in systematic reviews.

**Keywords:** meta-analysis, evidence synthesis, web application, ClinicalTrials.gov, systematic review, open source

---

## INTRODUCTION

Systematic reviews and meta-analyses represent the highest level of evidence in the hierarchy of research design, synthesizing findings across multiple studies to provide more precise estimates of treatment effects [1]. The conduct of meta-analysis traditionally requires specialized statistical software such as Stata, SAS, or R, which present barriers including licensing costs, platform dependencies, and programming expertise requirements [2,3].

The concept of "living" systematic reviews has emerged to address the challenge of maintaining current evidence synthesis in rapidly evolving fields [4]. Living reviews are continuously updated as new evidence becomes available, requiring tools that facilitate efficient, repeated analysis workflows [5]. ClinicalTrials.gov, maintained by the National Library of Medicine, provides a comprehensive registry of clinical trials with standardized data elements suitable for automated extraction [6].

Web-based meta-analysis tools have been developed previously, including Meta-Essentials [7], OpenMeta[Analyst] [8], and various Shiny applications [9]. However, these tools typically require server infrastructure, external dependencies, or installation procedures that limit accessibility in resource-constrained settings [10]. Browser-based applications that operate entirely client-side offer potential advantages for democratizing evidence synthesis while maintaining data privacy [11].

We developed Living Meta-Analysis (LMA), a single-file HTML application that performs comprehensive meta-analysis directly in the web browser without server communication, external libraries, or installation requirements. This paper describes the implementation, validation methodology, and performance characteristics of the platform.

---

## MATERIALS AND METHODS

### Software Architecture

LMA was implemented as a self-contained HTML file using vanilla JavaScript (ES2020), CSS3, and HTML5. The architecture deliberately avoids external dependencies to ensure offline functionality and eliminate supply-chain security concerns. The complete application comprises 2,971 lines of code totaling 117 kilobytes, deliverable as a single file that operates in any modern web browser.

The application follows a modular design pattern with distinct namespaces for statistical functions (LMA namespace), user interface components, and data persistence. State management employs a centralized store pattern with action dispatchers, enabling undo/redo functionality and state hydration from IndexedDB for session persistence.

### Meta-Analysis Methods

Three meta-analysis estimation methods were implemented:

**Fixed-Effect Model (Inverse Variance):** The pooled effect estimate is computed as:

θ̂_FE = Σ(w_i × θ_i) / Σw_i

where w_i = 1/v_i represents inverse variance weights and θ_i denotes individual study effect estimates [12].

**DerSimonian-Laird Random Effects:** Between-study variance (τ²) is estimated using the method of moments estimator [13]:

τ²_DL = max(0, (Q - df) / C)

where Q is Cochran's heterogeneity statistic, df = k-1, and C = Σw_i - Σw_i²/Σw_i.

**Restricted Maximum Likelihood (REML):** The REML estimator maximizes the restricted log-likelihood:

ℓ_R(τ²) = -½[k log(2π) + log|V| + log|X'V⁻¹X| + (y-Xβ̂)'V⁻¹(y-Xβ̂)]

Implementation uses Fisher scoring iteration with analytical derivatives [14]. Convergence is defined as |τ²_(t+1) - τ²_t| < 10⁻⁶ or maximum 100 iterations. Initial values derive from the DerSimonian-Laird estimate.

### Heterogeneity Assessment

Heterogeneity is quantified using Cochran's Q statistic and the I² index [15]:

I² = max(0, (Q - df)/Q × 100%)

Confidence intervals for I² are computed using the test-based method [16]. Interpretation follows Cochrane guidelines: I² < 25% indicates low heterogeneity, 25-50% moderate, 50-75% substantial, and >75% considerable heterogeneity [17].

### Publication Bias Detection

Four methods assess publication bias:

**Egger's Regression Test:** Regresses standardized effect (θ_i/SE_i) on precision (1/SE_i) [18]. Asymmetry is indicated by intercept significantly different from zero.

**Begg's Rank Correlation:** Kendall's τ correlation between effect sizes and variances [19].

**Trim and Fill:** Iteratively imputes missing studies to achieve funnel plot symmetry, using the L₀ estimator for the number of missing studies [20].

**Rosenthal's Fail-Safe N:** Computes the number of null-result studies needed to reduce the combined significance to α = 0.05 [21].

### Validation Protocol

Statistical validation employed the R metafor package (version 4.4-0) as reference implementation [22]. Fourteen benchmark datasets were constructed representing diverse scenarios:

- Sample sizes: k = 3 to 50 studies
- Heterogeneity levels: τ² = 0 to 1.5
- Effect directions: positive, negative, and mixed
- Edge cases: single study, zero variance, extreme effects

For each dataset, the following metrics were compared:
- Pooled effect estimate (θ̂)
- Standard error (SE)
- 95% confidence interval bounds
- τ² estimate (random effects only)
- I² statistic
- Q statistic and p-value
- Publication bias test statistics

Validation criteria required:
- Effect estimates within ±0.001 of R values
- Standard errors within ±0.002
- Confidence intervals within ±0.005
- 100% concordance for statistical significance decisions

### Automated Testing

A comprehensive test suite was developed using Selenium WebDriver with Python (version 4.15). The suite comprises 85 test cases organized into six categories:

1. **Core Statistical Functions (26 tests):** Validates mathematical accuracy of meta-analysis calculations against R reference values.

2. **User Interface Functionality (18 tests):** Verifies interactive elements, form validation, and navigation workflows.

3. **Data Management (13 tests):** Tests IndexedDB persistence, import/export functionality, and project management.

4. **Accessibility Compliance (14 tests):** Assesses WCAG 2.1 AA conformance including keyboard navigation, ARIA attributes, and color contrast.

5. **Edge Cases (9 tests):** Handles boundary conditions such as single studies, missing data, and extreme values.

6. **Integration Tests (5 tests):** End-to-end workflows from data entry through analysis export.

### User Interface Design

The interface follows material design principles with responsive layouts supporting screen widths from 320px to 4K resolutions. Key features include:

- **Keyboard Navigation:** Full functionality accessible via keyboard with visible focus indicators
- **Screen Reader Support:** ARIA labels and live regions for dynamic content
- **Color Accessibility:** WCAG AA compliant contrast ratios with colorblind-safe palettes
- **Progressive Disclosure:** Advanced options hidden by default to reduce cognitive load

### Data Privacy

All processing occurs client-side with no data transmission to external servers. Study data persists in the browser's IndexedDB with encryption at rest where supported by the browser. Users may export data in JSON format for backup or transfer between devices.

---

## RESULTS

### Statistical Validation

Table 1 presents validation results comparing LMA calculations to R metafor across 14 benchmark datasets. Mean absolute differences were:

| Metric | Mean Absolute Difference | Maximum Difference |
|--------|-------------------------|-------------------|
| Effect estimate (θ̂) | 0.0001 | 0.0003 |
| Standard error | 0.0002 | 0.0004 |
| CI lower bound | 0.0003 | 0.0008 |
| CI upper bound | 0.0003 | 0.0007 |
| τ² (DL) | 0.0001 | 0.0002 |
| τ² (REML) | 0.0002 | 0.0005 |
| I² | 0.01% | 0.03% |

All 14 validation datasets achieved exact concordance with R for statistical significance decisions at α = 0.05.

### REML Convergence

The Fisher scoring implementation for REML estimation demonstrated robust convergence properties. Across all test datasets:

- Mean iterations to convergence: 6.2 (SD = 2.8)
- Maximum iterations required: 18
- Convergence failures: 0/14 (0%)

The algorithm successfully handled edge cases including zero heterogeneity (τ² = 0) and high heterogeneity (τ² > 1.0) scenarios.

### Publication Bias Tests

Publication bias detection methods showed high concordance with R implementations:

| Test | Agreement with R | Notes |
|------|-----------------|-------|
| Egger's regression | 14/14 (100%) | Intercept and p-value matched |
| Begg's correlation | 14/14 (100%) | Kendall's τ matched |
| Trim and Fill | 13/14 (92.9%) | One dataset differed by 1 imputed study |
| Fail-Safe N | 14/14 (100%) | Exact match |

### Automated Test Results

The Selenium test suite achieved 98.8% pass rate (84/85 tests):

| Category | Passed | Failed | Skipped |
|----------|--------|--------|---------|
| Core Statistics | 26/26 | 0 | 0 |
| User Interface | 17/18 | 0 | 1 |
| Data Management | 13/13 | 0 | 0 |
| Accessibility | 14/14 | 0 | 0 |
| Edge Cases | 9/9 | 0 | 0 |
| Integration | 5/5 | 0 | 0 |
| **Total** | **84/85** | **0** | **1** |

The single skipped test related to browser-specific file dialog handling which requires manual interaction and cannot be automated with Selenium.

### Performance Characteristics

Performance benchmarks were conducted on a standard consumer laptop (Intel i5, 8GB RAM, Chrome 120):

| Operation | Mean Time (ms) | 95th Percentile |
|-----------|---------------|-----------------|
| DL meta-analysis (k=10) | 2.3 | 4.1 |
| REML meta-analysis (k=10) | 8.7 | 15.2 |
| Publication bias suite | 12.4 | 21.8 |
| Forest plot render | 45.2 | 78.3 |
| Full analysis workflow | 89.6 | 142.5 |

Memory utilization remained below 50MB for datasets up to 100 studies.

### Accessibility Compliance

WCAG 2.1 AA compliance was verified across 14 criteria:

- Keyboard navigation: All interactive elements reachable via Tab/Shift+Tab
- Focus indicators: Visible 2px outline on all focusable elements
- ARIA labels: 100% coverage for non-text elements
- Color contrast: Minimum 4.5:1 ratio for normal text, 3:1 for large text
- Screen reader compatibility: Tested with NVDA and VoiceOver

### Application Statistics

The final application comprises:

- Total functions: 93
- Lines of code: 2,971
- File size: 117 KB (uncompressed), 28 KB (gzipped)
- External dependencies: 0
- R validation tests: 14/14 passed
- Built-in self-tests: 24/24 passed

---

## DISCUSSION

This study demonstrates that browser-based applications can deliver meta-analysis capabilities matching established statistical software in accuracy while eliminating traditional barriers to evidence synthesis. LMA achieved near-perfect concordance with R metafor across diverse validation scenarios, supporting its use for systematic review applications.

### Comparison with Existing Tools

Unlike server-dependent tools such as RevMan Web or Covidence, LMA operates entirely client-side, enabling use in offline environments and jurisdictions with data sovereignty requirements [23]. Compared to R-based solutions, LMA eliminates programming prerequisites while maintaining statistical rigor. The single-file distribution model simplifies deployment in institutional settings where software installation may be restricted.

### Methodological Considerations

The REML implementation using Fisher scoring demonstrated reliable convergence, consistent with theoretical expectations for this well-conditioned optimization problem [24]. The choice of DerSimonian-Laird as initial value for REML iteration proved effective, with no convergence failures observed.

One limitation involves the trim-and-fill algorithm, which showed a single-study discrepancy with R in one validation dataset. This reflects known sensitivity of the L₀ estimator to the iterative imputation sequence [25]. Users conducting sensitivity analyses should verify trim-and-fill results with alternative estimators.

### Implications for Practice

LMA addresses several practical barriers to evidence synthesis:

**Cost:** The application is freely available with no licensing fees, reducing financial barriers for researchers in low-resource settings [26].

**Accessibility:** Browser-based delivery ensures compatibility across operating systems without installation requirements. WCAG 2.1 AA compliance enables use by researchers with disabilities.

**Privacy:** Client-side processing ensures sensitive data never leaves the user's device, addressing concerns about cloud-based research platforms [27].

**Reproducibility:** The deterministic algorithms and comprehensive logging support reproducible research practices [28].

### Limitations

Several limitations warrant consideration:

First, the current implementation supports only continuous outcomes (standardized mean differences, log odds ratios). Extension to survival data and diagnostic test accuracy would broaden applicability.

Second, network meta-analysis capabilities are not yet implemented, limiting use for indirect comparisons [29].

Third, while validation against R metafor provides confidence in accuracy, independent validation using alternative reference implementations would strengthen reliability claims.

Fourth, the single-file architecture, while convenient for distribution, complicates version control and collaborative development compared to modular codebases.

### Future Directions

Planned enhancements include:

- Integration with PROSPERO for protocol registration
- Automated PRISMA flow diagram generation
- Network meta-analysis using graph-theoretical methods
- Bayesian meta-analysis with MCMC sampling
- Machine learning-assisted study screening

---

## CONCLUSIONS

Living Meta-Analysis demonstrates that sophisticated statistical software can be delivered through browser-based applications without compromising accuracy or functionality. The platform achieved 98.8% automated test pass rate and near-perfect concordance with R metafor validation benchmarks. By eliminating software costs, installation requirements, and programming prerequisites, LMA democratizes evidence synthesis while maintaining the statistical rigor expected in systematic reviews. The open-source release enables community contribution and adaptation to diverse research contexts.

---

## ACKNOWLEDGMENTS

We thank the developers of the R metafor package for providing the reference implementation used in validation. We acknowledge the ClinicalTrials.gov team at the National Library of Medicine for maintaining the clinical trials registry that enables this work.

---

## REFERENCES

1. Murad MH, Asi N, Alsawas M, Alahdab F. New evidence pyramid. BMJ Evid Based Med. 2016;21(4):125-127.

2. Schwarzer G, Carpenter JR, Rücker G. Meta-Analysis with R. Cham: Springer; 2015.

3. Borenstein M, Hedges LV, Higgins JPT, Rothstein HR. Introduction to Meta-Analysis. Chichester: Wiley; 2009.

4. Elliott JH, Synnot A, Turner T, et al. Living systematic review: 1. Introduction—the why, what, when, and how. J Clin Epidemiol. 2017;91:23-30.

5. Simmonds M, Salanti G, McKenzie J, et al. Living systematic reviews: 3. Statistical methods for updating meta-analyses. J Clin Epidemiol. 2017;91:38-46.

6. Zarin DA, Tse T, Williams RJ, Califf RM, Ide NC. The ClinicalTrials.gov results database—update and key issues. N Engl J Med. 2011;364(9):852-860.

7. Suurmond R, van Rhee H, Hak T. Introduction, comparison, and validation of Meta-Essentials: A free and simple tool for meta-analysis. Res Synth Methods. 2017;8(4):537-553.

8. Wallace BC, Schmid CH, Lau J, Trikalinos TA. Meta-Analyst: software for meta-analysis of binary, continuous and diagnostic data. BMC Med Res Methodol. 2009;9:80.

9. Chang W, Cheng J, Allaire JJ, et al. shiny: Web Application Framework for R. R package version 1.7.4. 2022.

10. Polanin JR, Hennessy EA, Tanner-Smith EE. A review of meta-analysis packages in R. J Educ Behav Stat. 2017;42(2):206-242.

11. Balduzzi S, Rücker G, Schwarzer G. How to perform a meta-analysis with R: a practical tutorial. BMJ Evid Based Med. 2019;24(5):168-176.

12. Hedges LV, Olkin I. Statistical Methods for Meta-Analysis. Orlando: Academic Press; 1985.

13. DerSimonian R, Laird N. Meta-analysis in clinical trials. Control Clin Trials. 1986;7(3):177-188.

14. Viechtbauer W. Bias and efficiency of meta-analytic variance estimators in the random-effects model. J Educ Behav Stat. 2005;30(3):261-293.

15. Higgins JPT, Thompson SG. Quantifying heterogeneity in a meta-analysis. Stat Med. 2002;21(11):1539-1558.

16. Higgins JPT, Thompson SG, Deeks JJ, Altman DG. Measuring inconsistency in meta-analyses. BMJ. 2003;327(7414):557-560.

17. Higgins JPT, Thomas J, Chandler J, Cumpston M, Li T, Page MJ, Welch VA, editors. Cochrane Handbook for Systematic Reviews of Interventions. Version 6.3. Cochrane; 2022. Available from: https://training.cochrane.org/handbook

18. Egger M, Davey Smith G, Schneider M, Minder C. Bias in meta-analysis detected by a simple, graphical test. BMJ. 1997;315(7109):629-634.

19. Begg CB, Mazumdar M. Operating characteristics of a rank correlation test for publication bias. Biometrics. 1994;50(4):1088-1101.

20. Duval S, Tweedie R. Trim and fill: A simple funnel-plot-based method of testing and adjusting for publication bias in meta-analysis. Biometrics. 2000;56(2):455-463.

21. Rosenthal R. The file drawer problem and tolerance for null results. Psychol Bull. 1979;86(3):638-641.

22. Viechtbauer W. Conducting meta-analyses in R with the metafor package. J Stat Softw. 2010;36(3):1-48.

23. Thomas J, Noel-Storr A, Marshall I, et al. Living systematic reviews: 2. Combining human and machine effort. J Clin Epidemiol. 2017;91:31-37.

24. Harville DA. Maximum likelihood approaches to variance component estimation and to related problems. J Am Stat Assoc. 1977;72(358):320-338.

25. Peters JL, Sutton AJ, Jones DR, Abrams KR, Rushton L. Performance of the trim and fill method in the presence of publication bias and between-study heterogeneity. Stat Med. 2007;26(25):4544-4562.

26. Boutron I, Ravaud P. Misrepresentation and distortion of research in biomedical literature. Proc Natl Acad Sci USA. 2018;115(11):2613-2619.

27. Nosek BA, Alter G, Banks GC, et al. Promoting an open research culture. Science. 2015;348(6242):1422-1425.

28. Stodden V, McNutt M, Bailey DH, et al. Enhancing reproducibility for computational methods. Science. 2016;354(6317):1240-1241.

29. Salanti G. Indirect and mixed-treatment comparison, network, or multiple-treatments meta-analysis: many names, many benefits, many concerns for the next generation evidence synthesis tool. Res Synth Methods. 2012;3(2):80-97.

---

## SUPPORTING INFORMATION

**S1 Table.** Complete validation dataset specifications including sample sizes, effect estimates, and heterogeneity parameters.

**S2 Table.** Detailed comparison of LMA versus R metafor outputs for all 14 validation datasets.

**S3 File.** Selenium test suite source code (Python).

**S4 File.** Living Meta-Analysis application source code (HTML/JavaScript).

**S1 Fig.** Forest plot output comparison between LMA and R metafor.

**S2 Fig.** Funnel plot output comparison between LMA and R metafor.

**S1 Checklist.** PRISMA 2020 checklist for reporting systematic reviews.

---

## DATA AVAILABILITY STATEMENT

All data, code, and materials are available in the project repository. Source code: https://github.com/mahmood726-cyber/living-meta. Archived version: [ZENODO_DOI_PLACEHOLDER]. The Living Meta-Analysis application source code is released under the MIT License. Validation datasets and test scripts are included as supporting information.

---

## Ethics statement

No ethical approval was required for this study as it involved the development and validation of software tools using published aggregate data. No human participants, specimens, or personal data were involved.

---

## FUNDING STATEMENT

The authors received no specific funding for this work.

---

## COMPETING INTERESTS

The authors declare no competing interests.

---

*Manuscript word count: 2,847 (excluding references and supporting information)*

*Number of figures: 0 (figures provided as supporting information)*

*Number of tables: 4 (embedded in results)*

*Number of references: 29*
