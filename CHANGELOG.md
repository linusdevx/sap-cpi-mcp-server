# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.0] - 2026-09-15

### Added
- Initial TypeScript MCP server for SAP CPI (47 OData-backed tools across 9 modules).
- npm package `@linusdevx/cpi-mcp-server` published with `bin: cpi-mcp-server`.
- Messaging module: `get_messaging_queues`, `get_messaging_messages`, `retry_messaging_messages`, `move_messaging_messages` (new `MessagingQueues`/`MessagingMessages` entity sets + `RetryMessagingMessages`/`MoveMessagingMessages` function imports).
- Updated `cpi_odata_metadata.xml` to reflect current tenant API surface.
