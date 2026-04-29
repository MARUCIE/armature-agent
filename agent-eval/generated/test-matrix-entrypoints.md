# Test Matrix Entrypoints

Generated from `agent-eval/manifests/test-matrix.json`.

```bash
npm run test:static
npm run test:unit
npm run test:contract
npm run test:integration
npm run test:e2e
npm run test:security
npm run test:performance
npm run test:resilience
npm run test:ai-eval-fast
npm run test:matrix
npm run test:matrix:sync
```

| Script | Layer | Threshold | Owner |
| --- | --- | --- | --- |
| `test:static` | Static | All configured static checks exit 0 | Maintainer / release gate |
| `test:unit` | Unit | 0 failed tests | Core runtime |
| `test:contract` | Contract | 0 failed tests | CLI / public surface |
| `test:integration` | Integration | 0 failed tests | Runtime + storage |
| `test:e2e` | E2E | 0 failed tests | Operator workflow |
| `test:security` | Security | 0 failed tests and 0 prod audit vulnerabilities | Security gate |
| `test:performance` | Performance | bench score=100 and 0 failed tests | Bench / release gate |
| `test:resilience` | Resilience | 0 failed tests | Runtime recovery |
| `test:ai-eval-fast` | AI Eval | fast gate summary ok=true | agent-eval gate |
| `test:matrix` | All configured layers | See manifest | Maintainer / release gate |
| `test:matrix:sync` | Sync check | package/scripts/snippet must match manifest | Maintainer / release gate |
