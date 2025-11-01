# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [2.0.0] - 2024-11-01

### Added
- Asynchronous response pattern to prevent Slack's 3-second timeout
- Background processing via `processRequest()` function
- 25-second timeout protection for Osano API calls
- Comprehensive README documentation with setup instructions
- MIT License file
- Enhanced `.gitignore` with comprehensive exclusions
- Request logging for debugging (user and channel info)
- Input validation and data validation
- Better error messages with status text

### Changed
- Responses now use `response_url` for delayed delivery
- Immediate acknowledgment message shows loading state
- Error messages are now delivered to the correct channel
- Updated `package.json` with proper metadata and scripts
- Improved code documentation and comments
- Renamed regex constant to `OSANO_URL_REGEX` for clarity
- Extracted timeout value to `FETCH_TIMEOUT_MS` constant

### Removed
- Express dependency (unused)
- Synchronous response pattern that caused timeouts

### Fixed
- Reliability issues (previously 1-in-10 success rate)
- Responses appearing in wrong channels
- Slack timeout errors after 3 seconds
- Channel routing inconsistencies

## [1.0.0] - Initial Release

### Added
- Basic Slack slash command integration
- Osano configuration fetching
- Configuration summary generation
- Support for account details, compliance mode, frameworks, and assets
- Cookie, script, iframe, and IAB vendor classification display