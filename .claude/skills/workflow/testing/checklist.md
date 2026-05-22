# Landis Testing Checklist

Run this after every device install.
Mark each item ✅ PASS or ❌ FAIL.

## Core Launch
- [ ] App launches without crash
- [ ] No white screen on launch
- [ ] Bottom tab bar shows 5 tabs:
      Generate, Job Market, History, Profile, Settings

## Authentication  
- [ ] Sign in with email and password works
- [ ] Session persists after closing and reopening app
- [ ] Sign out works

## Generate CV
- [ ] Paste job description into text box
- [ ] Keyboard can be dismissed after typing
- [ ] Generate button is disabled while generating
- [ ] Generation completes without timeout
- [ ] CV downloads as Full_Name_CV.docx
- [ ] Downloaded CV is one page only
- [ ] Work experience shows as: 
      Job Title | Company, Location
- [ ] No raw HTML in job description

## History
- [ ] Past generations appear in list
- [ ] Tapping a generation opens detail screen
- [ ] Back button returns to History tab not Generate
- [ ] Download CV button present and works
- [ ] No flash of wrong content when opening detail

## Job Market
- [ ] Job cards load correctly
- [ ] Tapping Generate CV prefills job description
- [ ] No raw HTML in job descriptions from API

## Profile
- [ ] Personal details load correctly
- [ ] Full name is editable and saves
- [ ] Work experience can be added and edited
- [ ] Education shows Start/End month and year
- [ ] Skills can be added and deleted
- [ ] No Achievements section visible

## Settings
- [ ] Full name displayed and editable
- [ ] Email displayed but not editable
- [ ] No "Contact support" message visible
- [ ] Dark mode toggle works
- [ ] Theme persists after closing app

## Edge Cases
- [ ] Rate limit message shows after 10 generations
- [ ] Empty profile shows useful message 
      before generating
- [ ] Very long job description does not crash
- [ ] Generation timeout shows clear error message
