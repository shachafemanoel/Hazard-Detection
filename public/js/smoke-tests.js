// ====== HAZARD DETECTION SMOKE TEST SUITE ======
// Global test runner and consolidated test interface
// Usage: window.HDTests.runAllTests() or individual tests

(function() {
  'use strict';
  
  // Initialize global test namespace
  if (!window.HDTests) {
    window.HDTests = {};
  }
  
  // Test results aggregation
  function aggregateResults(allResults) {
    const aggregated = {
      passed: 0,
      failed: 0,
      total: 0,
      tests: [],
      suites: []
    };
    
    allResults.forEach(result => {
      aggregated.passed += result.passed;
      aggregated.failed += result.failed;
      aggregated.total += (result.passed + result.failed);
      aggregated.tests.push(...result.tests);
      aggregated.suites.push(result.suiteName || 'Unknown Suite');
    });
    
    return aggregated;
  }
  
  // Run all available smoke tests
  window.HDTests.runAllTests = async function() {
    console.log("🔧 STARTING HAZARD DETECTION SMOKE TEST SUITE 🔧");
    console.log("==================================================");
    
    const allResults = [];
    const startTime = performance.now();
    
    // Run camera tests if available
    if (window.HDTests.selfTestCamera) {
      console.log("\n📹 Running camera tests...");
      try {
        const cameraResults = await window.HDTests.selfTestCamera();
        cameraResults.suiteName = "Camera Tests";
        allResults.push(cameraResults);
      } catch (err) {
        console.error("❌ Camera tests failed:", err);
        allResults.push({
          passed: 0,
          failed: 1,
          tests: [{name: "Camera test execution", status: "FAIL", error: err.message}],
          suiteName: "Camera Tests"
        });
      }
    }
    
    // Run upload tests if available
    if (window.HDTests.selfTestUpload) {
      console.log("\n📤 Running upload tests...");
      try {
        const uploadResults = await window.HDTests.selfTestUpload();
        uploadResults.suiteName = "Upload Tests";
        allResults.push(uploadResults);
      } catch (err) {
        console.error("❌ Upload tests failed:", err);
        allResults.push({
          passed: 0,
          failed: 1,
          tests: [{name: "Upload test execution", status: "FAIL", error: err.message}],
          suiteName: "Upload Tests"
        });
      }
    }
    
    // Run upload workflow tests if available
    if (window.HDTests.testUploadWorkflow) {
      console.log("\n🔄 Running upload workflow tests...");
      try {
        const workflowResults = await window.HDTests.testUploadWorkflow();
        workflowResults.suiteName = "Upload Workflow Tests";
        allResults.push(workflowResults);
      } catch (err) {
        console.error("❌ Upload workflow tests failed:", err);
        allResults.push({
          passed: 0,
          failed: 1,
          tests: [{name: "Upload workflow test execution", status: "FAIL", error: err.message}],
          suiteName: "Upload Workflow Tests"
        });
      }
    }
    
    const endTime = performance.now();
    const duration = Math.round(endTime - startTime);
    
    // Aggregate and display final results
    const aggregated = aggregateResults(allResults);
    
    console.log("\n🎯 OVERALL TEST RESULTS 🎯");
    console.log("===========================");
    console.log(`✅ Total Passed: ${aggregated.passed}`);
    console.log(`❌ Total Failed: ${aggregated.failed}`);
    console.log(`📊 Total Tests: ${aggregated.total}`);
    console.log(`⏱️ Duration: ${duration}ms`);
    console.log(`📦 Test Suites: ${aggregated.suites.join(", ")}`);
    
    if (aggregated.failed === 0) {
      console.log("\n🎉 ALL TESTS PASSED! System is ready for use.");
    } else {
      console.log(`\n⚠️ ${aggregated.failed} test(s) failed. Check individual test results above.`);
    }
    
    return aggregated;
  };
  
  // Quick system check - essential functionality only
  window.HDTests.quickCheck = async function() {
    console.log("⚡ Running quick system check...");
    
    const checks = [];
    
    // Essential browser APIs
    checks.push({
      name: "getUserMedia API",
      test: () => !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia),
      critical: true
    });
    
    checks.push({
      name: "Canvas 2D support",
      test: () => {
        const canvas = document.createElement("canvas");
        return !!(canvas && canvas.getContext && canvas.getContext("2d"));
      },
      critical: true
    });
    
    checks.push({
      name: "File API support",
      test: () => !!(window.File && window.FileReader && window.Blob),
      critical: true
    });
    
    checks.push({
      name: "ONNX Runtime loaded",
      test: () => !!window.ort,
      critical: true
    });
    
    checks.push({
      name: "Geolocation API",
      test: () => !!navigator.geolocation,
      critical: false
    });
    
    checks.push({
      name: "EXIF library loaded",
      test: () => !!window.EXIF,
      critical: false
    });
    
    let passed = 0;
    let failed = 0;
    let criticalFailed = 0;
    
    console.log("🔍 Quick Check Results:");
    checks.forEach((check, index) => {
      try {
        const result = check.test();
        if (result) {
          console.log(`${index + 1}. ✅ ${check.name}`);
          passed++;
        } else {
          const symbol = check.critical ? "🚨" : "⚠️";
          console.log(`${index + 1}. ${symbol} ${check.name} ${check.critical ? "(CRITICAL)" : "(Optional)"}`);
          failed++;
          if (check.critical) criticalFailed++;
        }
      } catch (err) {
        const symbol = check.critical ? "🚨" : "⚠️";
        console.log(`${index + 1}. ${symbol} ${check.name} - Error: ${err.message} ${check.critical ? "(CRITICAL)" : "(Optional)"}`);
        failed++;
        if (check.critical) criticalFailed++;
      }
    });
    
    console.log(`\n📊 Quick Check Summary: ${passed} passed, ${failed} failed`);
    
    if (criticalFailed === 0) {
      console.log("✅ All critical components are working!");
      return true;
    } else {
      console.log(`🚨 ${criticalFailed} critical component(s) failed!`);
      return false;
    }
  };
  
  // Individual test runners (to be populated by other scripts)
  window.HDTests.listAvailableTests = function() {
    console.log("📋 Available Tests:");
    console.log("==================");
    
    const tests = [];
    if (window.HDTests.selfTestCamera) tests.push("selfTestCamera - Basic camera functionality");
    if (window.HDTests.runSmokeTestCamera) tests.push("runSmokeTestCamera - Formatted camera test output");
    if (window.HDTests.selfTestUpload) tests.push("selfTestUpload - Basic upload functionality");
    if (window.HDTests.runSmokeTestUpload) tests.push("runSmokeTestUpload - Formatted upload test output");
    if (window.HDTests.testUploadWorkflow) tests.push("testUploadWorkflow - Upload workflow validation");
    if (window.HDTests.runAllTests) tests.push("runAllTests - Complete test suite");
    if (window.HDTests.quickCheck) tests.push("quickCheck - Essential functionality check");
    
    if (tests.length === 0) {
      console.log("⚠️ No tests available. Make sure test scripts are loaded.");
    } else {
      tests.forEach((test, index) => {
        console.log(`${index + 1}. window.HDTests.${test}`);
      });
    }
    
    console.log("\n💡 Usage examples:");
    console.log("  window.HDTests.runAllTests()     - Run complete test suite");
    console.log("  window.HDTests.quickCheck()      - Quick system check");
    console.log("  window.HDTests.selfTestCamera()  - Camera tests only");
    console.log("  window.HDTests.selfTestUpload()  - Upload tests only");
    
    return tests;
  };
  
  // Help function
  window.HDTests.help = function() {
    console.log("🆘 HAZARD DETECTION TEST SUITE HELP 🆘");
    console.log("=======================================");
    console.log("This test suite helps verify that the hazard detection system");
    console.log("is working properly by testing camera, upload, and AI model functionality.");
    console.log("");
    console.log("🔧 Main Commands:");
    console.log("  window.HDTests.runAllTests()        - Run all available tests");
    console.log("  window.HDTests.quickCheck()         - Quick essential functionality check");
    console.log("  window.HDTests.listAvailableTests() - Show all available test functions");
    console.log("  window.HDTests.help()               - Show this help message");
    console.log("");
    console.log("📱 Individual Test Suites:");
    console.log("  window.HDTests.selfTestCamera()     - Camera functionality tests");
    console.log("  window.HDTests.selfTestUpload()     - Upload functionality tests");
    console.log("  window.HDTests.testUploadWorkflow() - Upload workflow validation");
    console.log("");
    console.log("💡 Tips:");
    console.log("  - Run quickCheck() first to verify essential functionality");
    console.log("  - Use runAllTests() for comprehensive system validation");
    console.log("  - Check browser console for detailed test output");
    console.log("  - Tests are designed to be non-destructive and safe to run");
    console.log("");
    console.log("🐛 If tests fail, check:");
    console.log("  - Camera permissions in browser");
    console.log("  - Network connectivity for model loading");
    console.log("  - Console errors for specific failure details");
  };
  
  // Initialize message
  console.log("🔧 Hazard Detection Test Suite loaded!");
  console.log("Run window.HDTests.help() for usage information.");
  
})();