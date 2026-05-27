# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Initial TypeScript port of the CPI MCP server (43 OData-backed tools across 8 modules).
- npm package `@linusdevx/cpi-mcp-server` published with `bin: cpi-mcp`.

### Notes
- Port forked from the internal Python MCP server reference; behavioral parity is the v0.1 goal.
- Composite tools and the local-iFlow-workflow layer (`core/`) from the Python source are not ported.
