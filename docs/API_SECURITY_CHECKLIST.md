# MedChain API Security Checklist

## Verified
- [x] Backend test suite: 11 tests passed
- [x] Smart contract suite: 26 tests passed
- [x] SIWE signature rejection coverage
- [x] Git working tree was clean before this documentation update

## Security checks to complete
- [ ] Reject malformed wallet addresses
- [ ] Reject missing authentication fields
- [ ] Reject malformed signatures and invalid nonces
- [ ] Validate batch IDs and Merkle proof inputs
- [ ] Validate pagination parameters and enforce limits
- [ ] Verify demo routes remain disabled when DEMO_MODE=false

## Rule
Only mark a security check complete after its corresponding test passes.
