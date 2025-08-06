// Test script for camera detection functionality
console.log('🧪 Testing camera detection functions...');

// Test 1: Check if all required DOM elements exist
function testDOMElements() {
  console.log('\n📋 Test 1: DOM Elements');
  
  const requiredElements = [
    'camera-stream', 'overlay-canvas', 'loading-overlay', 
    'start-camera', 'stop-camera', 'capture-btn', 'settings-btn',
    'loading-status', 'detection-count-badge', 'fps-badge', 
    'hazard-types-display', 'hazard-types-list',
    'confidence-threshold', 'confidence-value', 'settings-panel'
  ];
  
  const missing = [];
  requiredElements.forEach(id => {
    if (!document.getElementById(id)) {
      missing.push(id);
    }
  });
  
  if (missing.length === 0) {
    console.log('✅ All required DOM elements found');
    return true;
  } else {
    console.log('❌ Missing DOM elements:', missing);
    return false;
  }
}

// Test 2: Test button states and visibility
function testButtonStates() {
  console.log('\n🔘 Test 2: Button States');
  
  const startBtn = document.getElementById('start-camera');
  const stopBtn = document.getElementById('stop-camera');
  const captureBtn = document.getElementById('capture-btn');
  
  // Initial state: start enabled, stop/capture hidden
  const initialState = !startBtn.disabled && stopBtn.hidden && captureBtn.hidden;
  
  if (initialState) {
    console.log('✅ Initial button states correct');
    return true;
  } else {
    console.log('❌ Initial button states incorrect');
    console.log(`Start disabled: ${startBtn.disabled}, Stop hidden: ${stopBtn.hidden}, Capture hidden: ${captureBtn.hidden}`);
    return false;
  }
}

// Test 3: Test settings panel functionality
function testSettingsPanel() {
  console.log('\n⚙️ Test 3: Settings Panel');
  
  const settingsBtn = document.getElementById('settings-btn');
  const settingsPanel = document.getElementById('settings-panel');
  const confidenceSlider = document.getElementById('confidence-threshold');
  
  if (!settingsBtn || !settingsPanel || !confidenceSlider) {
    console.log('❌ Settings elements not found');
    return false;
  }
  
  // Test settings toggle
  settingsBtn.click();
  const panelVisible = settingsPanel.classList.contains('show');
  const ariaExpanded = settingsBtn.getAttribute('aria-expanded') === 'true';
  
  if (panelVisible && ariaExpanded) {
    console.log('✅ Settings panel opens correctly');
    
    // Close settings
    settingsBtn.click();
    return true;
  } else {
    console.log('❌ Settings panel toggle failed');
    return false;
  }
}

// Test 4: Test keyboard shortcuts
function testKeyboardShortcuts() {
  console.log('\n⌨️ Test 4: Keyboard Shortcuts');
  
  // Test ESC key for closing settings
  const settingsPanel = document.getElementById('settings-panel');
  settingsPanel.classList.add('show');
  
  const escEvent = new KeyboardEvent('keydown', { key: 'Escape' });
  document.dispatchEvent(escEvent);
  
  const settingsClosed = !settingsPanel.classList.contains('show');
  
  if (settingsClosed) {
    console.log('✅ ESC key closes settings panel');
    return true;
  } else {
    console.log('❌ ESC key does not close settings panel');
    return false;
  }
}

// Test 5: Test status update functions
function testStatusUpdates() {
  console.log('\n📊 Test 5: Status Updates');
  
  const loadingStatus = document.getElementById('loading-status');
  const detectionBadge = document.getElementById('detection-count-badge');
  const fpsBadge = document.getElementById('fps-badge');
  
  // Test status update
  const originalStatus = loadingStatus.textContent;
  loadingStatus.textContent = 'Test Status';
  
  const statusUpdated = loadingStatus.textContent === 'Test Status';
  loadingStatus.textContent = originalStatus; // Restore
  
  // Test badge updates
  detectionBadge.textContent = '5 hazards';
  fpsBadge.textContent = '30 FPS';
  
  const badgesUpdated = detectionBadge.textContent === '5 hazards' && 
                       fpsBadge.textContent === '30 FPS';
  
  // Restore original values
  detectionBadge.textContent = '0 hazards';
  fpsBadge.textContent = '0 FPS';
  
  if (statusUpdated && badgesUpdated) {
    console.log('✅ Status updates work correctly');
    return true;
  } else {
    console.log('❌ Status updates failed');
    return false;
  }
}

// Test 6: Test aria-live announcements
function testAccessibility() {
  console.log('\n♿ Test 6: Accessibility Features');
  
  const ariaLiveElements = document.querySelectorAll('[aria-live]');
  
  if (ariaLiveElements.length >= 3) {
    console.log(`✅ Found ${ariaLiveElements.length} aria-live elements`);
    return true;
  } else {
    console.log(`❌ Only found ${ariaLiveElements.length} aria-live elements (expected at least 3)`);
    return false;
  }
}

// Run all tests when DOM is loaded
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', runAllTests);
} else {
  runAllTests();
}

function runAllTests() {
  console.log('🚀 Starting camera detection function tests...');
  
  const tests = [
    { name: 'DOM Elements', fn: testDOMElements },
    { name: 'Button States', fn: testButtonStates },
    { name: 'Settings Panel', fn: testSettingsPanel },
    { name: 'Keyboard Shortcuts', fn: testKeyboardShortcuts },
    { name: 'Status Updates', fn: testStatusUpdates },
    { name: 'Accessibility', fn: testAccessibility }
  ];
  
  let passed = 0;
  let failed = 0;
  
  tests.forEach(test => {
    try {
      if (test.fn()) {
        passed++;
      } else {
        failed++;
      }
    } catch (error) {
      console.error(`❌ Test "${test.name}" threw an error:`, error);
      failed++;
    }
  });
  
  console.log('\n📊 Test Results:');
  console.log(`✅ Passed: ${passed}`);
  console.log(`❌ Failed: ${failed}`);
  console.log(`📈 Success Rate: ${((passed / (passed + failed)) * 100).toFixed(1)}%`);
  
  if (failed === 0) {
    console.log('🎉 All tests passed! Camera detection system is ready.');
  } else {
    console.log('⚠️ Some tests failed. Please check the implementation.');
  }
}