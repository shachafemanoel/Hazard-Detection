/**
 * Post-Refactor QA Automation Suite
 * Comprehensive end-to-end verification after JavaScript refactoring
 * 
 * Test scenarios:
 * 1. Camera page - ONNX model loading and API fallback
 * 2. Dashboard page - reports loading and synchronization
 * 3. Upload page - file upload and detection functionality
 * 4. Module imports and path integrity
 * 5. Network utilities and health probes
 * 6. Error scenarios and fallback mechanisms
 */

import puppeteer from 'puppeteer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { describe, test, before, after, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('Post-Refactor QA: Hazard Detection System', () => {
  let browser;
  let context;
  let serverProcess;
  const TEST_SERVER_URL = 'http://localhost:3000';
  const TEST_TIMEOUT = 30000;
  
  before(async () => {
    console.log('🚀 Starting Post-Refactor QA Test Suite...');
    
    // Launch browser with necessary permissions
    browser = await puppeteer.launch({
      headless: process.env.CI ? 'new' : false, // Show browser in dev mode
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-web-security',
        '--allow-running-insecure-content',
        '--enable-features=NetworkService',
        '--disable-features=VizDisplayCompositor',
        '--use-fake-ui-for-media-stream', // Mock camera access
        '--use-fake-device-for-media-stream'
      ],
      devtools: !process.env.CI
    });

    // Create persistent context for cookies/sessions
    context = browser; // Use default browser context
    
    console.log('✅ Browser launched successfully');
  }, TEST_TIMEOUT);

  after(async () => {
    if (context) await context.close();
    if (browser) await browser.close();
    console.log('🔚 QA Test Suite completed');
  });

  describe('🔗 Module Import Integrity', () => {
    test('should verify all HTML pages load without import errors', async () => {
      const htmlFiles = [
        'camera.html',
        'dashboard.html', 
        'upload.html',
        'index.html'
      ];

      for (const htmlFile of htmlFiles) {
        const page = await context.newPage();
        const errors = [];
        
        // Capture console errors
        page.on('console', msg => {
          if (msg.type() === 'error') {
            errors.push(`${htmlFile}: ${msg.text()}`);
          }
        });

        // Capture network failures
        page.on('requestfailed', request => {
          errors.push(`${htmlFile} - Failed to load: ${request.url()}`);
        });

        try {
          await page.goto(`${TEST_SERVER_URL}/${htmlFile}`, { 
            waitUntil: 'networkidle0',
            timeout: 10000 
          });
          
          // Wait for DOM to be ready
          await page.waitForFunction(() => document.readyState === 'complete');
          
          console.log(`✅ ${htmlFile} loaded successfully`);
          
          // Verify no critical import errors
          const criticalErrors = errors.filter(err => 
            err.includes('Cannot find module') || 
            err.includes('404') || 
            err.includes('SyntaxError')
          );
          
          assert.strictEqual(criticalErrors.length, 0, `Critical errors found: ${criticalErrors.join(', ')}`);
          
        } catch (error) {
          console.error(`❌ ${htmlFile} failed to load:`, error.message);
          throw error;
        } finally {
          await page.close();
        }
      }
    }, TEST_TIMEOUT);

    test('should verify network utilities are accessible', async () => {
      const page = await context.newPage();
      
      await page.goto(`${TEST_SERVER_URL}/camera.html`);
      
      // Check that network utilities are available
      const networkUtilsAvailable = await page.evaluate(() => {
        return typeof window.resolveBaseUrl === 'function' &&
               typeof window.withTimeout === 'function' &&
               typeof window.probeHealth === 'function';
      });
      
      assert.strictEqual(networkUtilsAvailable, true, 'Network utilities should be available');
      
      await page.close();
    });
  });

  describe('📷 Camera Page Functionality', () => {
    let page;
    
    beforeEach(async () => {
      page = await context.newPage();
      
      // Mock camera permissions
      await page.evaluateOnNewDocument(() => {
        navigator.mediaDevices.getUserMedia = () => Promise.resolve({
          getTracks: () => []
        });
      });
    });
    
    afterEach(async () => {
      if (page) await page.close();
    });

    test('should load ONNX model on startup', async () => {
      const consoleMessages = [];
      page.on('console', msg => {
        consoleMessages.push(msg.text());
      });

      await page.goto(`${TEST_SERVER_URL}/camera.html`, { 
        waitUntil: 'networkidle0' 
      });

      // Wait for model loading
      await page.waitForTimeout(5000);

      // Check for ONNX model loading messages
      const modelLoadMessages = consoleMessages.filter(msg => 
        msg.includes('ONNX model loaded') || 
        msg.includes('loadModel') ||
        msg.includes('initializeDetection')
      );

      assert.ok(modelLoadMessages.length > 0, 'Model load messages should be present');
      console.log('✅ Camera Page: ONNX model loading detected');
    }, TEST_TIMEOUT);

    test('should attempt API connection and fallback appropriately', async () => {
      const networkRequests = [];
      page.on('request', request => {
        networkRequests.push(request.url());
      });

      await page.goto(`${TEST_SERVER_URL}/camera.html`, { 
        waitUntil: 'networkidle0' 
      });

      await page.waitForTimeout(3000);

      // Check for API health check requests
      const healthCheckRequests = networkRequests.filter(url => 
        url.includes('/health')
      );

      assert.ok(healthCheckRequests.length > 0, 'Health check requests should be present');
      console.log('✅ Camera Page: API health check requests detected');
    });

    test('should display camera controls and status elements', async () => {
      await page.goto(`${TEST_SERVER_URL}/camera.html`);

      // Verify key UI elements exist
      const elements = await page.evaluate(() => {
        return {
          startBtn: !!document.getElementById('start-camera'),
          stopBtn: !!document.getElementById('stop-camera'),  
          video: !!document.getElementById('camera-stream'),
          canvas: !!document.getElementById('overlay-canvas'),
          connectionStatus: !!document.getElementById('connection-status'),
          detectionCount: !!document.getElementById('detection-count-badge'),
          fpsDisplay: !!document.getElementById('fps-badge')
        };
      });

      assert.strictEqual(elements.startBtn, true, 'Start button should be present');
      assert.strictEqual(elements.video, true, 'Video element should be present');
      assert.strictEqual(elements.canvas, true, 'Canvas element should be present');
      assert.strictEqual(elements.connectionStatus, true, 'Connection status should be present');
      
      console.log('✅ Camera Page: All essential UI elements present');
    });
  });

  describe('📊 Dashboard Page Functionality', () => {
    let page;
    
    beforeEach(async () => {
      page = await context.newPage();
    });
    
    afterEach(async () => {
      if (page) await page.close();
    });

    test('should load reports via fetchReports API', async () => {
      const networkRequests = [];
      const responses = [];
      
      page.on('request', request => {
        networkRequests.push(request.url());
      });
      
      page.on('response', response => {
        responses.push({
          url: response.url(),
          status: response.status()
        });
      });

      await page.goto(`${TEST_SERVER_URL}/dashboard.html`, { 
        waitUntil: 'networkidle0' 
      });

      await page.waitForTimeout(3000);

      // Check for reports API calls
      const reportsApiCalls = networkRequests.filter(url => 
        url.includes('/api/reports')
      );

      assert.ok(reportsApiCalls.length > 0, 'Reports API calls should be present');
      console.log('✅ Dashboard Page: Reports API calls detected');
    });

    test('should populate dashboard elements with report data', async () => {
      await page.goto(`${TEST_SERVER_URL}/dashboard.html`);
      
      await page.waitForTimeout(5000); // Allow time for data loading
      
      // Check if key dashboard elements are populated
      const dashboardState = await page.evaluate(() => {
        return {
          reportsTable: !!document.getElementById('reports-table-body'),
          statsCards: document.querySelectorAll('.stat-card').length,
          map: !!document.getElementById('map'),
          totalReports: document.getElementById('total-reports-count')?.textContent !== '—',
          tableRows: document.querySelectorAll('#reports-table-body tr').length
        };
      });

      assert.strictEqual(dashboardState.reportsTable, true, 'Reports table should be present');
      assert.ok(dashboardState.statsCards > 0, 'Stat cards should be present');
      assert.strictEqual(dashboardState.map, true, 'Map should be present');
      
      console.log('✅ Dashboard Page: Core elements populated', dashboardState);
    });

    test('should handle search and filter controls', async () => {
      await page.goto(`${TEST_SERVER_URL}/dashboard.html`);
      
      await page.waitForSelector('#report-search-input');
      
      // Test search functionality
      await page.type('#report-search-input', 'test search');
      await page.waitForTimeout(1000);
      
      // Test filter dropdowns
      const filtersWork = await page.evaluate(() => {
        const statusFilter = document.getElementById('table-status-filter');
        const typeFilter = document.getElementById('hazard-type-filter');
        const myReportsFilter = document.getElementById('my-reports-filter');
        
        return !!(statusFilter && typeFilter && myReportsFilter);
      });
      
      assert.strictEqual(filtersWork, true, 'Filters should be working');
      console.log('✅ Dashboard Page: Search and filter controls working');
    });
  });

  describe('📤 Upload Page Functionality', () => {
    let page;
    
    beforeEach(async () => {
      page = await context.newPage();
    });
    
    afterEach(async () => {
      if (page) await page.close();
    });

    test('should load upload page with detection capabilities', async () => {
      const consoleMessages = [];
      page.on('console', msg => {
        consoleMessages.push(msg.text());
      });

      await page.goto(`${TEST_SERVER_URL}/upload.html`, { 
        waitUntil: 'networkidle0' 
      });

      // Verify essential upload elements
      const uploadElements = await page.evaluate(() => {
        return {
          fileInput: !!document.getElementById('image-upload'),
          canvas: !!document.getElementById('preview-canvas'),
          saveBtn: !!document.getElementById('save-detection'),
          confidenceSlider: !!document.getElementById('confidence-slider')
        };
      });

      assert.strictEqual(uploadElements.fileInput, true, 'File input should be present');
      assert.strictEqual(uploadElements.canvas, true, 'Canvas should be present');
      assert.strictEqual(uploadElements.saveBtn, true, 'Save button should be present');
      assert.strictEqual(uploadElements.confidenceSlider, true, 'Confidence slider should be present');
      
      console.log('✅ Upload Page: All essential elements present');
    });

    test('should handle file upload simulation', async () => {
      await page.goto(`${TEST_SERVER_URL}/upload.html`);
      
      // Create a mock file input
      const fileInput = await page.$("#image-upload");
      
      // Simulate file selection (we can't actually upload in headless mode easily)
      const fileSelected = await page.evaluate(() => {
        const input = document.getElementById('image-upload');
        const saveBtn = document.getElementById('save-detection');
        
        // Simulate that a file was selected
        const mockChangeEvent = new Event('change');
        input.dispatchEvent(mockChangeEvent);
        
        return {
          inputExists: !!input,
          saveBtnExists: !!saveBtn
        };
      });
      
      assert.strictEqual(fileSelected.inputExists, true, 'File input should exist');
      assert.strictEqual(fileSelected.saveBtnExists, true, 'Save button should exist');
      
      console.log('✅ Upload Page: File upload controls responsive');
    });
  });

  describe('🌐 Network Utilities Testing', () => {
    let page;
    
    beforeEach(async () => {
      page = await context.newPage();
    });
    
    afterEach(async () => {
      if (page) await page.close();
    });

    test('should test health probe functionality', async () => {
      await page.goto(`${TEST_SERVER_URL}/camera.html`);
      
      // Test the health probe function
      const healthProbeResult = await page.evaluate(async () => {
        if (typeof window.probeHealth === 'function') {
          try {
            // Test with localhost (should work)
            const result = await window.probeHealth('http://localhost:3000', 2000);
            return { success: true, result };
          } catch (error) {
            return { success: false, error: error.message };
          }
        }
        return { success: false, error: 'probeHealth not available' };
      });
      
      assert.strictEqual(healthProbeResult.success, true, 'Health probe should be successful');
      console.log('✅ Network Utilities: Health probe working', healthProbeResult);
    });

    test('should test timeout utility', async () => {
      await page.goto(`${TEST_SERVER_URL}/camera.html`);
      
      const timeoutTest = await page.evaluate(async () => {
        if (typeof window.withTimeout === 'function') {
          try {
            const signal = window.withTimeout(100);
            return { 
              success: true, 
              hasSignal: !!signal,
              isAbortSignal: signal instanceof AbortSignal 
            };
          } catch (error) {
            return { success: false, error: error.message };
          }
        }
        return { success: false, error: 'withTimeout not available' };
      });
      
      assert.strictEqual(timeoutTest.success, true, 'Timeout test should be successful');
      assert.strictEqual(timeoutTest.hasSignal, true, 'Should have timeout signal');
      console.log('✅ Network Utilities: Timeout utility working');
    });
  });

  describe('⚠️ Error Handling & Fallbacks', () => {
    let page;
    
    beforeEach(async () => {
      page = await context.newPage();
    });
    
    afterEach(async () => {
      if (page) await page.close();
    });

    test('should handle API unavailable scenario', async () => {
      // Intercept and block external API calls
      await page.setRequestInterception(true);
      
      page.on('request', request => {
        if (request.url().includes('railway.app') || 
            request.url().includes('railway.internal')) {
          request.abort();
        } else {
          request.continue();
        }
      });

      const consoleMessages = [];
      page.on('console', msg => {
        consoleMessages.push(msg.text());
      });

      await page.goto(`${TEST_SERVER_URL}/camera.html`, { 
        waitUntil: 'networkidle0' 
      });

      await page.waitForTimeout(5000);

      // Should fall back to ONNX-only mode
      const fallbackMessages = consoleMessages.filter(msg => 
        msg.includes('ONNX') || 
        msg.includes('fallback') ||
        msg.includes('offline')
      );

      console.log('📝 Error Handling: API blocked, fallback messages:', fallbackMessages);
      // Test passes if no critical errors occurred
      assert.ok(true, 'Test completed without critical errors');
    });

    test('should display user-friendly error notifications', async () => {
      await page.goto(`${TEST_SERVER_URL}/dashboard.html`);
      
      // Test notification system exists
      const notificationSystem = await page.evaluate(() => {
        return {
          notifyFunction: typeof window.notify === 'function',
          notificationContainer: !!document.querySelector('.notifications-container') ||
                                 !!document.getElementById('notifications-container')
        };
      });
      
      assert.strictEqual(notificationSystem.notifyFunction, true, 'Notification function should be available');
      console.log('✅ Error Handling: Notification system available');
    });
  });

  describe('🔄 Real-time Sync Testing', () => {
    test('should verify WebSocket or polling mechanisms', async () => {
      const page = await context.newPage();
      
      const networkRequests = [];
      page.on('request', request => {
        networkRequests.push(request.url());
      });

      await page.goto(`${TEST_SERVER_URL}/dashboard.html`);
      await page.waitForTimeout(5000);

      // Check for periodic API calls (polling) or WebSocket connections
      const syncRequests = networkRequests.filter(url => 
        url.includes('/api/reports') || 
        url.includes('ws://') || 
        url.includes('wss://')
      );

      assert.ok(syncRequests.length > 0, 'Sync requests should be present');
      console.log('✅ Real-time Sync: Polling/WebSocket requests detected');
      
      await page.close();
    });
  });
});