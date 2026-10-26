import { describe, expect, it } from 'vitest';
import { validateSlug } from './slug';
describe('validateSlug', () => {
  it('accepts normal slugs', () => { expect(validateSlug('rules')).toBeNull(); expect(validateSlug('school-rules-2026')).toBeNull(); });
  it.each(['admin', 'login', 'blog', 'contact', 'api', 'Rules', 'a b', '../x', '-x', 'x-', 'a//b', ''])('rejects %s', s => expect(validateSlug(s)).not.toBeNull());
});
