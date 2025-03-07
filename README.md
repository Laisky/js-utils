# Laisky Utils

A comprehensive utility library for React and JavaScript applications with database, DOM, cryptography, caching, and other utilities.

## Installation

```bash
npm install @laisky/js-utils
```

## Usage

```javascript
// Import everything
import laiskyUtils from "laisky-utils";

// Or import specific modules
import { KvSet, KvGet } from "laisky-utils";
import { formatRelativeTime } from "laisky-utils";

// Example usage
const timestamp = new Date();
console.log(formatRelativeTime(timestamp)); // "just now"

// Using the database utilities
await KvSet("myKey", { foo: "bar" });
const value = await KvGet("myKey");
```

## API Reference

### Database Operations

- `KvSet(key, value)` - Store data in IndexedDB
- `KvGet(key)` - Retrieve data from IndexedDB
- `KvExists(key)` - Check if key exists
- `KvDel(key)` - Delete a key

### Caching

- `SetCache(key, value, ttlSeconds)` - Cache with TTL
- `GetCache(key)` - Get from cache

### DOM Utilities

- `LoadJsModules(urls, type)` - Load JS scripts dynamically
- `EnableTooltipsEverywhere()` - Initialize Bootstrap tooltips
- `waitElementReady(selector, maxWaitMs)` - Wait for element to appear

### Cryptography

- `SHA256(str)` - Calculate SHA-256 hash
- `getSHA1(str)` - Calculate SHA-1 hash

### Markdown

- `Markdown2HTML(markdown)` - Convert markdown to HTML

### String Utilities

- `TrimSpace(str)` - Trim whitespace
- `escapeHtml(str)` - Escape HTML special characters
- `formatRelativeTime(timestamp)` - Format as relative time

## License

MIT
