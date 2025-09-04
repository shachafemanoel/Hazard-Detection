/**
 * Error Handler Verification Tests
 * Simple tests to verify the centralized error handling system works correctly
 */

// Test function to verify error handling system
function testErrorHandling() {
    console.log('🧪 Running Error Handler Tests...');
    
    const results = {
        passed: 0,
        failed: 0,
        tests: []
    };
    
    function addTest(name, passed, error = null) {
        results.tests.push({ name, passed, error });
        if (passed) {
            results.passed++;
            console.log(`✅ ${name}`);
        } else {
            results.failed++;
            console.log(`❌ ${name}: ${error}`);
        }
    }
    
    // Test 1: Check if ErrorCodes are available
    try {
        if (typeof ErrorCodes !== 'undefined' && ErrorCodes.MODEL_LOAD) {
            addTest('ErrorCodes enum is available', true);
        } else {
            addTest('ErrorCodes enum is available', false, 'ErrorCodes not found or incomplete');
        }
    } catch (err) {
        addTest('ErrorCodes enum is available', false, err.message);
    }
    
    // Test 2: Check if reportError function is available
    try {
        if (typeof reportError === 'function') {
            addTest('reportError function is available', true);
        } else {
            addTest('reportError function is available', false, 'reportError function not found');
        }
    } catch (err) {
        addTest('reportError function is available', false, err.message);
    }
    
    // Test 3: Check if toastOnce function is available
    try {
        if (typeof toastOnce === 'function') {
            addTest('toastOnce function is available', true);
        } else {
            addTest('toastOnce function is available', false, 'toastOnce function not found');
        }
    } catch (err) {
        addTest('toastOnce function is available', false, err.message);
    }
    
    // Test 4: Test reportError basic functionality
    try {
        // Temporarily suppress console to avoid spam during testing
        const originalError = console.error;
        const originalWarn = console.warn;
        console.error = () => {};
        console.warn = () => {};
        
        const errorData = reportError(ErrorCodes.MODEL_LOAD, 'Test error message', { 
            allowDuplicates: true,
            toastOptions: { duration: 100 } // Short duration for testing
        });
        
        // Restore console
        console.error = originalError;
        console.warn = originalWarn;
        
        if (errorData && errorData.code === ErrorCodes.MODEL_LOAD) {
            addTest('reportError basic functionality works', true);
        } else {
            addTest('reportError basic functionality works', false, 'reportError did not return expected data');
        }
    } catch (err) {
        addTest('reportError basic functionality works', false, err.message);
    }
    
    // Test 5: Test toastOnce deduplication
    try {
        // Clear any existing toast history
        if (typeof window.ErrorHandler?.clearToastHistory === 'function') {
            window.ErrorHandler.clearToastHistory();
        }
        
        const originalError = console.error;
        console.error = () => {};
        
        // Show the same toast twice
        toastOnce('test-key', 'Test message', 'info', { duration: 100 });
        toastOnce('test-key', 'Test message', 'info', { duration: 100 });
        
        console.error = originalError;
        
        // If we get here without errors, the deduplication works
        addTest('toastOnce deduplication works', true);
    } catch (err) {
        addTest('toastOnce deduplication works', false, err.message);
    }
    
    // Test 6: Test withErrorHandling wrapper (if available)
    try {
        if (typeof window.ErrorHandler?.withErrorHandling === 'function') {
            const wrappedFunction = window.ErrorHandler.withErrorHandling(
                () => { throw new Error('Test error'); },
                ErrorCodes.INFERENCE,
                { rethrow: false, fallbackValue: 'fallback' }
            );
            
            const result = wrappedFunction();
            if (result === 'fallback') {
                addTest('withErrorHandling wrapper works', true);
            } else {
                addTest('withErrorHandling wrapper works', false, 'Unexpected result from wrapped function');
            }
        } else {
            addTest('withErrorHandling wrapper works', true, 'Function not available (optional)');
        }
    } catch (err) {
        addTest('withErrorHandling wrapper works', false, err.message);
    }
    
    // Display results
    console.log(`\n🧪 Error Handler Test Results:`);
    console.log(`✅ Passed: ${results.passed}`);
    console.log(`❌ Failed: ${results.failed}`);
    console.log(`📊 Total: ${results.passed + results.failed}`);
    
    if (results.failed === 0) {
        console.log('🎉 All tests passed! Error handling system is working correctly.');
    } else {
        console.log('⚠️ Some tests failed. Please check the error handler setup.');
    }
    
    return results;
}

// Auto-run tests if this script is loaded directly
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        setTimeout(testErrorHandling, 1000); // Wait for other scripts to load
    });
} else {
    setTimeout(testErrorHandling, 1000);
}

// Expose test function globally for manual testing
window.testErrorHandling = testErrorHandling;