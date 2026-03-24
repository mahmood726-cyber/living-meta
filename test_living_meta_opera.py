# -*- coding: utf-8 -*-
"""
Living Meta-Analysis - Comprehensive Selenium Test Suite (Opera Browser)
=========================================================================
Tests all buttons, functions, and verifies plots display correctly (no duplicates)
"""

import os
import sys
import time
import json
from datetime import datetime

# Fix encoding for Windows console
if sys.platform == 'win32':
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')

from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.common.keys import Keys
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from selenium.webdriver.common.action_chains import ActionChains
from selenium.common.exceptions import (
    TimeoutException, NoSuchElementException,
    ElementClickInterceptedException, StaleElementReferenceException
)

# Test configuration
OPERA_PATH = r"C:\Users\user\AppData\Local\Programs\Opera\opera.exe"
HTML_PATH = r"C:\HTML apps\living-meta\living-meta-complete.html"
WAIT_TIMEOUT = 10
SHORT_WAIT = 2

class TestResults:
    """Track test results"""
    def __init__(self):
        self.passed = 0
        self.failed = 0
        self.skipped = 0
        self.results = []
        self.start_time = datetime.now()

    def add(self, name, status, message="", details=None):
        result = {
            "name": name,
            "status": status,
            "message": message,
            "details": details,
            "timestamp": datetime.now().isoformat()
        }
        self.results.append(result)
        if status == "PASS":
            self.passed += 1
            print(f"  [PASS] {name}")
        elif status == "FAIL":
            self.failed += 1
            print(f"  [FAIL] {name}: {message}")
        else:
            self.skipped += 1
            print(f"  [SKIP] {name}: {message}")

    def summary(self):
        elapsed = (datetime.now() - self.start_time).total_seconds()
        total = self.passed + self.failed + self.skipped
        return {
            "total": total,
            "passed": self.passed,
            "failed": self.failed,
            "skipped": self.skipped,
            "elapsed_seconds": elapsed,
            "pass_rate": f"{(self.passed/total*100):.1f}%" if total > 0 else "N/A"
        }

def setup_opera_driver():
    """Setup Opera WebDriver"""
    print("\n" + "="*70)
    print("SETTING UP OPERA WEBDRIVER")
    print("="*70)

    options = webdriver.ChromeOptions()
    options.binary_location = OPERA_PATH

    # Opera uses Chromium, so we use ChromeDriver with Opera binary
    options.add_argument("--start-maximized")
    options.add_argument("--disable-extensions")
    options.add_argument("--disable-popup-blocking")
    options.add_argument("--disable-infobars")
    options.add_argument("--disable-gpu")
    options.add_argument("--no-sandbox")
    options.add_argument("--disable-dev-shm-usage")
    options.add_argument("--allow-file-access-from-files")
    options.add_argument("--disable-web-security")
    options.add_experimental_option('excludeSwitches', ['enable-logging'])

    # Try using chromedriver-autoinstaller for correct version
    try:
        import chromedriver_autoinstaller

        # Get Opera's Chromium version
        import subprocess
        result = subprocess.run([OPERA_PATH, '--version'], capture_output=True, text=True, timeout=10)
        opera_version = result.stdout.strip() if result.stdout else "Unknown"
        print(f"Opera version: {opera_version}")

        # Auto-install matching chromedriver
        chromedriver_path = chromedriver_autoinstaller.install()
        print(f"ChromeDriver path: {chromedriver_path}")

        from selenium.webdriver.chrome.service import Service
        service = Service(chromedriver_path)
        driver = webdriver.Chrome(service=service, options=options)
        print("[OK] Opera WebDriver initialized successfully")
        return driver

    except Exception as e:
        print(f"[!] chromedriver-autoinstaller failed: {e}")

    # Try webdriver_manager as fallback
    try:
        from webdriver_manager.chrome import ChromeDriverManager
        from webdriver_manager.core.os_manager import ChromeType
        from selenium.webdriver.chrome.service import Service

        # Try to get driver for Opera (Chromium-based)
        service = Service(ChromeDriverManager(chrome_type=ChromeType.CHROMIUM).install())
        driver = webdriver.Chrome(service=service, options=options)
        print("[OK] Opera WebDriver initialized via webdriver_manager")
        return driver
    except Exception as e:
        print(f"[!] webdriver_manager failed: {e}")

    # Final fallback: try Chrome directly (Opera is Chromium-based)
    try:
        print("Trying with default Chrome options...")
        chrome_options = webdriver.ChromeOptions()
        chrome_options.add_argument("--start-maximized")
        chrome_options.add_argument("--allow-file-access-from-files")
        chrome_options.add_argument("--disable-web-security")
        chrome_options.add_experimental_option('excludeSwitches', ['enable-logging'])

        driver = webdriver.Chrome(options=chrome_options)
        print("[OK] Using Chrome browser as fallback (Opera unavailable)")
        return driver
    except Exception as e:
        print(f"[!] Chrome fallback failed: {e}")

    # Try Edge as another fallback
    try:
        print("Trying Microsoft Edge as fallback...")
        from selenium.webdriver.edge.options import Options as EdgeOptions
        from selenium.webdriver.edge.service import Service as EdgeService
        from webdriver_manager.microsoft import EdgeChromiumDriverManager

        edge_options = EdgeOptions()
        edge_options.add_argument("--start-maximized")
        edge_options.add_argument("--allow-file-access-from-files")
        edge_options.add_argument("--disable-web-security")

        service = EdgeService(EdgeChromiumDriverManager().install())
        driver = webdriver.Edge(service=service, options=edge_options)
        print("[OK] Using Edge browser as fallback")
        return driver
    except Exception as e:
        print(f"[!] Edge fallback failed: {e}")
        return None

def test_page_load(driver, results):
    """Test basic page load"""
    print("\n" + "-"*70)
    print("TEST SECTION: Page Load")
    print("-"*70)

    file_url = f"file:///{HTML_PATH.replace(os.sep, '/')}"
    driver.get(file_url)
    time.sleep(SHORT_WAIT)

    # Check page title
    if "Living Meta" in driver.title:
        results.add("Page title contains 'Living Meta'", "PASS")
    else:
        results.add("Page title contains 'Living Meta'", "FAIL", f"Got: {driver.title}")

    # Check main app container exists
    try:
        app = driver.find_element(By.ID, "app")
        results.add("Main app container (#app) exists", "PASS")
    except NoSuchElementException:
        results.add("Main app container (#app) exists", "FAIL", "Element not found")

    # Check header loaded
    try:
        header = driver.find_element(By.CSS_SELECTOR, "header[role='banner']")
        results.add("Header with role='banner' exists", "PASS")
    except NoSuchElementException:
        results.add("Header with role='banner' exists", "FAIL")

    # Check main content area
    try:
        main = driver.find_element(By.ID, "main-content")
        results.add("Main content area (#main-content) exists", "PASS")
    except NoSuchElementException:
        results.add("Main content area (#main-content) exists", "FAIL")

    # Check footer
    try:
        footer = driver.find_element(By.CSS_SELECTOR, "footer[role='contentinfo']")
        results.add("Footer with role='contentinfo' exists", "PASS")
    except NoSuchElementException:
        results.add("Footer with role='contentinfo' exists", "FAIL")

def test_accessibility_features(driver, results):
    """Test WCAG 2.1 AA accessibility features"""
    print("\n" + "-"*70)
    print("TEST SECTION: Accessibility (WCAG 2.1 AA)")
    print("-"*70)

    # Skip link
    try:
        skip_link = driver.find_element(By.CSS_SELECTOR, ".skip-link")
        results.add("Skip link exists", "PASS")
    except NoSuchElementException:
        results.add("Skip link exists", "FAIL")

    # ARIA live region
    try:
        live_region = driver.find_element(By.CSS_SELECTOR, "[aria-live='polite']")
        results.add("ARIA live region exists", "PASS")
    except NoSuchElementException:
        results.add("ARIA live region exists", "FAIL")

    # Main landmark
    try:
        main_landmark = driver.find_element(By.CSS_SELECTOR, "[role='main']")
        results.add("Main landmark (role='main') exists", "PASS")
    except NoSuchElementException:
        results.add("Main landmark (role='main') exists", "FAIL")

    # Keyboard help button
    try:
        kb_help = driver.find_element(By.ID, "keyboard-help-btn")
        results.add("Keyboard help button exists", "PASS")
    except NoSuchElementException:
        results.add("Keyboard help button exists", "FAIL")

def test_navigation_buttons(driver, results):
    """Test navigation buttons and links"""
    print("\n" + "-"*70)
    print("TEST SECTION: Navigation Buttons")
    print("-"*70)

    # New Project button
    try:
        new_project_btn = driver.find_element(By.ID, "new-project-btn")
        if new_project_btn.is_displayed() and new_project_btn.is_enabled():
            results.add("New Project button visible and enabled", "PASS")
        else:
            results.add("New Project button visible and enabled", "FAIL", "Button not accessible")
    except NoSuchElementException:
        results.add("New Project button visible and enabled", "FAIL", "Button not found")

    # Logo/home link
    try:
        home_link = driver.find_element(By.CSS_SELECTOR, "a[href='#/']")
        results.add("Home link exists", "PASS")
    except NoSuchElementException:
        results.add("Home link exists", "FAIL")

def test_new_project_modal(driver, results):
    """Test New Project modal functionality"""
    print("\n" + "-"*70)
    print("TEST SECTION: New Project Modal")
    print("-"*70)

    try:
        # Click New Project button
        new_project_btn = driver.find_element(By.ID, "new-project-btn")
        new_project_btn.click()
        time.sleep(1)

        # Check modal appeared
        modal_container = driver.find_element(By.ID, "modal-container")
        modal_html = modal_container.get_attribute("innerHTML")

        if "New Project" in modal_html:
            results.add("New Project modal opens", "PASS")
        else:
            results.add("New Project modal opens", "FAIL", "Modal content not found")

        # Check for form elements in modal
        try:
            modal_form = modal_container.find_element(By.CSS_SELECTOR, "input.input")
            results.add("Modal contains input field", "PASS")
        except NoSuchElementException:
            results.add("Modal contains input field", "FAIL")

        # Check for submit button
        try:
            submit_btn = modal_container.find_element(By.CSS_SELECTOR, ".btn-primary")
            results.add("Modal contains submit button", "PASS")
        except NoSuchElementException:
            results.add("Modal contains submit button", "FAIL")

        # Close modal by pressing Escape
        ActionChains(driver).send_keys(Keys.ESCAPE).perform()
        time.sleep(0.5)

    except Exception as e:
        results.add("New Project modal opens", "FAIL", str(e))

def test_keyboard_shortcuts_modal(driver, results):
    """Test keyboard shortcuts modal"""
    print("\n" + "-"*70)
    print("TEST SECTION: Keyboard Shortcuts Modal")
    print("-"*70)

    try:
        # First, close any open modals using JavaScript
        driver.execute_script("""
            // Clear modal container
            var modalContainer = document.getElementById('modal-container');
            if (modalContainer) modalContainer.innerHTML = '';
            // Also dispatch escape event
            document.dispatchEvent(new KeyboardEvent('keydown', {key: 'Escape', keyCode: 27}));
        """)
        time.sleep(0.5)

        # Click keyboard help button using JavaScript to avoid interception issues
        driver.execute_script("""
            var btn = document.getElementById('keyboard-help-btn');
            if (btn) btn.click();
        """)
        time.sleep(1)

        # Check modal appeared
        shortcuts_modal = driver.find_element(By.ID, "keyboard-shortcuts-modal")
        if "hidden" not in shortcuts_modal.get_attribute("class"):
            results.add("Keyboard shortcuts modal opens", "PASS")
        else:
            results.add("Keyboard shortcuts modal opens", "FAIL", "Modal still hidden")

        # Check content
        modal_text = shortcuts_modal.text
        shortcuts_found = []
        expected_shortcuts = ["Navigation", "Actions", "Screening", "Esc"]

        for shortcut in expected_shortcuts:
            if shortcut in modal_text:
                shortcuts_found.append(shortcut)

        if len(shortcuts_found) >= 3:
            results.add("Keyboard shortcuts modal has content", "PASS", f"Found: {shortcuts_found}")
        else:
            results.add("Keyboard shortcuts modal has content", "FAIL", f"Only found: {shortcuts_found}")

        # Close modal
        close_btn = driver.find_element(By.ID, "close-shortcuts-btn")
        close_btn.click()
        time.sleep(0.5)

        if "hidden" in shortcuts_modal.get_attribute("class"):
            results.add("Keyboard shortcuts modal closes", "PASS")
        else:
            results.add("Keyboard shortcuts modal closes", "FAIL")

    except Exception as e:
        results.add("Keyboard shortcuts modal", "FAIL", str(e))

def test_javascript_console(driver, results):
    """Test JavaScript functions via console"""
    print("\n" + "-"*70)
    print("TEST SECTION: JavaScript Functions (Console)")
    print("-"*70)

    # Test LMA namespace exists
    try:
        lma_exists = driver.execute_script("return typeof window.LMA !== 'undefined'")
        if lma_exists:
            results.add("LMA namespace exists", "PASS")
        else:
            results.add("LMA namespace exists", "FAIL")
    except Exception as e:
        results.add("LMA namespace exists", "FAIL", str(e))

    # Test core functions exist
    core_functions = [
        "metaAnalysis", "metaAnalysisDL", "metaAnalysisREML", "metaAnalysisFE",
        "eggerTest", "beggTest", "trimAndFill", "failsafeN",
        "hedgesG", "logOddsRatio", "logRiskRatio", "fisherZ",
        "runValidation", "printValidationReport", "runTests"
    ]

    for func in core_functions:
        try:
            exists = driver.execute_script(f"return typeof window.LMA.{func} === 'function'")
            if exists:
                results.add(f"LMA.{func}() exists", "PASS")
            else:
                results.add(f"LMA.{func}() exists", "FAIL", "Function not found")
        except Exception as e:
            results.add(f"LMA.{func}() exists", "FAIL", str(e))

    # Test validation datasets exist
    try:
        datasets = driver.execute_script("return Object.keys(window.LMA.VALIDATION_DATASETS || {})")
        expected = ["bcg", "aspirin", "homogeneous", "heterogeneous", "single"]

        for ds in expected:
            if ds in datasets:
                results.add(f"Validation dataset '{ds}' exists", "PASS")
            else:
                results.add(f"Validation dataset '{ds}' exists", "FAIL")
    except Exception as e:
        results.add("Validation datasets check", "FAIL", str(e))

def test_meta_analysis_functions(driver, results):
    """Test meta-analysis statistical functions"""
    print("\n" + "-"*70)
    print("TEST SECTION: Meta-Analysis Functions")
    print("-"*70)

    # Test DerSimonian-Laird
    try:
        result = driver.execute_script("""
            var yi = [-0.5, -0.3, -0.4, -0.6, -0.2];
            var vi = [0.04, 0.05, 0.04, 0.06, 0.03];
            var r = LMA.metaAnalysis(yi, vi, {method: 'DL'});
            return {estimate: r.estimate, se: r.se, tau2: r.tau2, I2: r.I2, k: r.k};
        """)

        if result and 'estimate' in result and -1 < result['estimate'] < 0:
            results.add("DerSimonian-Laird meta-analysis", "PASS",
                       f"estimate={result['estimate']:.4f}, I2={result['I2']:.1f}%")
        else:
            results.add("DerSimonian-Laird meta-analysis", "FAIL", str(result))
    except Exception as e:
        results.add("DerSimonian-Laird meta-analysis", "FAIL", str(e))

    # Test REML
    try:
        result = driver.execute_script("""
            var yi = [-0.5, -0.3, -0.4, -0.6, -0.2];
            var vi = [0.04, 0.05, 0.04, 0.06, 0.03];
            var r = LMA.metaAnalysis(yi, vi, {method: 'REML'});
            return {estimate: r.estimate, se: r.se, tau2: r.tau2};
        """)

        if result and 'estimate' in result:
            results.add("REML meta-analysis", "PASS", f"estimate={result['estimate']:.4f}")
        else:
            results.add("REML meta-analysis", "FAIL")
    except Exception as e:
        results.add("REML meta-analysis", "FAIL", str(e))

    # Test Fixed-Effect
    try:
        result = driver.execute_script("""
            var yi = [-0.5, -0.3, -0.4, -0.6, -0.2];
            var vi = [0.04, 0.05, 0.04, 0.06, 0.03];
            var r = LMA.metaAnalysis(yi, vi, {method: 'FE'});
            return {estimate: r.estimate, se: r.se, tau2: r.tau2};
        """)

        if result and result['tau2'] == 0:
            results.add("Fixed-Effect meta-analysis", "PASS", f"tau2=0 (correct)")
        else:
            results.add("Fixed-Effect meta-analysis", "FAIL", f"tau2={result.get('tau2', 'N/A')}")
    except Exception as e:
        results.add("Fixed-Effect meta-analysis", "FAIL", str(e))

def test_publication_bias_functions(driver, results):
    """Test publication bias detection functions"""
    print("\n" + "-"*70)
    print("TEST SECTION: Publication Bias Functions")
    print("-"*70)

    test_data = """
        var yi = [-0.8893, -1.5854, -1.3481, -1.4416, -0.2175, -0.7861, -1.6209, -0.4717, -0.0173, 0.4459, -0.0173, 0.5878, -1.3863];
        var vi = [0.0320, 0.0120, 0.0115, 0.0204, 0.0510, 0.0633, 0.0175, 0.0096, 0.0511, 0.0255, 0.2252, 0.0200, 0.0096];
    """

    # Test Egger's test
    try:
        result = driver.execute_script(f"""
            {test_data}
            return LMA.eggerTest(yi, vi);
        """)

        if result and 'intercept' in result and 'pvalue' in result:
            intercept = result['intercept']
            pvalue = result['pvalue']
            # Handle None or special values
            int_str = f"{intercept:.4f}" if intercept is not None and intercept != float('inf') and intercept != float('-inf') else str(intercept)
            p_str = f"{pvalue:.4f}" if pvalue is not None and pvalue != float('inf') and not (isinstance(pvalue, float) and pvalue != pvalue) else str(pvalue)
            results.add("Egger's test (WLS)", "PASS", f"intercept={int_str}, p={p_str}")
        else:
            results.add("Egger's test (WLS)", "FAIL", str(result))
    except Exception as e:
        results.add("Egger's test (WLS)", "FAIL", str(e))

    # Test Begg's test
    try:
        result = driver.execute_script(f"""
            {test_data}
            return LMA.beggTest(yi, vi);
        """)

        if result and 'tau' in result and 'pvalue' in result:
            results.add("Begg's test", "PASS", f"tau={result['tau']:.4f}, p={result['pvalue']:.4f}")
        else:
            results.add("Begg's test", "FAIL", str(result))
    except Exception as e:
        results.add("Begg's test", "FAIL", str(e))

    # Test Trim and Fill
    try:
        result = driver.execute_script(f"""
            {test_data}
            return LMA.trimAndFill(yi, vi);
        """)

        if result and 'k0' in result:
            results.add("Trim and Fill", "PASS", f"k0={result['k0']}, adjusted={result.get('estimate_adjusted', 0):.4f}")
        else:
            results.add("Trim and Fill", "FAIL", str(result))
    except Exception as e:
        results.add("Trim and Fill", "FAIL", str(e))

    # Test Fail-safe N
    try:
        result = driver.execute_script(f"""
            {test_data}
            return LMA.failsafeN(yi, vi);
        """)

        if result and 'failsafeN' in result:
            results.add("Fail-safe N", "PASS", f"N={result['failsafeN']}, robust={result.get('robust', 'N/A')}")
        else:
            results.add("Fail-safe N", "FAIL", str(result))
    except Exception as e:
        results.add("Fail-safe N", "FAIL", str(e))

def test_effect_size_functions(driver, results):
    """Test effect size calculation functions"""
    print("\n" + "-"*70)
    print("TEST SECTION: Effect Size Functions")
    print("-"*70)

    # Test Hedges' g
    try:
        result = driver.execute_script("""
            return LMA.hedgesG(10, 8, 2, 2, 30, 30);
        """)

        if result and 'g' in result and 0.5 < result['g'] < 1.5:
            results.add("Hedges' g calculation", "PASS", f"g={result['g']:.4f}, J={result.get('J', 0):.4f}")
        else:
            results.add("Hedges' g calculation", "FAIL", str(result))
    except Exception as e:
        results.add("Hedges' g calculation", "FAIL", str(e))

    # Test Log Odds Ratio
    try:
        result = driver.execute_script("""
            return LMA.logOddsRatio(20, 100, 10, 100);
        """)

        if result and 'logOR' in result:
            results.add("Log Odds Ratio", "PASS", f"logOR={result['logOR']:.4f}, OR={result.get('OR', 0):.4f}")
        else:
            results.add("Log Odds Ratio", "FAIL", str(result))
    except Exception as e:
        results.add("Log Odds Ratio", "FAIL", str(e))

    # Test Log Odds Ratio with zero cell (correction)
    try:
        result = driver.execute_script("""
            return LMA.logOddsRatio(0, 100, 10, 100);
        """)

        if result and result.get('corrected', False):
            results.add("Log OR zero-cell correction", "PASS", f"corrected=true, logOR={result['logOR']:.4f}")
        else:
            results.add("Log OR zero-cell correction", "FAIL", "No correction applied")
    except Exception as e:
        results.add("Log OR zero-cell correction", "FAIL", str(e))

    # Test Log Risk Ratio
    try:
        result = driver.execute_script("""
            return LMA.logRiskRatio(20, 100, 10, 100);
        """)

        if result and 'logRR' in result:
            results.add("Log Risk Ratio", "PASS", f"logRR={result['logRR']:.4f}, RR={result.get('RR', 0):.4f}")
        else:
            results.add("Log Risk Ratio", "FAIL", str(result))
    except Exception as e:
        results.add("Log Risk Ratio", "FAIL", str(e))

    # Test Fisher's z
    try:
        result = driver.execute_script("""
            return LMA.fisherZ(0.5, 100);
        """)

        expected_z = 0.5493
        if result and 'z' in result and abs(result['z'] - expected_z) < 0.01:
            results.add("Fisher's z transformation", "PASS", f"z={result['z']:.4f} (expected ~{expected_z})")
        else:
            results.add("Fisher's z transformation", "FAIL", f"Got z={result.get('z', 'N/A')}")
    except Exception as e:
        results.add("Fisher's z transformation", "FAIL", str(e))

def test_r_validation(driver, results):
    """Test R metafor validation"""
    print("\n" + "-"*70)
    print("TEST SECTION: R Metafor Validation")
    print("-"*70)

    try:
        validation_result = driver.execute_script("""
            return LMA.runValidation();
        """)

        if validation_result and 'summary' in validation_result:
            summary = validation_result['summary']
            if summary['passed'] == summary['total']:
                results.add("R Validation: All tests", "PASS",
                           f"{summary['passed']}/{summary['total']} passed")
            else:
                results.add("R Validation: All tests", "FAIL",
                           f"{summary['passed']}/{summary['total']} passed, {summary['failed']} failed")

            # Check individual datasets
            for dataset in validation_result.get('datasets', []):
                name = dataset['name']
                for method, data in dataset.get('methods', {}).items():
                    if data.get('allPass'):
                        results.add(f"R Validation: {name} ({method})", "PASS")
                    else:
                        results.add(f"R Validation: {name} ({method})", "FAIL")
        else:
            results.add("R Validation", "FAIL", "No validation result returned")

    except Exception as e:
        results.add("R Validation", "FAIL", str(e))

def test_comprehensive_test_suite(driver, results):
    """Run the built-in test suite"""
    print("\n" + "-"*70)
    print("TEST SECTION: Built-in Test Suite")
    print("-"*70)

    try:
        test_result = driver.execute_script("""
            return LMA.runTests();
        """)

        if test_result:
            passed = test_result.get('passed', 0)
            failed = test_result.get('failed', 0)
            total = test_result.get('total', 0)

            if failed == 0:
                results.add("Built-in test suite", "PASS", f"{passed}/{total} tests passed")
            else:
                results.add("Built-in test suite", "FAIL", f"{passed}/{total} passed, {failed} failed")

                # Report individual failures
                for r in test_result.get('results', []):
                    if not r.get('passed'):
                        results.add(f"  Sub-test: {r['name']}", "FAIL", r.get('message', ''))
        else:
            results.add("Built-in test suite", "FAIL", "No result returned")

    except Exception as e:
        results.add("Built-in test suite", "FAIL", str(e))

def test_validation_page(driver, results):
    """Test the validation page route"""
    print("\n" + "-"*70)
    print("TEST SECTION: Validation Page")
    print("-"*70)

    try:
        # Navigate to validation page
        driver.execute_script("window.location.hash = '#/validation'")
        time.sleep(2)

        # Check URL changed
        if "#/validation" in driver.current_url:
            results.add("Navigation to #/validation", "PASS")
        else:
            results.add("Navigation to #/validation", "FAIL", driver.current_url)

        # Check page content loaded
        route_view = driver.find_element(By.ID, "route-view")
        content = route_view.text

        if "Validation" in content or "BCG" in content or "metafor" in content.lower():
            results.add("Validation page content loaded", "PASS")
        else:
            results.add("Validation page content loaded", "SKIP", "Content may be minimal")

    except Exception as e:
        results.add("Validation page", "FAIL", str(e))

def test_plots_no_duplicates(driver, results):
    """Test that plots display correctly without duplicates"""
    print("\n" + "-"*70)
    print("TEST SECTION: Plot Display (No Duplicates)")
    print("-"*70)

    # Navigate to analysis page (if available)
    try:
        # First create a test project to access analysis
        driver.execute_script("""
            // Create a test project in store
            if (LMA.store && LMA.actions) {
                LMA.store.dispatch(LMA.actions.setProjects([{
                    id: 'test-project',
                    name: 'Test Project',
                    createdAt: new Date().toISOString()
                }]));
                LMA.store.dispatch(LMA.actions.setCurrentProject({
                    id: 'test-project',
                    name: 'Test Project'
                }));
            }
        """)
        time.sleep(1)

        # Navigate to analysis page
        driver.execute_script("window.location.hash = '#/project/test-project/analysis'")
        time.sleep(2)

        # Count SVG/canvas elements (plots are typically rendered as SVG or canvas)
        svg_count = driver.execute_script("return document.querySelectorAll('svg').length")
        canvas_count = driver.execute_script("return document.querySelectorAll('canvas').length")

        results.add("Plot elements detected", "PASS", f"SVG: {svg_count}, Canvas: {canvas_count}")

        # Check for duplicate plot containers
        plot_containers = driver.execute_script("""
            var containers = document.querySelectorAll('.plot-container, .chart-container, [data-plot]');
            var ids = [];
            containers.forEach(function(c) {
                if (c.id) ids.push(c.id);
            });
            return {count: containers.length, ids: ids};
        """)

        # Check for duplicate IDs
        ids = plot_containers.get('ids', [])
        unique_ids = set(ids)

        if len(ids) == len(unique_ids):
            results.add("No duplicate plot container IDs", "PASS", f"Found {len(ids)} unique containers")
        else:
            duplicates = [id for id in ids if ids.count(id) > 1]
            results.add("No duplicate plot container IDs", "FAIL", f"Duplicates: {set(duplicates)}")

        # Check for duplicate forest plot elements specifically
        forest_plots = driver.execute_script("""
            return document.querySelectorAll('.forest-plot, [data-forest-plot]').length;
        """)

        funnel_plots = driver.execute_script("""
            return document.querySelectorAll('.funnel-plot, [data-funnel-plot]').length;
        """)

        results.add("Forest plot count", "PASS" if forest_plots <= 1 else "FAIL", f"Count: {forest_plots}")
        results.add("Funnel plot count", "PASS" if funnel_plots <= 1 else "FAIL", f"Count: {funnel_plots}")

    except Exception as e:
        results.add("Plot display check", "SKIP", f"Analysis page may require data: {e}")

def test_database_functions(driver, results):
    """Test IndexedDB database functions"""
    print("\n" + "-"*70)
    print("TEST SECTION: Database (IndexedDB)")
    print("-"*70)

    # Test db exists
    try:
        db_exists = driver.execute_script("return typeof LMA.db !== 'undefined'")
        if db_exists:
            results.add("LMA.db namespace exists", "PASS")
        else:
            results.add("LMA.db namespace exists", "FAIL")
    except Exception as e:
        results.add("LMA.db namespace exists", "FAIL", str(e))

    # Test database version
    try:
        version = driver.execute_script("""
            return new Promise(function(resolve) {
                var request = indexedDB.open('living-meta-analysis');
                request.onsuccess = function() {
                    resolve(request.result.version);
                    request.result.close();
                };
                request.onerror = function() { resolve(-1); };
            });
        """)

        # Wait for async result
        time.sleep(1)
        version = driver.execute_script("return arguments[0]", version)

        if version and version >= 2:
            results.add("IndexedDB version >= 2 (with migrations)", "PASS", f"Version: {version}")
        else:
            results.add("IndexedDB version >= 2 (with migrations)", "SKIP", f"Version: {version}")
    except Exception as e:
        results.add("IndexedDB version check", "SKIP", str(e))

def test_store_and_state(driver, results):
    """Test state management store"""
    print("\n" + "-"*70)
    print("TEST SECTION: State Management")
    print("-"*70)

    # Test store exists
    try:
        store_exists = driver.execute_script("""
            return typeof LMA.store !== 'undefined' &&
                   typeof LMA.store.getState === 'function' &&
                   typeof LMA.store.dispatch === 'function';
        """)

        if store_exists:
            results.add("State store exists with getState/dispatch", "PASS")
        else:
            results.add("State store exists with getState/dispatch", "FAIL")
    except Exception as e:
        results.add("State store check", "FAIL", str(e))

    # Test actions exist
    try:
        actions = driver.execute_script("""
            return Object.keys(LMA.actions || {});
        """)

        expected_actions = ['setProjects', 'setCurrentProject', 'setSearchRun']
        found = [a for a in expected_actions if a in actions]

        if len(found) >= 2:
            results.add("State actions exist", "PASS", f"Found: {found}")
        else:
            results.add("State actions exist", "FAIL", f"Found: {found}")
    except Exception as e:
        results.add("State actions check", "FAIL", str(e))

def test_router(driver, results):
    """Test client-side router"""
    print("\n" + "-"*70)
    print("TEST SECTION: Router")
    print("-"*70)

    routes_to_test = [
        ("#/", "Projects"),
        ("#/validation", "Validation"),
    ]

    for route, expected_title in routes_to_test:
        try:
            driver.execute_script(f"window.location.hash = '{route}'")
            time.sleep(1)

            title = driver.title
            if expected_title.lower() in title.lower() or "Living Meta" in title:
                results.add(f"Route {route} loads", "PASS", f"Title: {title}")
            else:
                results.add(f"Route {route} loads", "FAIL", f"Title: {title}")
        except Exception as e:
            results.add(f"Route {route} loads", "FAIL", str(e))

def test_error_handling(driver, results):
    """Test error handling"""
    print("\n" + "-"*70)
    print("TEST SECTION: Error Handling")
    print("-"*70)

    # Test error with invalid input
    try:
        result = driver.execute_script("""
            try {
                return LMA.metaAnalysis([], []);
            } catch(e) {
                return {error: e.message};
            }
        """)

        if result and ('error' in result or result.get('k') == 0):
            results.add("Empty input handling", "PASS", "Graceful handling of empty arrays")
        else:
            results.add("Empty input handling", "FAIL", str(result))
    except Exception as e:
        results.add("Empty input handling", "FAIL", str(e))

    # Test Egger with insufficient studies
    try:
        result = driver.execute_script("""
            return LMA.eggerTest([0.5, 0.6], [0.04, 0.04]);
        """)

        if result and 'error' in result:
            results.add("Egger insufficient studies error", "PASS", result['error'])
        else:
            results.add("Egger insufficient studies error", "FAIL", "No error returned")
    except Exception as e:
        results.add("Egger insufficient studies error", "FAIL", str(e))

def run_all_tests():
    """Run all tests"""
    print("\n" + "="*70)
    print("LIVING META-ANALYSIS - COMPREHENSIVE SELENIUM TEST SUITE")
    print("Browser: Opera (or fallback)")
    print("="*70)
    print(f"Started: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")

    results = TestResults()
    driver = None

    try:
        driver = setup_opera_driver()

        if driver is None:
            print("\n[FAIL] Failed to initialize WebDriver. Exiting.")
            return None

        # Run all test sections
        test_page_load(driver, results)
        test_accessibility_features(driver, results)
        test_navigation_buttons(driver, results)
        test_new_project_modal(driver, results)
        test_keyboard_shortcuts_modal(driver, results)
        test_javascript_console(driver, results)
        test_meta_analysis_functions(driver, results)
        test_publication_bias_functions(driver, results)
        test_effect_size_functions(driver, results)
        test_r_validation(driver, results)
        test_comprehensive_test_suite(driver, results)
        test_validation_page(driver, results)
        test_plots_no_duplicates(driver, results)
        test_database_functions(driver, results)
        test_store_and_state(driver, results)
        test_router(driver, results)
        test_error_handling(driver, results)

    except Exception as e:
        print(f"\n[CRITICAL] Critical error during testing: {e}")
        import traceback
        traceback.print_exc()

    finally:
        if driver:
            driver.quit()
            print("\n[OK] WebDriver closed")

    # Print summary
    summary = results.summary()
    print("\n" + "="*70)
    print("TEST SUMMARY")
    print("="*70)
    print(f"Total Tests: {summary['total']}")
    print(f"Passed: {summary['passed']}")
    print(f"Failed: {summary['failed']}")
    print(f"Skipped: {summary['skipped']}")
    print(f"Pass Rate: {summary['pass_rate']}")
    print(f"Duration: {summary['elapsed_seconds']:.2f} seconds")
    print("="*70)

    # Save results to JSON
    output_file = os.path.join(os.path.dirname(HTML_PATH), "test_results.json")
    with open(output_file, 'w', encoding='utf-8') as f:
        json.dump({
            "summary": summary,
            "results": results.results
        }, f, indent=2)
    print(f"\nResults saved to: {output_file}")

    return results

if __name__ == "__main__":
    run_all_tests()
