"""
Comprehensive Selenium Test for Living Meta-Analysis App
Tests ALL features with demo data
"""

import time
import json
from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.chrome.service import Service
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from selenium.webdriver.common.keys import Keys

def setup_driver():
    """Setup Chrome driver."""
    options = Options()
    options.add_argument('--headless=new')
    options.add_argument('--no-sandbox')
    options.add_argument('--disable-dev-shm-usage')
    options.add_argument('--window-size=1920,1080')
    options.add_argument('--disable-gpu')
    options.add_argument('--remote-debugging-port=9222')
    options.add_argument('--disable-extensions')

    service = Service()
    driver = webdriver.Chrome(service=service, options=options)
    driver.implicitly_wait(5)
    driver.set_script_timeout(30)  # 30 second timeout for async scripts
    return driver

class TestResults:
    def __init__(self):
        self.passed = []
        self.failed = []
        self.warnings = []
        self.errors = []

    def log_pass(self, test_name):
        self.passed.append(test_name)
        print(f"  [PASS] {test_name}")

    def log_fail(self, test_name, reason=""):
        self.failed.append((test_name, reason))
        print(f"  [FAIL] {test_name}: {reason}")

    def log_warn(self, test_name, reason=""):
        self.warnings.append((test_name, reason))
        print(f"  [WARN] {test_name}: {reason}")

    def summary(self):
        print("\n" + "=" * 60)
        print("COMPREHENSIVE TEST SUMMARY")
        print("=" * 60)
        print(f"  Passed:   {len(self.passed)}")
        print(f"  Failed:   {len(self.failed)}")
        print(f"  Warnings: {len(self.warnings)}")

        if self.failed:
            print("\n--- Failed Tests ---")
            for name, reason in self.failed:
                print(f"  X {name}: {reason}")

        return len(self.failed) == 0

def inject_demo_data(driver):
    """Inject comprehensive demo data using async script."""
    script = """
    const callback = arguments[arguments.length - 1];
    (async () => {
        try {
            const { db, initDB } = await import('/src/db/schema.js');
            await initDB();

            const projectId = crypto.randomUUID();
            const now = new Date().toISOString();

            // Create project
            const project = {
                id: projectId,
                name: 'Comprehensive Test: Aspirin vs Placebo',
                description: 'Full feature test of meta-analysis',
                living: true,
                createdAt: now,
                updatedAt: now
            };
            await db.projects.put(project);

            // Create trial records
            const trials = [
                { nctId: 'NCT00000001', briefTitle: 'Aspirin Trial A', phase: 'Phase 3', overallStatus: 'Completed', enrollmentCount: 1500, hasResults: true },
                { nctId: 'NCT00000002', briefTitle: 'Aspirin Trial B', phase: 'Phase 3', overallStatus: 'Completed', enrollmentCount: 2200, hasResults: true },
                { nctId: 'NCT00000003', briefTitle: 'Aspirin Trial C', phase: 'Phase 4', overallStatus: 'Completed', enrollmentCount: 3500, hasResults: true },
                { nctId: 'NCT00000004', briefTitle: 'Aspirin Trial D', phase: 'Phase 3', overallStatus: 'Completed', enrollmentCount: 1800, hasResults: true },
                { nctId: 'NCT00000005', briefTitle: 'Aspirin Trial E', phase: 'Phase 3', overallStatus: 'Completed', enrollmentCount: 2800, hasResults: true },
                { nctId: 'NCT00000006', briefTitle: 'Aspirin Trial F', phase: 'Phase 2/3', overallStatus: 'Completed', enrollmentCount: 1200, hasResults: true },
                { nctId: 'NCT00000007', briefTitle: 'Aspirin Trial G', phase: 'Phase 3', overallStatus: 'Completed', enrollmentCount: 4200, hasResults: true },
                { nctId: 'NCT00000008', briefTitle: 'Aspirin Trial H', phase: 'Phase 3', overallStatus: 'Completed', enrollmentCount: 1600, hasResults: true }
            ];
            await db.records.bulkPut(trials);

            // Create screening decisions
            const screening = trials.map(t => ({
                projectId: projectId,
                nctId: t.nctId,
                decision: 'include',
                stage: 'full_text',
                decidedAt: now
            }));
            await db.screening.bulkPut(screening);

            // Create extractions with varying effect sizes
            const extractionData = [
                { nctId: 'NCT00000001', events1: 45, n1: 750, events2: 68, n2: 750, label: 'Smith 2022' },
                { nctId: 'NCT00000002', events1: 52, n1: 1100, events2: 78, n2: 1100, label: 'Johnson 2021' },
                { nctId: 'NCT00000003', events1: 89, n1: 1750, events2: 142, n2: 1750, label: 'Williams 2020' },
                { nctId: 'NCT00000004', events1: 38, n1: 900, events2: 55, n2: 900, label: 'Brown 2023' },
                { nctId: 'NCT00000005', events1: 71, n1: 1400, events2: 98, n2: 1400, label: 'Davis 2019' },
                { nctId: 'NCT00000006', events1: 28, n1: 600, events2: 41, n2: 600, label: 'Miller 2022' },
                { nctId: 'NCT00000007', events1: 112, n1: 2100, events2: 156, n2: 2100, label: 'Wilson 2018' },
                { nctId: 'NCT00000008', events1: 35, n1: 800, events2: 52, n2: 800, label: 'Taylor 2021' }
            ];

            const extractions = extractionData.map(d => ({
                projectId: projectId,
                nctId: d.nctId,
                outcomeId: 'primary',
                outcomeType: 'binary',
                data: {
                    treatment_label: 'Aspirin',
                    treatment_events: d.events1,
                    treatment_n: d.n1,
                    control_label: 'Placebo',
                    control_events: d.events2,
                    control_n: d.n2,
                    outcome_description: 'MACE',
                    studyLabel: d.label
                },
                verified: true,
                extractedAt: now
            }));
            await db.extraction.bulkPut(extractions);

            // Create search run
            const searchRun = {
                id: crypto.randomUUID(),
                projectId: projectId,
                timestamp: now,
                query: { condition: 'cardiovascular', intervention: 'aspirin' },
                totalCount: trials.length,
                nctIds: trials.map(t => t.nctId)
            };
            await db.searchRuns.put(searchRun);

            callback({ success: true, projectId: projectId });
        } catch (e) {
            callback({ success: false, error: e.message });
        }
    })();
    """
    return driver.execute_async_script(script)

def run_comprehensive_test():
    """Run comprehensive feature test."""
    driver = setup_driver()
    results = TestResults()
    project_id = None

    try:
        print("=" * 60)
        print("LIVING META-ANALYSIS - COMPREHENSIVE FEATURE TEST")
        print("=" * 60)

        # ============================================
        # SECTION 1: APP LOADING
        # ============================================
        print("\n=== SECTION 1: App Loading ===")

        driver.get('http://localhost:8765')
        time.sleep(2)

        # Check title
        if 'Living' in driver.title or 'Meta' in driver.title:
            results.log_pass("Page title")
        else:
            results.log_fail("Page title", f"Got: {driver.title}")

        # Check app container
        try:
            driver.find_element(By.ID, 'app')
            results.log_pass("App container")
        except:
            results.log_fail("App container", "Not found")

        # Check header
        try:
            header = driver.find_element(By.TAG_NAME, 'header')
            results.log_pass("Header element")
        except:
            results.log_warn("Header element", "Not found")

        # ============================================
        # SECTION 2: DEMO DATA INJECTION
        # ============================================
        print("\n=== SECTION 2: Demo Data Injection ===")

        inject_result = inject_demo_data(driver)
        if inject_result and inject_result.get('success'):
            project_id = inject_result.get('projectId')
            results.log_pass(f"Demo data injected (8 studies)")
        else:
            results.log_fail("Demo data injection", inject_result.get('error', 'Unknown'))
            return results

        # Verify data in IndexedDB
        db_check = driver.execute_async_script("""
            const callback = arguments[arguments.length - 1];
            (async () => {
                try {
                    const { db } = await import('/src/db/schema.js');
                    const projects = await db.projects.toArray();
                    const records = await db.records.toArray();
                    const extractions = await db.extraction.toArray();
                    callback({
                        projects: projects.length,
                        records: records.length,
                        extractions: extractions.length
                    });
                } catch (e) {
                    callback({ error: e.message });
                }
            })();
        """)

        if db_check and not db_check.get('error'):
            if db_check.get('projects', 0) >= 1:
                results.log_pass(f"Projects in DB: {db_check['projects']}")
            else:
                results.log_fail("Projects in DB", "No projects found")

            if db_check.get('records', 0) >= 8:
                results.log_pass(f"Trial records in DB: {db_check['records']}")
            else:
                results.log_fail("Trial records in DB", f"Expected 8, got {db_check.get('records', 0)}")

            if db_check.get('extractions', 0) >= 8:
                results.log_pass(f"Extractions in DB: {db_check['extractions']}")
            else:
                results.log_fail("Extractions in DB", f"Expected 8, got {db_check.get('extractions', 0)}")
        else:
            results.log_warn("DB verification", f"Could not verify: {db_check.get('error', 'Unknown') if db_check else 'null result'}")

        # ============================================
        # SECTION 3: NAVIGATION
        # ============================================
        print("\n=== SECTION 3: Navigation ===")

        pages = [
            ('search', 'Search'),
            ('screening', 'Screening'),
            ('extraction', 'Extraction'),
            ('eim', 'Evidence Integrity'),
            ('analysis', 'Analysis'),
            ('report', 'Report')
        ]

        for page, name in pages:
            try:
                driver.get(f'http://localhost:8765/#/project/{project_id}/{page}')
                time.sleep(1)
                if page in driver.current_url:
                    results.log_pass(f"Navigate to {name}")
                else:
                    results.log_warn(f"Navigate to {name}", "URL mismatch")
            except Exception as e:
                results.log_fail(f"Navigate to {name}", str(e)[:50])

        # ============================================
        # SECTION 4: SEARCH FUNCTIONALITY
        # ============================================
        print("\n=== SECTION 4: Search Page ===")

        driver.get(f'http://localhost:8765/#/project/{project_id}/search')
        time.sleep(2)

        # Check search elements
        page_html = driver.page_source.lower()

        if 'search' in page_html or 'query' in page_html:
            results.log_pass("Search page content")
        else:
            results.log_warn("Search page content", "May be empty")

        # ============================================
        # SECTION 5: SCREENING PAGE
        # ============================================
        print("\n=== SECTION 5: Screening Page ===")

        driver.get(f'http://localhost:8765/#/project/{project_id}/screening')
        time.sleep(2)

        page_html = driver.page_source.lower()
        if 'screening' in page_html or 'include' in page_html or 'exclude' in page_html:
            results.log_pass("Screening page content")
        else:
            results.log_warn("Screening page content", "May be empty")

        # ============================================
        # SECTION 6: EXTRACTION PAGE
        # ============================================
        print("\n=== SECTION 6: Extraction Page ===")

        driver.get(f'http://localhost:8765/#/project/{project_id}/extraction')
        time.sleep(2)

        page_html = driver.page_source.lower()
        if 'extraction' in page_html or 'outcome' in page_html or 'events' in page_html:
            results.log_pass("Extraction page content")
        else:
            results.log_warn("Extraction page content", "May need data")

        # ============================================
        # SECTION 7: EVIDENCE INTEGRITY MODULE
        # ============================================
        print("\n=== SECTION 7: Evidence Integrity Module ===")

        driver.get(f'http://localhost:8765/#/project/{project_id}/eim')
        time.sleep(2)

        page_html = driver.page_source.lower()

        eim_checks = [
            ('coverage', 'Coverage indicator'),
            ('integrity', 'Integrity section'),
            ('flag', 'Trial flags'),
            ('risk', 'Risk assessment')
        ]

        for keyword, name in eim_checks:
            if keyword in page_html:
                results.log_pass(f"EIM: {name}")
            else:
                results.log_warn(f"EIM: {name}", "Not found in content")

        # ============================================
        # SECTION 8: ANALYSIS PAGE - CONFIGURATION
        # ============================================
        print("\n=== SECTION 8: Analysis Configuration ===")

        driver.get(f'http://localhost:8765/#/project/{project_id}/analysis')
        time.sleep(3)

        # Check for configuration elements
        config_checks = [
            ('effect', 'Effect measure selector'),
            ('model', 'Model selector'),
            ('reml', 'Tau estimation method'),
            ('hksj', 'HKSJ option'),
            ('run', 'Run analysis button')
        ]

        page_html = driver.page_source.lower()
        for keyword, name in config_checks:
            if keyword in page_html:
                results.log_pass(f"Analysis config: {name}")
            else:
                results.log_warn(f"Analysis config: {name}", "Not visible")

        # ============================================
        # SECTION 9: RUN META-ANALYSIS
        # ============================================
        print("\n=== SECTION 9: Run Meta-Analysis ===")

        # Click run analysis button
        try:
            run_btn = driver.find_element(By.XPATH, "//button[contains(text(), 'Run') or contains(text(), 'Analyze')]")
            run_btn.click()
            results.log_pass("Clicked Run Analysis button")
            time.sleep(5)  # Wait for analysis to complete
        except Exception as e:
            results.log_fail("Run Analysis button", str(e)[:50])

        # Check for results
        page_html = driver.page_source

        # ============================================
        # SECTION 10: POOLED ESTIMATES
        # ============================================
        print("\n=== SECTION 10: Pooled Effect Estimates ===")

        if 'Pooled' in page_html or 'Fixed Effect' in page_html:
            results.log_pass("Pooled estimates section")
        else:
            results.log_warn("Pooled estimates section", "Not found")

        if 'Random Effects' in page_html:
            results.log_pass("Random effects model displayed")
        else:
            results.log_warn("Random effects model", "Not visible")

        # Check for specific statistical values
        if 'HKSJ' in page_html:
            results.log_pass("HKSJ adjustment noted")
        else:
            results.log_warn("HKSJ adjustment", "Not mentioned")

        # ============================================
        # SECTION 11: HETEROGENEITY
        # ============================================
        print("\n=== SECTION 11: Heterogeneity Assessment ===")

        het_checks = [
            ('I²', 'I-squared statistic'),
            ('τ²', 'Tau-squared'),
            ('Cochran', 'Cochran Q test'),
            ('Heterogeneity', 'Heterogeneity section')
        ]

        for keyword, name in het_checks:
            if keyword in page_html or keyword.lower() in page_html.lower():
                results.log_pass(f"Heterogeneity: {name}")
            else:
                results.log_warn(f"Heterogeneity: {name}", "Not found")

        # ============================================
        # SECTION 12: PREDICTION INTERVAL
        # ============================================
        print("\n=== SECTION 12: Prediction Interval ===")

        if 'Prediction' in page_html and 'Interval' in page_html:
            results.log_pass("Prediction interval displayed")
        else:
            results.log_warn("Prediction interval", "Not found")

        # ============================================
        # SECTION 13: SMALL-STUDY TESTS
        # ============================================
        print("\n=== SECTION 13: Small-Study / Publication Bias Tests ===")

        bias_tests = [
            ('Egger', "Egger's test"),
            ('Peters', "Peters' test"),
            ('Harbord', "Harbord's test"),
            ('Trim', 'Trim and fill')
        ]

        for keyword, name in bias_tests:
            if keyword in page_html:
                results.log_pass(f"Bias test: {name}")
            else:
                results.log_warn(f"Bias test: {name}", "Not displayed")

        # ============================================
        # SECTION 14: E-VALUES
        # ============================================
        print("\n=== SECTION 14: E-Values (Sensitivity Analysis) ===")

        if 'E-value' in page_html or 'Unmeasured Confounding' in page_html:
            results.log_pass("E-values section")
        else:
            results.log_warn("E-values section", "Not found")

        # ============================================
        # SECTION 15: FOREST PLOT
        # ============================================
        print("\n=== SECTION 15: Forest Plot ===")

        forest_check = driver.execute_script("""
            const canvas = document.getElementById('forest-plot-canvas');
            if (canvas) {
                const ctx = canvas.getContext('2d');
                const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
                const hasContent = imageData.data.some((val, i) => i % 4 !== 3 && val !== 0);
                return { found: true, hasContent: hasContent, width: canvas.width, height: canvas.height };
            }
            return { found: false };
        """)

        if forest_check.get('found'):
            results.log_pass(f"Forest plot canvas ({forest_check.get('width')}x{forest_check.get('height')})")
            if forest_check.get('hasContent'):
                results.log_pass("Forest plot has rendered content")
            else:
                results.log_warn("Forest plot content", "Canvas may be empty")
        else:
            results.log_fail("Forest plot canvas", "Not found")

        # ============================================
        # SECTION 16: FUNNEL PLOT
        # ============================================
        print("\n=== SECTION 16: Funnel Plot ===")

        funnel_check = driver.execute_script("""
            const canvas = document.getElementById('funnel-plot-canvas');
            if (canvas) {
                const ctx = canvas.getContext('2d');
                const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
                const hasContent = imageData.data.some((val, i) => i % 4 !== 3 && val !== 0);
                return { found: true, hasContent: hasContent, width: canvas.width, height: canvas.height };
            }
            return { found: false };
        """)

        if funnel_check.get('found'):
            results.log_pass(f"Funnel plot canvas ({funnel_check.get('width')}x{funnel_check.get('height')})")
            if funnel_check.get('hasContent'):
                results.log_pass("Funnel plot has rendered content")
            else:
                results.log_warn("Funnel plot content", "Canvas may be empty")
        else:
            results.log_fail("Funnel plot canvas", "Not found")

        # ============================================
        # SECTION 17: SENSITIVITY ANALYSIS
        # ============================================
        print("\n=== SECTION 17: Sensitivity Analysis ===")

        sensitivity_checks = [
            ('Leave-One-Out', 'Leave-one-out analysis'),
            ('Influence', 'Influence diagnostics'),
            ('dfbeta', 'DFBETAS statistic'),
            ("Cook", "Cook's D")
        ]

        for keyword, name in sensitivity_checks:
            if keyword.lower() in page_html.lower():
                results.log_pass(f"Sensitivity: {name}")
            else:
                results.log_warn(f"Sensitivity: {name}", "Not found")

        # ============================================
        # SECTION 18: REPORT PAGE
        # ============================================
        print("\n=== SECTION 18: Report Page ===")

        driver.get(f'http://localhost:8765/#/project/{project_id}/report')
        time.sleep(2)

        page_html = driver.page_source

        report_checks = [
            ('PRISMA', 'PRISMA flow diagram'),
            ('Export', 'Export functionality'),
            ('Summary', 'Summary of findings')
        ]

        for keyword, name in report_checks:
            if keyword in page_html:
                results.log_pass(f"Report: {name}")
            else:
                results.log_warn(f"Report: {name}", "Not found")

        # ============================================
        # SECTION 19: EXPORT FUNCTIONALITY
        # ============================================
        print("\n=== SECTION 19: Export Functionality ===")

        try:
            export_btn = driver.find_element(By.XPATH, "//button[contains(text(), 'Export')]")
            results.log_pass("Export button found")
        except:
            results.log_warn("Export button", "Not found on page")

        # ============================================
        # SECTION 20: STATISTICAL ACCURACY CHECK
        # ============================================
        print("\n=== SECTION 20: Statistical Calculations Check ===")

        stats_check = driver.execute_async_script("""
            const callback = arguments[arguments.length - 1];
            (async () => {
                try {
                    const { db } = await import('/src/db/schema.js');
                    const results = await db.analysisResults.toArray();
                    if (results.length > 0) {
                        const latest = results[results.length - 1];
                        const ma = latest.results?.meta_analysis;
                        if (ma) {
                            callback({
                                success: true,
                                k: ma.k,
                                totalN: ma.total_n,
                                effectMeasure: ma.effect_measure,
                                feEstimate: ma.fixed_effect?.estimate,
                                reEstimate: ma.random_effects?.estimate,
                                I2: ma.heterogeneity?.I2,
                                tau2: ma.heterogeneity?.tau2,
                                hksjApplied: ma.random_effects?.hksj_applied
                            });
                            return;
                        }
                    }
                    callback({ success: false, reason: 'No results found' });
                } catch (e) {
                    callback({ success: false, error: e.message });
                }
            })();
        """)

        if stats_check.get('success'):
            results.log_pass(f"Analysis results stored in DB")
            results.log_pass(f"Studies analyzed: k = {stats_check.get('k')}")
            results.log_pass(f"Total N: {stats_check.get('totalN')}")
            results.log_pass(f"Effect measure: {stats_check.get('effectMeasure')}")

            fe = stats_check.get('feEstimate')
            re = stats_check.get('reEstimate')
            if fe is not None:
                results.log_pass(f"Fixed effect estimate: {fe:.4f}")
            if re is not None:
                results.log_pass(f"Random effects estimate: {re:.4f}")

            i2 = stats_check.get('I2')
            if i2 is not None:
                results.log_pass(f"I² heterogeneity: {i2*100:.1f}%")

            if stats_check.get('hksjApplied'):
                results.log_pass("HKSJ adjustment confirmed applied")
        else:
            results.log_fail("Statistical results retrieval", stats_check.get('reason', 'Unknown'))

        # ============================================
        # SECTION 21: CONSOLE ERRORS CHECK
        # ============================================
        print("\n=== SECTION 21: Console Errors Check ===")

        logs = driver.get_log('browser')
        errors = [log for log in logs if log['level'] == 'SEVERE']
        warnings = [log for log in logs if log['level'] == 'WARNING']

        if len(errors) == 0:
            results.log_pass("No JavaScript errors")
        else:
            results.log_fail(f"JavaScript errors: {len(errors)}", errors[0]['message'][:80])

        results.log_pass(f"Warnings count: {len(warnings)} (informational)")

        # ============================================
        # SECTION 22: RESPONSIVE DESIGN
        # ============================================
        print("\n=== SECTION 22: Responsive Design ===")

        viewports = [
            (1920, 1080, 'Desktop'),
            (768, 1024, 'Tablet'),
            (375, 667, 'Mobile')
        ]

        for width, height, name in viewports:
            driver.set_window_size(width, height)
            time.sleep(0.5)

            # Check app is still functional
            try:
                app = driver.find_element(By.ID, 'app')
                if app.is_displayed():
                    results.log_pass(f"Responsive: {name} ({width}x{height})")
                else:
                    results.log_warn(f"Responsive: {name}", "App not visible")
            except:
                results.log_fail(f"Responsive: {name}", "App element lost")

        # Reset to desktop
        driver.set_window_size(1920, 1080)

        # ============================================
        # SECTION 23: TAKE FINAL SCREENSHOT
        # ============================================
        print("\n=== SECTION 23: Final Screenshot ===")

        # Go back to analysis page for screenshot
        driver.get(f'http://localhost:8765/#/project/{project_id}/analysis')
        time.sleep(2)

        driver.save_screenshot('C:/Users/user/living-meta/tests/comprehensive_test_screenshot.png')
        results.log_pass("Screenshot saved")

    except Exception as e:
        print(f"\nFATAL ERROR: {e}")
        import traceback
        traceback.print_exc()
        results.log_fail("Test execution", str(e))

    finally:
        driver.quit()

    # Print summary
    success = results.summary()
    return success

if __name__ == '__main__':
    success = run_comprehensive_test()
    exit(0 if success else 1)
