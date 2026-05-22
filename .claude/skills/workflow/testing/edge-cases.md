# Landis Edge Case Tests

Run these manually before App Store submission.

## Network
Test: Turn off WiFi and mobile data
Expected: App shows "No internet connection" 
          not a blank screen or crash

## Rate Limit
Test: Generate 10 CVs in one day
Expected: Clear message saying limit reached
          and when it resets

## Empty Profile  
Test: Create new account with no profile data
Expected: Useful message asking user to 
          complete their profile before generating

## Session Expiry
Test: Leave app unused for 2+ hours then return
Expected: Either still signed in or 
          redirected to sign in screen gracefully

## Large Job Description
Test: Paste a very long job description 
      (5000+ characters)
Expected: App handles it without crashing

## Generation Timeout
Test: Force a timeout by using a bad API key
Expected: Clear error message not a blank screen

## Dark Mode
Test: Toggle dark mode then close and reopen app
Expected: Dark mode preference persists

## Rotation
Test: Rotate phone to landscape
Expected: App stays in portrait (locked)
