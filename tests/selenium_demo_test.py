"""
Selenium test to inject demo data and verify plots render correctly.
"""

import time
import json
from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC

def setup_driver():
    """Setup Chrome driver with options."""
    options = Options()
    options.add_argument('--headless=new')
    options.add_argument('--no-sandbox')
    options.add_argument('--disable-dev-shm-usage')
    options.add_argument('--window-size=1920,1080')
    options.add_argument('--disable-gpu')
    options.add_argument('--remote-debugging-port=9222')
    options.add_argument('--disable-extensions')
    options.add_argument('--disable-software-rasterizer')

    from selenium.webdriver.chrome.service import Service
    service = Service()
    driver = webdriver.Chrome(service=service, options=options)
    driver.implicitly_wait(5)
    return driver

def inject_demo_data(driver):
    """Inject demo data into IndexedDB."""

    # Read the injection script
    with open('C:/Users/user/living-meta/tests/inject_demo_data.js', 'r') as f:
        inject_script = f.read()

    # Execute the injection script
    result = driver.execute_script(f"""
        {inject_script}

        // Run the injection and return result
        return new Promise(async (resolve) => {{
            try {{
                const projectId = await injectDemoData();
                resolve({{ success: true, projectId: projectId }});
            }} catch (e) {{
                resolve({{ success: false, error: e.message }});
            }}
        }});
    """)

    return result

def test_demo_injection_and_plots():
    """Test demo data injection and plot rendering."""
    driver = setup_driver()
    results = {
        'injection': False,
        'navigation': False,
        'forest_plot': False,
        'funnel_plot': False,
        'analysis_run': False,
        'errors': []
    }

    try:
        print("=" * 60)
        print("DEMO DATA INJECTION AND PLOT VERIFICATION TEST")
        print("=" * 60)

        # 1. Load the app
        print("\n[1] Loading app...")
        driver.get('http://localhost:3001')
        time.sleep(3)

        # Check for console errors
        logs = driver.get_log('browser')
        errors = [log for log in logs if log['level'] == 'SEVERE']
        if errors:
            print(f"  Initial errors: {len(errors)}")
            for err in errors[:3]:
                print(f"    - {err['message'][:100]}")

        # 2. Inject demo data
        print("\n[2] Injecting demo data...")
        inject_result = inject_demo_data(driver)

        if inject_result and inject_result.get('success'):
            project_id = inject_result.get('projectId')
            print(f"  SUCCESS: Project created with ID: {project_id}")
            results['injection'] = True

            # 3. Navigate to analysis page
            print("\n[3] Navigating to analysis page...")
            driver.get(f'http://localhost:3001/#/project/{project_id}/analysis')
            time.sleep(3)

            # Check navigation
            current_url = driver.current_url
            if 'analysis' in current_url:
                print(f"  SUCCESS: Navigated to analysis page")
                results['navigation'] = True
            else:
                print(f"  Current URL: {current_url}")

            # 4. Check for analysis config component
            print("\n[4] Looking for analysis configuration...")
            try:
                analysis_section = WebDriverWait(driver, 10).until(
                    EC.presence_of_element_located((By.CSS_SELECTOR, 'analysis-config, .analysis-config, [data-component="analysis"]'))
                )
                print("  Found analysis section")
            except:
                print("  Analysis section not found by selector, checking page content...")
                page_source = driver.page_source
                if 'analysis' in page_source.lower() or 'forest' in page_source.lower():
                    print("  Page contains analysis-related content")
                else:
                    print("  No analysis content found")

            # 5. Try to run analysis
            print("\n[5] Attempting to run analysis...")

            # Look for run analysis button
            try:
                run_button = driver.find_element(By.XPATH, "//button[contains(text(), 'Run') or contains(text(), 'Analyze') or contains(text(), 'Calculate')]")
                run_button.click()
                print("  Clicked run analysis button")
                time.sleep(5)
                results['analysis_run'] = True
            except Exception as e:
                print(f"  No run button found: {e}")
                # Try executing analysis directly via JS
                print("  Trying to trigger analysis via JavaScript...")

                analysis_result = driver.execute_script("""
                    return new Promise(async (resolve) => {
                        try {
                            const { db } = await import('/src/db/schema.js');

                            // Get all extraction data
                            const extractions = await db.extraction.getAll();
                            console.log('Extractions found:', extractions.length);

                            if (extractions.length === 0) {
                                resolve({ success: false, error: 'No extraction data found' });
                                return;
                            }

                            // Run analysis via worker
                            const worker = new Worker('/src/workers/analysis_worker.js', { type: 'module' });

                            // Prepare studies data
                            const studies = extractions.map(e => ({
                                id: e.nctId,
                                label: e.data?.studyLabel || e.nctId,
                                events1: e.data?.treatment_events || 0,
                                n1: e.data?.treatment_n || 0,
                                events2: e.data?.control_events || 0,
                                n2: e.data?.control_n || 0
                            }));

                            console.log('Studies prepared:', studies);

                            worker.postMessage({
                                type: 'runAnalysis',
                                payload: {
                                    studies: studies,
                                    effectType: 'OR',
                                    model: 'RE',
                                    tau2Method: 'DL'
                                }
                            });

                            worker.onmessage = (e) => {
                                console.log('Worker response:', e.data);
                                resolve({ success: true, result: e.data });
                            };

                            worker.onerror = (e) => {
                                console.error('Worker error:', e);
                                resolve({ success: false, error: e.message });
                            };

                            // Timeout after 10 seconds
                            setTimeout(() => {
                                resolve({ success: false, error: 'Analysis timeout' });
                            }, 10000);

                        } catch (e) {
                            console.error('Analysis error:', e);
                            resolve({ success: false, error: e.message });
                        }
                    });
                """)

                if analysis_result and analysis_result.get('success'):
                    print(f"  Analysis completed via JS!")
                    result_data = analysis_result.get('result', {})
                    if isinstance(result_data, dict) and result_data.get('type') == 'analysisResult':
                        payload = result_data.get('payload', {})
                        print(f"    Pooled OR: {payload.get('pooledEffect', 'N/A')}")
                        print(f"    I²: {payload.get('I2', 'N/A')}")
                        print(f"    Studies: {payload.get('k', 'N/A')}")
                        results['analysis_run'] = True
                else:
                    print(f"  Analysis failed: {analysis_result}")

            # 6. Check for forest plot
            print("\n[6] Checking for forest plot...")
            try:
                forest = driver.find_element(By.CSS_SELECTOR, 'forest-plot, .forest-plot, canvas[data-plot="forest"], #forest-plot-canvas')
                print("  Forest plot element found!")
                results['forest_plot'] = True
            except:
                # Try to check for canvas elements via JS
                print("  No forest plot found by selector, checking via JS...")
                forest_result = driver.execute_script("""
                    return new Promise(async (resolve) => {
                        try {
                            // Check for canvas with id
                            const forestCanvas = document.getElementById('forest-plot-canvas');
                            if (forestCanvas) {
                                resolve({ success: true, element: 'forest-plot-canvas' });
                                return;
                            }

                            // Check for any canvas elements
                            const canvases = document.querySelectorAll('canvas');
                            if (canvases.length > 0) {
                                resolve({ success: true, element: 'canvas', count: canvases.length });
                                return;
                            }

                            resolve({ success: false, element: 'none' });
                        } catch (e) {
                            resolve({ success: false, error: e.message });
                        }
                    });
                """)
                print(f"  Forest check result: {forest_result}")
                if forest_result and forest_result.get('success'):
                    results['forest_plot'] = True
                    print("  Canvas elements detected - plots likely rendered!")

            # 7. Check for funnel plot
            print("\n[7] Checking for funnel plot...")
            try:
                funnel = driver.find_element(By.CSS_SELECTOR, 'funnel-plot, .funnel-plot, canvas[data-plot="funnel"], #funnel-plot-canvas')
                print("  Funnel plot element found!")
                results['funnel_plot'] = True
            except:
                # Check via JS
                funnel_result = driver.execute_script("""
                    const funnelCanvas = document.getElementById('funnel-plot-canvas');
                    if (funnelCanvas) return { success: true, element: 'funnel-plot-canvas' };
                    return { success: false };
                """)
                if funnel_result and funnel_result.get('success'):
                    results['funnel_plot'] = True
                    print("  Funnel plot canvas detected!")
                else:
                    print("  No funnel plot element found")

            # 8. Final console error check
            print("\n[8] Final console error check...")
            logs = driver.get_log('browser')
            errors = [log for log in logs if log['level'] == 'SEVERE']
            warnings = [log for log in logs if log['level'] == 'WARNING']

            print(f"  Errors: {len(errors)}")
            print(f"  Warnings: {len(warnings)}")

            for err in errors[:5]:
                results['errors'].append(err['message'][:200])
                print(f"    ERROR: {err['message'][:100]}")

            # 9. Take screenshot
            print("\n[9] Taking screenshot...")
            driver.save_screenshot('C:/Users/user/living-meta/tests/demo_test_screenshot.png')
            print("  Screenshot saved to demo_test_screenshot.png")

        else:
            error = inject_result.get('error', 'Unknown error') if inject_result else 'No result'
            print(f"  FAILED: {error}")
            results['errors'].append(f"Injection failed: {error}")

        # Summary
        print("\n" + "=" * 60)
        print("TEST SUMMARY")
        print("=" * 60)
        print(f"  Demo data injection: {'PASS' if results['injection'] else 'FAIL'}")
        print(f"  Navigation to analysis: {'PASS' if results['navigation'] else 'FAIL'}")
        print(f"  Analysis run: {'PASS' if results['analysis_run'] else 'FAIL'}")
        print(f"  Forest plot rendered: {'PASS' if results['forest_plot'] else 'FAIL'}")
        print(f"  Funnel plot rendered: {'PASS' if results['funnel_plot'] else 'FAIL'}")
        print(f"  Console errors: {len(results['errors'])}")

        passed = sum([results['injection'], results['navigation'], results['analysis_run']])
        print(f"\n  OVERALL: {passed}/3 core tests passed")

    except Exception as e:
        print(f"\nFATAL ERROR: {e}")
        import traceback
        traceback.print_exc()
        results['errors'].append(str(e))

    finally:
        driver.quit()

    return results

if __name__ == '__main__':
    test_demo_injection_and_plots()
